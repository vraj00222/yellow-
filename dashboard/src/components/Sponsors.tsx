// "Powered by" — the two hackathon sponsors only.

const SPONSORS = ['InsForge', 'Replicas'];

export function Sponsors() {
  return (
    <div className="sponsors" aria-label="Powered by">
      <span className="sponsors__label mono">powered by</span>
      <div className="sponsors__list">
        {SPONSORS.map((name) => (
          <span className="spon" key={name}>
            <span className="spon__dot" aria-hidden="true" />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
