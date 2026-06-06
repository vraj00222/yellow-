import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { api } from '../api';
import { EASE, prefersReduced } from '../anim';
import { errMsg, fmt } from '../format';
import { CountUp } from './CountUp';
import { PanelSkeleton } from './Skeleton';
import { ShareButton } from './ShareButton';
import { diffLink } from '../share';
import type { CapsuleMeta, Row, StateDiff } from '../types';

interface Props {
  capsules: CapsuleMeta[];
  a: string | null;
  b: string | null;
  onA: (id: string) => void;
  onB: (id: string) => void;
}

export function DiffView({ capsules, a, b, onA, onB }: Props) {
  const [diff, setDiff] = useState<StateDiff | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setDiff(null);
    setErr(null);
    if (!a || !b) return;
    let live = true;
    api.diff(a, b).then((d) => live && setDiff(d)).catch((e) => live && setErr(errMsg(e)));
    return () => {
      live = false;
    };
  }, [a, b]);

  useLayoutEffect(() => {
    if (!diff || prefersReduced() || !scope.current) return;
    const ctx = gsap.context(() => {
      gsap.from('.rootcause', { y: 12, opacity: 0, scale: 0.96, duration: 0.55, ease: EASE });
      gsap.from('.terminal', { y: 16, opacity: 0, duration: 0.5, ease: EASE, delay: 0.08 });
      gsap.from('.tline', { opacity: 0, x: -8, duration: 0.3, ease: 'power2.out', stagger: 0.018, delay: 0.18 });
      gsap.fromTo(
        '.tline--del',
        { backgroundColor: 'rgba(255,107,107,0)' },
        {
          backgroundColor: 'rgba(255,107,107,0.16)',
          duration: 0.6,
          delay: 0.6,
          yoyo: true,
          repeat: 1,
          ease: 'sine.inOut',
        },
      );
    }, scope);
    return () => ctx.revert();
  }, [diff]);

  const t = diff ? totals(diff) : null;
  const rc = diff ? rootCause(diff) : null;
  const aLabel = capsules.find((c) => c.id === a)?.label ?? 'a';
  const bLabel = capsules.find((c) => c.id === b)?.label ?? 'b';

  return (
    <div className="view" ref={scope}>
      <header className="vhead vhead--diff">
        <Picker label="from" value={a} capsules={capsules} onChange={onA} />
        <span className="diff__arrow mono">→</span>
        <Picker label="to" value={b} capsules={capsules} onChange={onB} />
        {t && (
          <div className="diffstats">
            {t.removed > 0 && (
              <span className="chip chip--rm">
                <CountUp value={t.removed} /> removed
              </span>
            )}
            {t.changed > 0 && (
              <span className="chip chip--ch">
                <CountUp value={t.changed} /> changed
              </span>
            )}
            {t.added > 0 && (
              <span className="chip chip--add">
                <CountUp value={t.added} /> added
              </span>
            )}
            {diff?.schemaDrift && <span className="chip chip--warn">drift</span>}
          </div>
        )}
        {a && b && <ShareButton href={diffLink(a, b)} />}
      </header>

      {rc && <RootCause rc={rc} aLabel={aLabel} bLabel={bLabel} />}

      {err ? (
        <div className="empty empty--error">{err}</div>
      ) : !a || !b ? (
        <div className="empty">Pick two capsules to compare.</div>
      ) : !diff ? (
        <PanelSkeleton rows={4} />
      ) : (
        <Terminal diff={diff} aLabel={aLabel} bLabel={bLabel} aId={a} bId={b} />
      )}
    </div>
  );
}

function Terminal({
  diff,
  aLabel,
  bLabel,
  aId,
  bId,
}: {
  diff: StateDiff;
  aLabel: string;
  bLabel: string;
  aId: string;
  bId: string;
}) {
  const tables = Object.entries(diff.tables).filter(
    ([, t]) => t.added.length || t.removed.length || t.changed.length,
  );
  const tot = totals(diff);
  const nothing =
    !tables.length && !diff.addedTables.length && !diff.removedTables.length && !diff.schemaDrift;

  return (
    <div className="terminal">
      <div className="terminal__bar">
        <span className="tdot tdot--r" />
        <span className="tdot tdot--y" />
        <span className="tdot tdot--g" />
        <span className="terminal__title mono">
          capsule diff {aLabel}..{bLabel}
        </span>
      </div>
      <div className="terminal__body mono">
        <div className="tline tline--cmd">
          <span className="tprompt">$</span> capsule diff {aId} {bId}
        </div>

        {diff.schemaDrift && (
          <div className="tline tline--warn">
            ! schemaVersion {diff.schemaVersionA} → {diff.schemaVersionB}
          </div>
        )}
        {diff.removedTables.map((tbl) => (
          <div className="tline tline--del" key={`rt-${tbl}`}>
            - table {tbl}
          </div>
        ))}
        {diff.addedTables.map((tbl) => (
          <div className="tline tline--add" key={`at-${tbl}`}>
            + table {tbl}
          </div>
        ))}

        {nothing && <div className="tline tline--dim">no changes — snapshots are identical</div>}

        {tables.map(([name, tbl]) => (
          <div className="thunk" key={name}>
            <div className="tline tline--hunk">
              <span className="thunk__at">@@</span> {name} <span className="thunk__at">@@</span>
              <span className="thunk__stat">
                {tbl.removed.length ? ` -${tbl.removed.length}` : ''}
                {tbl.changed.length ? ` ~${tbl.changed.length}` : ''}
                {tbl.added.length ? ` +${tbl.added.length}` : ''}
              </span>
            </div>
            {tbl.removed.map((row, i) => (
              <div className="tline tline--del" key={`r${i}`}>
                - {rowText(row)}
              </div>
            ))}
            {tbl.added.map((row, i) => (
              <div className="tline tline--add" key={`a${i}`}>
                + {rowText(row)}
              </div>
            ))}
            {tbl.changed.map((c, i) => (
              <div className="tchange" key={`c${i}`}>
                <div className="tline tline--ctx">~ {rowLabel(c.before)}</div>
                {c.changedFields.map((f) => (
                  <Fragment key={f}>
                    <div className="tline tline--del">
                      -   {f}: {fmt(c.before[f])}
                    </div>
                    <div className="tline tline--add">
                      +   {f}: {fmt(c.after[f])}
                    </div>
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        ))}

        {!nothing && (
          <div className="tline tline--summary">
            {tables.length} table{tables.length === 1 ? '' : 's'} changed · {tot.removed} removed ·{' '}
            {tot.changed} changed · {tot.added} added
          </div>
        )}
      </div>
    </div>
  );
}

function Picker({
  label,
  value,
  capsules,
  onChange,
}: {
  label: string;
  value: string | null;
  capsules: CapsuleMeta[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="picker">
      <span className="picker__label">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!value && (
          <option value="" disabled>
            select…
          </option>
        )}
        {capsules.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} · {c.id}
            {c.context.error ? ' ⚠' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function totals(diff: StateDiff): { removed: number; added: number; changed: number } {
  let removed = 0;
  let added = 0;
  let changed = 0;
  for (const t of Object.values(diff.tables)) {
    removed += t.removed.length;
    added += t.added.length;
    changed += t.changed.length;
  }
  return { removed, added, changed };
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

/** The single most likely regression: the first removed row in the (sorted) diff. */
function rootCause(diff: StateDiff): { table: string; row: Row } | null {
  for (const [table, t] of Object.entries(diff.tables)) {
    if (t.removed.length) return { table, row: t.removed[0] };
  }
  return null;
}

function RootCause({
  rc,
  aLabel,
  bLabel,
}: {
  rc: { table: string; row: Row };
  aLabel: string;
  bLabel: string;
}) {
  return (
    <div className="rootcause" role="status">
      <span className="rootcause__badge mono">root cause</span>
      <span className="rootcause__text">
        <span className="rootcause__id mono">{rowLabel(rc.row)}</span> removed from{' '}
        <span className="mono">{rc.table}</span>
        <span className="rootcause__sub">
          {' '}
          — the change between {aLabel} → {bLabel}.
        </span>
      </span>
    </div>
  );
}
