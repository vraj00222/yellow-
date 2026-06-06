/**
 * The Telegram glance-and-approve channel. Long-polls for updates (no webhook,
 * no public URL), renders {@link OrchestratorEngine} events into pings, and turns
 * the dev's taps and replies into {@link Command}s. Runs against the mock engine
 * today; swap in the HTTP engine when Vraj's is live — nothing here changes.
 */
import { pathToFileURL } from 'node:url';
import type { Command, CommandType, EngineEvent, IncidentId, OrchestratorEngine } from './engine';
import { MockEngine } from './mock-engine';
import { Notifier, cardFor } from './notify';

interface TgChat {
  id: number;
}
interface TgMessage {
  message_id: number;
  chat: TgChat;
  text?: string;
}
interface TgCallback {
  id: string;
  data?: string;
  message?: TgMessage;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}

/** A button tap that opens a feedback turn: the next text message is the feedback. */
type FeedbackKind = Extract<CommandType, 'denyPlan' | 'denyCode'>;

export class Bot {
  private readonly notifier: Notifier;
  private offset = 0;
  private running = false;
  /** The chat to notify — captured from whoever last talked to the bot. */
  private targetChat: number | null = null;
  /** Where each incident's thread lives, so events route to the right chat. */
  private readonly incidentChat = new Map<IncidentId, number>();
  /** The incident a chat's free-text is currently about. */
  private readonly activeIncident = new Map<number, IncidentId>();
  /** Chats mid-feedback after tapping Deny. */
  private readonly pendingFeedback = new Map<number, { incidentId: IncidentId; kind: FeedbackKind }>();

  constructor(
    private readonly token: string,
    private readonly engine: OrchestratorEngine,
    /** Optional demo trigger wired to `/crash` (the mock's `simulateCrash`). */
    private readonly simulate?: () => void,
  ) {
    this.notifier = new Notifier(token);
    this.engine.onEvent((event) => void this.render(event));
  }

  // ── Engine event → Telegram ────────────────────────────────────────────────

  private async render(event: EngineEvent): Promise<void> {
    if (event.type === 'incident.frozen') {
      if (this.targetChat === null) {
        console.error('[telegram] crash fired but no chat has said /start yet — nobody to notify.');
        return;
      }
      this.incidentChat.set(event.incidentId, this.targetChat);
      this.activeIncident.set(this.targetChat, event.incidentId);
    }
    const chat = this.incidentChat.get(event.incidentId);
    if (chat === undefined) return;
    try {
      await this.notifier.sendMessage(chat, cardFor(event));
    } catch (err) {
      console.error('[telegram] send failed:', err);
    }
  }

  // ── Telegram → engine ───────────────────────────────────────────────────────

  private async onCallback(cb: TgCallback): Promise<void> {
    const [action, incidentId] = (cb.data ?? '').split(':') as [CommandType | '', IncidentId];
    const chat = cb.message?.chat.id;
    if (!incidentId || chat === undefined) return void this.notifier.answerCallback(cb.id);

    if (action === 'denyPlan' || action === 'denyCode') {
      this.pendingFeedback.set(chat, { incidentId, kind: action });
      await this.notifier.answerCallback(cb.id, 'Tell me what to change.');
      await this.strip(cb.message!, '✏️ Awaiting your feedback…');
      return;
    }

    if (action === 'approvePlan' || action === 'approveCode' || action === 'takeover') {
      await this.engine.send({ type: action, incidentId });
      await this.notifier.answerCallback(cb.id, ACK[action]);
      await this.strip(cb.message!, ACK[action]);
      return;
    }
    await this.notifier.answerCallback(cb.id);
  }

  private async onText(msg: TgMessage): Promise<void> {
    const chat = msg.chat.id;
    const text = (msg.text ?? '').trim();
    this.targetChat = chat;

    if (text === '/start') {
      await this.notifier.sendMessage(chat, {
        text:
          '👋 <b>Yellow</b> is watching. I ping you the moment something breaks, show you the fix, ' +
          'and you approve or push back — right here.\n\nSend /crash to simulate an incident.',
      });
      return;
    }
    if (text === '/crash') {
      if (this.simulate) this.simulate();
      else await this.notifier.sendMessage(chat, { text: 'No simulator wired (live engine mode).' });
      return;
    }

    const pending = this.pendingFeedback.get(chat);
    if (pending) {
      this.pendingFeedback.delete(chat);
      await this.engine.send({ type: pending.kind, incidentId: pending.incidentId, feedback: text });
      await this.notifier.sendMessage(chat, { text: '👍 Got it — reworking with that in mind.' });
      return;
    }

    const incidentId = this.activeIncident.get(chat);
    if (incidentId) {
      await this.engine.send({ type: 'ask', incidentId, question: text });
      return;
    }
    await this.notifier.sendMessage(chat, { text: 'No active incident. Send /crash to simulate one.' });
  }

  /** Remove a card's buttons and append a status line, so it can't be re-tapped. */
  private async strip(msg: TgMessage, status: string): Promise<void> {
    const text = `${msg.text ?? ''}\n\n<i>${status}</i>`;
    try {
      await this.notifier.editMessage(msg.chat.id, msg.message_id, { text });
    } catch (err) {
      console.error('[telegram] edit failed:', err);
    }
  }

  // ── Long-poll loop ────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.running = true;
    console.error('[telegram] bot online — open Telegram and send /start');
    while (this.running) {
      let updates: TgUpdate[] = [];
      try {
        updates = await this.getUpdates();
      } catch (err) {
        console.error('[telegram] getUpdates failed, retrying:', err);
        await sleep(2000);
        continue;
      }
      for (const u of updates) {
        this.offset = u.update_id + 1;
        if (u.callback_query) await this.onCallback(u.callback_query);
        else if (u.message) await this.onText(u.message);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async getUpdates(): Promise<TgUpdate[]> {
    const url = `https://api.telegram.org/bot${this.token}/getUpdates?timeout=30&offset=${this.offset}`;
    const res = await fetch(url);
    const json = (await res.json()) as { ok: boolean; result?: TgUpdate[]; description?: string };
    if (!json.ok) throw new Error(json.description ?? `HTTP ${res.status}`);
    return json.result ?? [];
  }
}

const ACK: Record<'approvePlan' | 'approveCode' | 'takeover', string> = {
  approvePlan: '✅ Approved — building the fix…',
  approveCode: '✅ Approved — pushing & merging…',
  takeover: "✋ You're driving.",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile('./.env');
  } catch {
    /* no .env — rely on the ambient environment */
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN is not set. Add it to .env (see README).');
    process.exitCode = 1;
    return;
  }
  const engine = new MockEngine();
  const bot = new Bot(token, engine, () => engine.simulateCrash());
  await bot.start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[telegram] bot failed to start:', err);
    process.exitCode = 1;
  });
}
