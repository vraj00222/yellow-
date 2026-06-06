export const prefersReduced = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** House easing — a soft, expensive-feeling deceleration. */
export const EASE = 'power3.out';
