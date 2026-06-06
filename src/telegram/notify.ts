/**
 * Outbound Telegram Bot API client + card formatters. Pure HTTPS over global
 * `fetch` — no bot-framework dependency. Reads the token from the environment.
 *
 * This is the dumb, deterministic lane: it renders engine events into Telegram
 * cards verbatim (the diff is shown as-is, never paraphrased) and sends the
 * dev's taps straight back as commands. No model lives here.
 */
import type { EngineEvent } from './engine';

/** One row of inline buttons. `data` becomes the callback payload (≤64 bytes). */
export interface Button {
  text: string;
  data: string;
}

export interface Card {
  text: string;
  buttons?: Button[][];
}

interface TelegramMessage {
  message_id: number;
}

export class Notifier {
  private readonly base: string;

  constructor(token: string) {
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set — see .env.');
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: number, card: Card): Promise<number> {
    const res = await this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text: card.text,
      parse_mode: 'HTML',
      reply_markup: keyboard(card.buttons),
    });
    return res.message_id;
  }

  async editMessage(chatId: number, messageId: number, card: Card): Promise<void> {
    await this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: card.text,
      parse_mode: 'HTML',
      reply_markup: keyboard(card.buttons),
    });
  }

  async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    return json.result as T;
  }
}

function keyboard(buttons?: Button[][]): { inline_keyboard: { text: string; callback_data: string }[][] } | undefined {
  if (!buttons?.length) return undefined;
  return {
    inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))),
  };
}

// ── Card formatters: one EngineEvent → one Telegram card ─────────────────────

/** Render an engine event into the card the channel sends/edits. */
export function cardFor(event: EngineEvent): Card {
  switch (event.type) {
    case 'incident.frozen':
      return {
        text:
          `🔴 <b>${esc(event.title)}</b>\n` +
          `${esc(event.summary)}\n\n` +
          `<b>What moved</b>\n${event.affected.map((a) => `• ${esc(a)}`).join('\n')}\n\n` +
          `<i>Frozen capsule ${esc(event.capsuleId)} — agents investigating…</i>`,
      };

    case 'build.started':
      return { text: '🛠️ <i>Agents are building the fix and validating it against the frozen state…</i>' };

    case 'proposal.ready':
      return {
        text:
          `🔬 <b>Proposed fix</b>${event.attempt > 1 ? ` <i>(attempt ${event.attempt})</i>` : ''}\n\n` +
          `<b>Root cause</b>\n${esc(event.rootCause)}\n\n` +
          `<b>Fix</b>\n${esc(event.proposedFix)}\n\n` +
          `Approve the plan, or deny and tell me what to change.`,
        buttons: [
          [
            { text: '✅ Approve plan', data: `approvePlan:${event.incidentId}` },
            { text: '❌ Deny', data: `denyPlan:${event.incidentId}` },
          ],
          [{ text: '✋ Let me drive', data: `takeover:${event.incidentId}` }],
        ],
      };

    case 'build.complete': {
      const v = event.validation;
      const check = (ok: boolean, label: string) => `${ok ? '✅' : '⚠️'} ${label}`;
      return {
        text:
          `📦 <b>Fix built</b> — <code>${esc(event.branch)}</code>\n` +
          `Files: ${event.filesChanged.map((f) => `<code>${esc(f)}</code>`).join(', ')}\n\n` +
          `<pre>${esc(event.diff)}</pre>\n` +
          `${check(v.ranAgainstFrozenState && v.crashGone, 'Crash gone against the frozen state')}\n` +
          `${check(v.testsPassed, 'Tests pass')}\n\n` +
          `Approve to push &amp; merge, or deny with feedback.`,
        buttons: [
          [
            { text: '✅ Approve push & merge', data: `approveCode:${event.incidentId}` },
            { text: '❌ Deny', data: `denyCode:${event.incidentId}` },
          ],
        ],
      };
    }

    case 'merge.complete':
      return {
        text:
          `🟢 <b>Merged to ${esc(event.mergedTo)}.</b> Nothing broke on our watch.\n` +
          (event.prUrl ? `${esc(event.prUrl)}` : `commit <code>${esc(event.commitSha ?? '')}</code>`),
      };

    case 'answer.ready':
      return { text: `💬 ${esc(event.answer)}` };

    case 'error':
      return { text: `⚠️ <b>${esc(event.stage)} failed.</b>\n${esc(event.message)}` };
  }
}

/** Escape the five characters Telegram's HTML parse mode cares about. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
