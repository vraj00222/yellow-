import { useEffect, useState } from 'react';
import { api } from '../api';
import { errMsg } from '../format';
import type { NotifySettings } from '../types';

/**
 * Developer settings — the Telegram link for crash approvals. The dashboard and
 * the phone both belong to the developer: this is where you connect the two.
 */
export function Settings({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<NotifySettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = () => api.settings().then(setS).catch((e) => setErr(errMsg(e)));
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, []);

  const sendTest = async () => {
    setTestMsg('Sending…');
    const r = await api.testTelegram();
    setTestMsg(r.ok ? '✓ Sent — check your phone.' : `✗ ${r.error}`);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Crash alerts → your phone</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="banner banner--error mono">{err}</div>}

        <div className="setrow">
          <span className="setrow__k">Telegram bot</span>
          <span className={`apr apr--${s?.enabled ? 'approved' : 'rejected'}`}>
            {s?.enabled ? 'Token set' : 'No token'}
          </span>
        </div>
        <div className="setrow">
          <span className="setrow__k">Developer chat</span>
          <span className={`apr apr--${s?.connected ? 'approved' : 'pending'}`}>
            {s?.connected ? `Connected${s.chatName ? ` · @${s.chatName}` : ''}` : 'Not connected'}
          </span>
        </div>

        {!s?.enabled ? (
          <ol className="steps">
            <li>
              In Telegram, message <b>@BotFather</b> → <code>/newbot</code> → copy the token.
            </li>
            <li>
              Put it in <code className="mono">.env</code> as{' '}
              <code className="mono">TELEGRAM_BOT_TOKEN=…</code> and restart{' '}
              <code className="mono">npm run api</code>.
            </li>
          </ol>
        ) : !s.connected ? (
          <ol className="steps">
            <li>Open your bot in Telegram and tap Start (send {' '}<code>/start</code>).</li>
            <li>Yellow captures your chat automatically — this panel will flip to “Connected”.</li>
          </ol>
        ) : (
          <p className="setdone">
            You're all set. New crashes ping this chat with the AI root cause and one-tap restore.
          </p>
        )}

        <div className="modal__foot">
          <button className="btn btn--primary" onClick={sendTest} disabled={!s?.connected}>
            Send test alert
          </button>
          {testMsg && <span className="dimx">{testMsg}</span>}
        </div>
      </div>
    </div>
  );
}
