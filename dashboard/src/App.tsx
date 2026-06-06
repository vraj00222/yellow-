import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { api } from './api';
import { EASE, prefersReduced } from './anim';
import { errMsg } from './format';
import { baselineFor, latestDiffPair, latestInspectId } from './select';
import type { CapsuleMeta } from './types';
import { Ambient } from './components/Ambient';
import { Timeline } from './components/Timeline';
import { TimelineSkeleton } from './components/Skeleton';
import { Mascot } from './components/Mascot';
import { Sponsors } from './components/Sponsors';
import { RotatingTagline } from './components/RotatingTagline';
import { ConnBadge } from './components/ConnBadge';
import { FirstRun } from './components/FirstRun';
import { Detail } from './components/Detail';
import { DiffView } from './components/DiffView';

type Mode = 'detail' | 'diff';

// Deep-link support: ?capsule=<id> opens Inspect; ?from=<a>&to=<b> opens Diff.
const search =
  typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
const urlCapsule = search.get('capsule');
const urlFrom = search.get('from');
const urlTo = search.get('to');

export function App() {
  const [capsules, setCapsules] = useState<CapsuleMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(urlCapsule);
  const [mode, setMode] = useState<Mode>(urlFrom && urlTo ? 'diff' : urlCapsule ? 'detail' : 'diff');
  const [diffA, setDiffA] = useState<string | null>(urlFrom);
  const [diffB, setDiffB] = useState<string | null>(urlTo);
  const shell = useRef<HTMLDivElement>(null);
  // Keep showing the LATEST capsules unless the user (or a deep-link) pinned a choice.
  const diffPinned = useRef(Boolean(urlFrom && urlTo));
  const selPinned = useRef(Boolean(urlCapsule));
  const entered = useRef(false);

  // Selecting a capsule re-targets the diff to "it vs its own baseline", so each
  // capsule shows its own change instead of one globally-pinned pair.
  const retargetDiff = useCallback((list: CapsuleMeta[], id: string) => {
    const base = baselineFor(list, id);
    if (base) {
      diffPinned.current = true;
      setDiffA(base);
      setDiffB(id);
    }
  }, []);

  // Jump from Inspect straight to the full Diff of a capsule vs its baseline.
  const showDiff = useCallback((a: string, b: string) => {
    diffPinned.current = true;
    setDiffA(a);
    setDiffB(b);
    setMode('diff');
  }, []);

  // Load capsules, defaulting the inspected capsule + diff pair to the LATEST run.
  const load = useCallback(async () => {
    try {
      const list = await api.capsules();
      setCapsules(list);
      setError(null);
      if (!list.length) return;
      if (!selPinned.current) setSelectedId(latestInspectId(list));
      if (!diffPinned.current) {
        const { a, b } = latestDiffPair(list);
        setDiffA(a);
        setDiffB(b);
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  // Initial load + refetch whenever the tab regains focus (e.g. after you run
  // `npm run demo:insforge` in a terminal) so the newest capsule shows up live.
  useEffect(() => {
    void load();
    const onFocus = () => void load();
    const onVis = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Entrance choreography once data is in (runs once — not on focus refetches).
  useLayoutEffect(() => {
    if (!capsules || entered.current || prefersReduced() || !shell.current) return;
    entered.current = true;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: EASE } })
        .from('.topbar', { y: -12, opacity: 0, duration: 0.5 })
        .from('.side__stat', { y: -8, opacity: 0, duration: 0.4 }, '-=0.3')
        .from('.tl-item', { x: -16, opacity: 0, duration: 0.5, stagger: 0.06 }, '-=0.2')
        .from('.kbd-hint', { opacity: 0, duration: 0.4 }, '-=0.2');
    }, shell);
    return () => ctx.revert();
  }, [capsules]);

  // Keyboard nav: subscribe ONCE and read latest state through a ref
  // (avoids re-binding the listener on every selection change).
  const live = useRef({ capsules, selectedId });
  live.current = { capsules, selectedId };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = e.target instanceof HTMLElement ? e.target.tagName : '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const { capsules: list, selectedId: sel } = live.current;
      if (!list || !list.length) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        stepTo(list, sel, 1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        stepTo(list, sel, -1);
      } else if (e.key === 'd') {
        setMode('diff');
      } else if (e.key === 'i') {
        setMode('detail');
      }
    };
    const stepTo = (list: CapsuleMeta[], sel: string | null, delta: number) => {
      selPinned.current = true;
      const idx = Math.max(0, list.findIndex((c) => c.id === sel));
      const next = Math.min(list.length - 1, Math.max(0, idx + delta));
      setSelectedId(list[next].id);
      retargetDiff(list, list[next].id);
      setMode('detail');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell" ref={shell}>
      <Ambient />

      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand__name mono">Capsule</span>
        </div>
        <div className="topbar__main">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumbs__seg">Time Machine</span>
            <span className="crumbs__sep" aria-hidden="true">/</span>
            <span className="crumbs__seg crumbs__seg--cur">{mode === 'diff' ? 'Diff' : 'Inspect'}</span>
          </nav>
          <ConnBadge />
          <div className="segmented" data-mode={mode} role="tablist" aria-label="View">
            <span className="seg__pill" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'detail'}
              className={`seg${mode === 'detail' ? ' seg--on' : ''}`}
              onClick={() => setMode('detail')}
            >
              Inspect
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'diff'}
              className={`seg${mode === 'diff' ? ' seg--on' : ''}`}
              onClick={() => setMode('diff')}
            >
              Diff
            </button>
          </div>
          {error ? (
            <span className="topbar__err mono" role="alert" aria-live="polite">
              {error}
            </span>
          ) : null}
        </div>
      </header>

      <div className="body">
        <aside className="side">

        {capsules && capsules.length > 0 ? (
          <div className="side__stat">
            <span className="side__stat-n mono">{capsules.length}</span>
            <span className="side__stat-l">
              capsule{capsules.length === 1 ? '' : 's'}
              <br />
              captured
            </span>
          </div>
        ) : null}

        <div className="side__scroll">
          {capsules === null ? (
            <TimelineSkeleton />
          ) : capsules.length === 0 ? (
            <div className="hint">
              No capsules yet.
              <br />
              Run <code className="mono">npm run demo</code>.
            </div>
          ) : (
            <Timeline
              capsules={capsules}
              selectedId={selectedId}
              onSelect={(id) => {
                selPinned.current = true;
                setSelectedId(id);
                retargetDiff(capsules, id);
                setMode('detail');
              }}
            />
          )}
        </div>

        <div className="kbd-hint">
          <span>
            <kbd>j</kbd>
            <kbd>k</kbd> move
          </span>
          <span>
            <kbd>d</kbd> diff
          </span>
          <span>
            <kbd>i</kbd> inspect
          </span>
        </div>
      </aside>

      <main className="main">
        <div className="stage">
          <div className="stage__inner" key={capsules && capsules.length === 0 ? 'empty' : mode}>
            {capsules && capsules.length === 0 ? (
              <FirstRun />
            ) : mode === 'detail' ? (
              <Detail id={selectedId} onShowDiff={showDiff} />
            ) : (
              <DiffView
                capsules={capsules ?? []}
                a={diffA}
                b={diffB}
                onA={(id) => {
                  diffPinned.current = true;
                  setDiffA(id);
                }}
                onB={(id) => {
                  diffPinned.current = true;
                  setDiffB(id);
                }}
              />
            )}
          </div>
        </div>

        <footer className="footer">
          <div className="footer__lead">
            <Mascot />
            <span className="footer__tag">
              <RotatingTagline />
            </span>
          </div>
          <Sponsors />
        </footer>
      </main>
      </div>
    </div>
  );
}
