/** Stage-filling first-run state when no capsules exist yet. */
export function FirstRun() {
  return (
    <div className="firstrun">
      <div className="firstrun__glyph" aria-hidden="true">
        <svg width="56" height="36" viewBox="0 0 32 20" fill="none">
          <rect x="1" y="1" width="30" height="18" rx="9" stroke="var(--mint)" strokeWidth="1.6" />
          <line x1="16" y1="4" x2="16" y2="16" stroke="var(--mint)" strokeWidth="1.6" opacity="0.5" />
        </svg>
      </div>
      <h2 className="firstrun__title">No capsules captured yet</h2>
      <p className="firstrun__lead">
        Freeze the bad state, not the bug report. Capture your backend, then diff straight to the
        row that broke it.
      </p>
      <div className="firstrun__cmd mono">
        <span className="tprompt">$</span> npm run demo
      </div>
      <p className="firstrun__hint">
        Seeds a healthy snapshot, triggers a crash, and auto-freezes it. Refresh when it finishes.
      </p>
    </div>
  );
}
