import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Health } from '../types';

const ADAPTER_LABELS: Record<string, string> = {
  insforge: 'InsForge',
  mock: 'Mock',
  memory: 'Memory',
};

/** Live backend-connection chip in the brand row — shows which adapter is serving. */
export function ConnBadge() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .health()
      .then((h) => live && setHealth(h))
      .catch(() => live && setDown(true));
    return () => {
      live = false;
    };
  }, []);

  if (down) {
    return (
      <span className="conn conn--down" title="API unreachable">
        <span className="conn__dot" aria-hidden="true" />
        offline
      </span>
    );
  }
  if (!health) {
    return (
      <span className="conn conn--idle" aria-label="connecting">
        <span className="conn__dot" aria-hidden="true" />
        <span className="conn__skel" />
      </span>
    );
  }

  const isLive = health.adapter === 'insforge';
  const label = ADAPTER_LABELS[health.adapter] ?? health.adapter;
  return (
    <span
      className={`conn${isLive ? ' conn--live' : ''}`}
      title={`Backend adapter: ${health.adapter} · Capsule v${health.version}`}
    >
      <span className="conn__dot" aria-hidden="true" />
      {label}
      {isLive && <span className="conn__tag">live</span>}
    </span>
  );
}
