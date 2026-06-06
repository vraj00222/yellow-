import type { CapsuleStore } from '../core/store';
import type { CapsuleMeta } from '../core/types';
import type { AgentRunner } from '../agents/replicas';
import { triage, rowsAffected, type Severity } from '../triage';
import {
  answerCallback,
  editMessage,
  esc,
  getUpdates,
  sendMessage,
  telegramEnabled,
  type InlineButton,
  type TgUpdate,
} from './telegram';
import { loadNotify, saveNotify, type Approval, type NotifyState } from './store';

/**
 * The crash → triage → Telegram approval loop.
 *
 *  - watcher: polls the capsule store; every NEW crash is triaged, auto-diagnosed
 *    by the AI agent, and pushed to the developer's Telegram with one-tap buttons.
 *  - poller: long-polls Telegram for the developer's taps (approve / reject /
 *    investigate) and free-text follow-ups, and drives the response.
 *
 * "Approve" records the healthy baseline to restore to; the demo app (which owns
 * live state) reads `/api/approvals` and performs the actual heal — keeping the
 * six-method adapter rule intact (only the app writes live state).
 */

interface Deps {
  store: CapsuleStore;
  agent: AgentRunner;
  dashboardUrl: string;
}

let deps: Deps | null = null;

const SEV_ICON: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
};

export function startNotifier(d: Deps): void {
  deps = d;
  void watchLoop();
  if (telegramEnabled()) {
    void pollLoop();
    console.log('[notify] Telegram approval loop active (long-polling).');
  } else {
    console.log('[notify] TELEGRAM_BOT_TOKEN not set — alerts recorded for the dashboard only.');
  }
}

/* ------------------------------------------------------------------ watcher */

async function watchLoop(): Promise<void> {
  await prime(); // mark everything that already exists as seen — only NEW crashes alert
  for (;;) {
    try {
      await watchOnce();
    } catch (e) {
      console.error('[notify] watch error:', (e as Error).message);
    }
    await sleep(3000);
  }
}

async function prime(): Promise<void> {
  const metas = await deps!.store.list();
  const state = await loadNotify();
  for (const m of metas) if (!state.seen.includes(m.id)) state.seen.push(m.id);
  await saveNotify(state);
}

async function watchOnce(): Promise<void> {
  const metas = await deps!.store.list(); // newest first
  const state = await loadNotify();
  // oldest first so a burst of crashes alerts in the order they happened
  for (const meta of [...metas].reverse()) {
    if (!meta.context.error) continue; // healthy snapshot
    if (state.seen.includes(meta.id)) continue;
    state.seen.push(meta.id);
    await saveNotify(state);
    try {
      await alert(meta);
    } catch (e) {
      console.error('[notify] alert failed:', (e as Error).message);
    }
  }
}

function baselineFor(metas: CapsuleMeta[], id: string): CapsuleMeta | null {
  const i = metas.findIndex((m) => m.id === id);
  if (i === -1) return null;
  for (let j = i + 1; j < metas.length; j++) {
    if (!metas[j].context.error) return metas[j];
  }
  return metas[i + 1] ?? null;
}

async function alert(meta: CapsuleMeta): Promise<void> {
  const metas = await deps!.store.list();
  const baseline = baselineFor(metas, meta.id);
  const diff = await deps!.store.diff(baseline ? baseline.id : meta.id, meta.id);
  const rows = rowsAffected(diff);
  const t = triage(meta, rows)!;

  const state = await loadNotify();
  state.approvals[meta.id] = {
    status: 'pending',
    at: new Date().toISOString(),
    category: t.category,
    severity: t.severity,
    restoreTo: baseline?.id,
  };
  await saveNotify(state);

  // AI root-cause + fix (best-effort — never block the alert on the model).
  let diagnosis = '';
  try {
    diagnosis = (await deps!.agent.proposeFix(meta, diff)).explanation;
  } catch (e) {
    console.error('[notify] diagnose failed:', (e as Error).message);
  }

  if (!telegramEnabled() || !state.chatId) return; // recorded for the dashboard; no chat yet

  const msgId = await sendMessage(
    state.chatId,
    alertText(meta, t.severity, t.category, rows, diagnosis),
    approvalButtons(meta.id),
  );
  state.messageIds[meta.id] = msgId;
  await saveNotify(state);
}

function alertText(
  meta: CapsuleMeta,
  severity: Severity,
  category: string,
  rows: number,
  diagnosis: string,
): string {
  const err = meta.context.error!;
  const req = meta.context.request;
  const lines = [
    `${SEV_ICON[severity]} <b>${severity.toUpperCase()}</b> · ${esc(category)}`,
    '',
    `<b>${esc(err.name)}</b>: ${esc(err.message)}`,
  ];
  if (req?.method || req?.url) lines.push(`<code>${esc(`${req.method ?? ''} ${req.url ?? ''}`.trim())}</code>`);
  lines.push(`Rows affected: <b>${rows}</b> · Capsule <code>${esc(meta.id)}</code>`);
  if (diagnosis) lines.push('', '🤖 <b>AI root cause &amp; fix</b>', esc(diagnosis));
  lines.push('', `<a href="${esc(deps!.dashboardUrl)}/?capsule=${encodeURIComponent(meta.id)}">Open in dashboard</a>`);
  return lines.join('\n');
}

function approvalButtons(id: string): InlineButton[][] {
  return [
    [
      { text: '✅ Approve & restore', callback_data: `approve:${id}` },
      { text: '❌ Reject', callback_data: `reject:${id}` },
    ],
    [{ text: '🔍 Investigate', callback_data: `investigate:${id}` }],
  ];
}

/* ------------------------------------------------------------------- poller */

async function pollLoop(): Promise<void> {
  for (;;) {
    try {
      const state = await loadNotify();
      const updates = await getUpdates(state.offset, 25);
      for (const u of updates) {
        state.offset = u.update_id + 1;
        await saveNotify(state);
        await handleUpdate(u).catch((e) => console.error('[notify] update error:', (e as Error).message));
      }
    } catch (e) {
      console.error('[notify] poll error:', (e as Error).message);
      await sleep(3000);
    }
  }
}

async function handleUpdate(u: TgUpdate): Promise<void> {
  if (u.message?.text) {
    const text = u.message.text.trim();
    const chatId = u.message.chat.id;
    if (text.startsWith('/start')) {
      const state = await loadNotify();
      state.chatId = chatId;
      state.chatName = u.message.chat.username ?? u.message.chat.first_name;
      await saveNotify(state);
      await sendMessage(
        chatId,
        "✅ <b>Capsule connected.</b>\nYou'll get a crash alert here the moment your backend throws — with the AI root cause and one-tap restore.",
      );
      return;
    }
    // Free-text reply = a follow-up instruction for the latest investigated crash.
    const state = await loadNotify();
    const target = latestWithStatus(state, 'investigating');
    if (target) await investigate(target, text);
    return;
  }

  if (u.callback_query) {
    const cb = u.callback_query;
    const [action, id] = (cb.data ?? '').split(':');
    const state = await loadNotify();
    if (state.chatId && cb.from.id !== state.chatId) {
      await answerCallback(cb.id, 'Not authorized.');
      return;
    }
    await answerCallback(cb.id);
    if (action === 'approve') await approve(id);
    else if (action === 'reject') await reject(id);
    else if (action === 'investigate') await investigate(id);
  }
}

function latestWithStatus(state: NotifyState, status: Approval['status']): string | null {
  let latest: { id: string; at: string } | null = null;
  for (const [id, a] of Object.entries(state.approvals)) {
    if (a.status === status && (!latest || a.at > latest.at)) latest = { id, at: a.at };
  }
  return latest?.id ?? null;
}

async function approve(id: string): Promise<void> {
  const state = await loadNotify();
  const ap = state.approvals[id];
  if (!ap) return;
  ap.status = 'approved';
  ap.at = new Date().toISOString();
  await saveNotify(state);
  const msgId = state.messageIds[id];
  if (state.chatId && msgId) {
    const where = ap.restoreTo ? ` to <code>${esc(ap.restoreTo)}</code>` : '';
    await editMessage(
      state.chatId,
      msgId,
      `✅ <b>Approved.</b> Restoring backend${where} — the app is healing now. 🩹`,
    );
  }
}

async function reject(id: string): Promise<void> {
  const state = await loadNotify();
  const ap = state.approvals[id];
  if (!ap) return;
  ap.status = 'rejected';
  ap.at = new Date().toISOString();
  await saveNotify(state);
  const msgId = state.messageIds[id];
  if (state.chatId && msgId) {
    await editMessage(state.chatId, msgId, '❌ <b>Rejected.</b> No changes made — capsule kept for investigation.');
  }
}

async function investigate(id: string, note?: string): Promise<void> {
  const state = await loadNotify();
  const ap = state.approvals[id];
  if (!ap) return;
  ap.status = 'investigating';
  ap.at = new Date().toISOString();
  if (note) ap.note = note;
  await saveNotify(state);

  const meta = await deps!.store.getMeta(id);
  const metas = await deps!.store.list();
  const baseline = baselineFor(metas, id);
  const diff = await deps!.store.diff(baseline ? baseline.id : id, id);
  const extra = note ?? 'Dig deeper: consider edge cases, recent logs, and whether restoring is truly the right fix.';

  let text = 'Could not get a deeper analysis right now.';
  try {
    text = (await deps!.agent.proposeFix(meta, diff, extra)).explanation;
  } catch (e) {
    console.error('[notify] investigate diagnose failed:', (e as Error).message);
  }
  if (state.chatId) {
    await sendMessage(state.chatId, `🔍 <b>Deeper look</b>\n${esc(text)}`, approvalButtons(id));
  }
}

/* -------------------------------------------------------- API-facing helpers */

export async function listApprovals(): Promise<Record<string, Approval>> {
  return (await loadNotify()).approvals;
}

export async function getApproval(id: string): Promise<Approval | null> {
  return (await loadNotify()).approvals[id] ?? null;
}

export async function settingsStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  chatName?: string;
  dashboardUrl: string;
}> {
  const state = await loadNotify();
  return {
    enabled: telegramEnabled(),
    connected: state.chatId !== undefined,
    chatName: state.chatName,
    dashboardUrl: deps?.dashboardUrl ?? '',
  };
}

export async function sendTest(): Promise<{ ok: boolean; error?: string }> {
  const state = await loadNotify();
  if (!telegramEnabled()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  if (!state.chatId) return { ok: false, error: 'No chat connected — send /start to your bot first' };
  try {
    await sendMessage(state.chatId, '🔔 <b>Test alert from Capsule.</b> Notifications are wired up.');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Manually (re)send the alert for a capsule — powers the dashboard "Send to Telegram" button. */
export async function notifyCapsule(id: string): Promise<{ ok: boolean; error?: string }> {
  const state = await loadNotify();
  if (!telegramEnabled()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  if (!state.chatId) return { ok: false, error: 'No chat connected — send /start to your bot first' };
  try {
    const meta = await deps!.store.getMeta(id);
    if (!meta.context.error) return { ok: false, error: 'Not a crash capsule' };
    await alert(meta);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
