import { useEffect, useState } from 'react';

const QUOTES = [
  'save the bad state, not the bug report',
  'cut repro time to one click',
  'freeze the crash, diff the cause',
  'stop reproducing bugs — restore them',
  'turn hours of debugging into a diff',
  'every crash is a restorable snapshot',
];

/** Cycles value-prop taglines with a soft fade. */
export function RotatingTagline() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % QUOTES.length), 3600);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tagline" key={i}>
      {QUOTES[i]}
    </span>
  );
}
