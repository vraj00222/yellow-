import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { api } from '../api';
import { EASE, prefersReduced } from '../anim';
import { errMsg, fmt } from '../format';
import { CountUp } from './CountUp';
import { PanelSkeleton } from './Skeleton';
import { ShareButton } from './ShareButton';
import { ApprovalChip, SeverityBadge } from './Badges';
import { inspectLink } from '../share';
import type {
  BackendState,
  CapsuleRequest,
  CapsuleDetail,
  RestoreResult,
  Row,
  StateDiff,
} from '../types';

export function Detail({
  id,
  onShowDiff,
}: {
  id: string | null;
  onShowDiff?: (a: string, b: string) => void;
}) {
  const [data, setData] = useState<CapsuleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [restored, setRestored] = useState<RestoreResult | null>(null);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseErr, setDiagnoseErr] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setData(null);
    setErr(null);
    setRestored(null);
    setRestoreErr(null);
    setConfirming(false);
    setDiagnosis(null);
    setDiagnosing(false);
    setDiagnoseErr(null);
    setNotifyMsg(null);
    if (!id) return;
    let live = true;
    api.capsule(id).then((d) => live && setData(d)).catch((e) => live && setErr(errMsg(e)));
    return () => {
      live = false;
    };
  }, [id]);

  useLayoutEffect(() => {
    if (!data || prefersReduced() || !scope.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-rise]', { y: 18, opacity: 0, duration: 0.55, ease: EASE, stagger: 0.07 });
    }, scope);
    return () => ctx.revert();
  }, [data]);

  if (!id) return <Empty>Select a capsule from the timeline.</Empty>;
  if (err) return <Empty tone="error">{err}</Empty>;
  if (!data)
    return (
      <div className="view">
        <div className="vhead">
          <span className="skel" style={{ width: 220, height: 26 }} />
        </div>
        <PanelSkeleton rows={2} />
        <div className="grid2">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </div>
      </div>
    );

  const { meta, state, baseline, affected, approval } = data;
  const { error, request, session } = meta.context;
  const affectedRows = affected ? affectedList(affected) : [];

  const onNotify = async () => {
    setNotifyMsg('Sending…');
    const r = await api.notify(meta.id);
    setNotifyMsg(r.ok ? '✓ Sent to Telegram' : `✗ ${r.error}`);
  };

  const onRestore = async () => {
    setRestoring(true);
    setRestoreErr(null);
    try {
      setRestored(await api.restore(meta.id));
      setConfirming(false);
    } catch (e) {
      setRestoreErr(errMsg(e));
    } finally {
      setRestoring(false);
    }
  };

  const onDiagnose = async () => {
    setDiagnosing(true);
    setDiagnoseErr(null);
    try {
      const r = await api.diagnose(meta.id);
      setDiagnosis(r.explanation);
    } catch (e) {
      setDiagnoseErr(errMsg(e));
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <div className="view" ref={scope}>
      <header className="vhead" data-rise>
        <div className="vhead__lead">
          <span className={`status-dot ${error ? 'status-dot--error' : 'status-dot--ok'}`} />
          <div>
            <div className="vhead__title mono">{meta.id}</div>
            <div className="vhead__sub">
              <span className={`pill ${error ? 'pill--error' : 'pill--ok'}`}>{meta.label}</span>
              <SeverityBadge severity={meta.triage?.severity} />
              {meta.triage?.category && <span className="tl-card__cat">{meta.triage.category}</span>}
              <ApprovalChip status={approval?.status} />
              <span className="dimx">schema v{meta.schemaVersion}</span>
              <span className="dimx">{new Date(meta.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="vhead__actions">
          <ShareButton href={inspectLink(meta.id)} />
          {confirming ? (
            <span className="confirm" role="group" aria-label="Confirm restore">
              <span className="confirm__q">Restore this snapshot?</span>
              <button className="btn btn--primary" onClick={onRestore} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Confirm'}
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => setConfirming(false)}
                disabled={restoring}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn btn--primary" onClick={() => setConfirming(true)}>
              Restore
            </button>
          )}
          {error && (
            <button className="btn" onClick={onDiagnose} disabled={diagnosing}>
              {diagnosing ? 'Diagnosing…' : 'Ask agent to fix'}
            </button>
          )}
          {error && (
            <button className="btn" onClick={onNotify} title="Send this crash to the developer's Telegram">
              Send to Telegram
            </button>
          )}
          {notifyMsg && <span className="dimx">{notifyMsg}</span>}
        </div>
      </header>

      {restoreErr && (
        <div className="banner banner--error mono" data-rise>
          {restoreErr}
        </div>
      )}

      {error ? (
        <section className="panel panel--error" data-rise>
          <div className="panel__title">Crash · captured error</div>
          <div className="err__name mono">
            {error.name}: <span className="err__msg">{error.message}</span>
          </div>
          {error.stack && (
            <details className="raw raw--stack">
              <summary className="raw__summary">View stack trace</summary>
              <pre className="stack mono">{error.stack}</pre>
            </details>
          )}
        </section>
      ) : (
        <section className="panel" data-rise>
          <div className="panel__title">Snapshot</div>
          <div className="dimx">Clean snapshot — no error captured.</div>
        </section>
      )}

      {(diagnosing || diagnosis || diagnoseErr) && (
        <section className="panel panel--agent" data-rise>
          <div className="panel__title">
            Agent diagnosis <span className="dimx">· InsForge Model Gateway</span>
          </div>
          {diagnosing ? (
            <div className="agent__loading">
              <span className="agent__spin" aria-hidden="true" />
              Analyzing the crash and its diff…
            </div>
          ) : diagnoseErr ? (
            <div className="err__msg mono">{diagnoseErr}</div>
          ) : (
            <p className="agent__text">{diagnosis}</p>
          )}
        </section>
      )}

      {baseline && affectedRows.length > 0 && (
        <section className="panel" data-rise>
          <div className="statblock__head">
            <span className="panel__title">
              Rows affected{' '}
              <span className="dimx">
                · vs {baseline.label} <span className="mono">{baseline.id}</span>
              </span>
            </span>
            {onShowDiff && (
              <button className="btn btn--link" onClick={() => onShowDiff(baseline.id, meta.id)}>
                View full diff →
              </button>
            )}
          </div>
          <div className="affected">
            {affectedRows.map((a, i) => (
              <div className={`affrow affrow--${a.kind} mono`} key={i}>
                <span className="affrow__sign">
                  {a.kind === 'removed' ? '−' : a.kind === 'added' ? '+' : '~'}
                </span>
                <span className="affrow__tbl">{a.table}</span>
                <span className="affrow__body">{a.text}</span>
                <span className={`tag tag--${a.kind}`}>{a.kind}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="statblock" data-rise>
        <div className="statblock__head">
          <span className="panel__title">
            Frozen backend state <span className="dimx">· the exact rows Yellow captured</span>
          </span>
          <span className="dimx">schema v{state.schemaVersion}</span>
        </div>
        <StateTables state={state} />
      </section>

      <div className="grid2">
        <section className="panel" data-rise>
          <div className="panel__title">Request</div>
          {request ? <KV obj={requestView(request)} /> : <div className="dimx">none</div>}
        </section>
        <section className="panel" data-rise>
          <div className="panel__title">
            Session <span className="dimx">· redacted</span>
          </div>
          {session ? <KV obj={session} /> : <div className="dimx">none</div>}
        </section>
      </div>

      {restored && (
        <section className="panel panel--ok" data-rise>
          <div className="panel__title">
            Restored snapshot <span className="mono dimx">{restored.id}</span>
          </div>
          <Counts counts={countRows(restored)} bare />
          <details className="raw">
            <summary className="raw__summary">View raw state</summary>
            <pre className="json mono">{JSON.stringify(restored.state, null, 2)}</pre>
          </details>
        </section>
      )}
    </div>
  );
}

/** Render the captured backend state — every table, as the actual rows. */
function StateTables({ state }: { state: BackendState }) {
  const tables = Object.entries(state.tables);
  if (!tables.length) return <div className="dimx">empty snapshot — no tables captured</div>;
  return (
    <div className="dtables">
      {tables.map(([name, rows]) => (
        <DataTable key={name} name={name} rows={rows} />
      ))}
    </div>
  );
}

const MAX_ROWS = 50;

function DataTable({ name, rows }: { name: string; rows: Row[] }) {
  const cols = columnsOf(rows);
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <div className="dtable">
      <div className="dtable__bar">
        <span className="dtable__name mono">{name}</span>
        <span className="dtable__count">
          <CountUp value={rows.length} /> row{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="dtable__empty dimx">no rows captured</div>
      ) : (
        <div className="dtable__scroll">
          <table className="dgrid">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="mono">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="mono">
                      {fmt(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown.length && (
        <div className="dtable__more dimx">+{rows.length - shown.length} more rows</div>
      )}
    </div>
  );
}

/** Union of all keys across the rows, with `id` pinned first. */
function columnsOf(rows: Row[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) set.add(k);
  return [...set].sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

interface Aff {
  table: string;
  kind: 'removed' | 'added' | 'changed';
  text: string;
}

/** Flatten a diff into a single list of affected rows for the inline summary. */
function affectedList(diff: StateDiff): Aff[] {
  const out: Aff[] = [];
  for (const [table, t] of Object.entries(diff.tables)) {
    for (const r of t.removed) out.push({ table, kind: 'removed', text: rowText(r) });
    for (const r of t.added) out.push({ table, kind: 'added', text: rowText(r) });
    for (const c of t.changed)
      out.push({ table, kind: 'changed', text: `${rowLabel(c.before)} · ${c.changedFields.join(', ')}` });
  }
  return out;
}

function rowText(row: Row): string {
  return Object.entries(row)
    .map(([k, v]) => `${k}=${fmt(v)}`)
    .join('  ');
}

function rowLabel(row: Row): string {
  const id = row.id;
  return id === undefined || id === null ? JSON.stringify(row) : String(id);
}

function Counts({ counts, bare }: { counts: Record<string, number>; bare?: boolean }) {
  const entries = Object.entries(counts);
  if (!entries.length) return <div className="dimx">empty</div>;
  return (
    <div className={`counts${bare ? ' counts--bare' : ''}`}>
      {entries.map(([table, n]) => (
        <div className="count" key={table}>
          <CountUp className="count__n mono" value={n} />
          <span className="count__t">{table}</span>
        </div>
      ))}
    </div>
  );
}

function KV({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);
  if (!entries.length) return <div className="dimx">none</div>;
  return (
    <div className="kv">
      {entries.map(([k, v]) => (
        <div className="kv__row" key={k}>
          <span className="kv__k">{k}</span>
          <span className="kv__v mono">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return <div className={`empty${tone === 'error' ? ' empty--error' : ''}`}>{children}</div>;
}

function requestView(r: CapsuleRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.method) out.method = r.method;
  if (r.url) out.url = r.url;
  if (r.headers) out.headers = r.headers;
  if (r.body !== undefined) out.body = fmt(r.body);
  return out;
}

function countRows(r: RestoreResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [table, rows] of Object.entries(r.state.tables)) out[table] = rows.length;
  return out;
}
