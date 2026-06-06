/** Shimmer placeholders shown while data loads. Purely decorative. */

export function TimelineSkeleton() {
  return (
    <div className="rail" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="tl-item" key={i}>
          <span className="tl-gutter">
            <span className="tl-node skel-node" />
          </span>
          <span className="tl-card">
            <span className="skel" style={{ width: '58%', height: 13 }} />
            <span className="skel" style={{ width: '42%', height: 11 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="panel" aria-hidden="true">
      <span className="skel" style={{ width: '28%', height: 10, marginBottom: 16 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="skel" style={{ width: `${82 - i * 14}%`, height: 12, marginTop: 9 }} />
      ))}
    </div>
  );
}
