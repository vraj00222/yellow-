import type { CapsuleMeta } from '../types';
import { relativeTime } from '../format';
import { categorize } from '../categorize';

interface Props {
  capsules: CapsuleMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Timeline({ capsules, selectedId, onSelect }: Props) {
  return (
    <nav className="rail" aria-label="Capsule timeline">
      {capsules.map((c, i) => {
        const active = c.id === selectedId;
        const isError = Boolean(c.context.error);
        const isLatest = i === 0;
        const category = categorize(c);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`tl-item${active ? ' tl-item--active' : ''}${isLatest ? ' tl-item--latest' : ''}`}
            aria-current={active}
          >
            <span className="tl-gutter" aria-hidden="true">
              <span
                className={`tl-node${isError ? ' tl-node--error' : ''}${active ? ' tl-node--active' : ''}`}
              />
            </span>
            <span className="tl-card">
              <span className="tl-card__top">
                <span className="tl-card__lead">
                  <span className="tl-card__label">{c.label}</span>
                  {isLatest && <span className="tl-tag">latest</span>}
                </span>
                <span className="tl-card__time">{relativeTime(c.createdAt)}</span>
              </span>
              <span className="tl-card__id mono">{c.id}</span>
              {category && <span className="tl-card__cat">{category}</span>}
              {isError && c.context.error && (
                <span className="tl-card__err">{c.context.error.message}</span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
