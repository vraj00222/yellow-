/**
 * Minimal Telegram Bot API client over `fetch` — send / edit messages with
 * inline approve buttons, and long-poll for the developer's taps and replies.
 * No webhook, so it works on a laptop with no public URL (great for demos).
 *
 * The bot token is read from `TELEGRAM_BOT_TOKEN` at call time and is
 * server-side only — it is never sent to the browser.
 */

export function botToken(): string | undefined {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t ? t : undefined;
}

export function telegramEnabled(): boolean {
  return botToken() !== undefined;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

/** Escape user/error text before putting it in an HTML-parse-mode message. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const token = botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

export async function sendMessage(
  chatId: number,
  text: string,
  buttons?: InlineButton[][],
): Promise<number> {
  const result = await call<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
  return result.message_id;
}

export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons ?? [] },
  }).catch((e) => console.error('[telegram] edit failed:', (e as Error).message));
}

export async function answerCallback(callbackId: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: callbackId, text }).catch(() => {});
}

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
  };
}

/** Long-poll for updates. Resolves when Telegram has news or `timeout` elapses. */
export async function getUpdates(offset: number, timeout = 25): Promise<TgUpdate[]> {
  return call<TgUpdate[]>('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message', 'callback_query'],
  });
}
