import type { CapsuleMeta } from './types';

/**
 * Given the capsule list (newest-first), pick the default diff pair:
 *   B = the latest crash (a capsule that captured an error), else the newest capsule
 *   A = the latest healthy capsule (no error, not B), else the oldest
 * So the dashboard always opens on the most recent crash and its baseline, even as
 * more capsules pile up from repeated `npm run demo:insforge` runs.
 */
export function latestDiffPair(capsules: CapsuleMeta[]): { a: string | null; b: string | null } {
  if (capsules.length === 0) return { a: null, b: null };
  const crash = capsules.find((c) => c.context.error) ?? capsules[0];
  const healthy =
    capsules.find((c) => !c.context.error && c.id !== crash.id) ?? capsules[capsules.length - 1];
  return { a: healthy.id, b: crash.id };
}

/** The capsule to inspect by default: the latest crash, else the newest capsule. */
export function latestInspectId(capsules: CapsuleMeta[]): string | null {
  if (capsules.length === 0) return null;
  return (capsules.find((c) => c.context.error) ?? capsules[0]).id;
}

/**
 * The healthy snapshot a given capsule most likely regressed from: the most
 * recent healthy capsule older than `id`, falling back to the next older one.
 * Used to re-target the diff to "this capsule vs its own baseline" when you
 * select it — so each capsule shows its own change, not one globally-pinned pair.
 * `capsules` is newest-first.
 */
export function baselineFor(capsules: CapsuleMeta[], id: string): string | null {
  const i = capsules.findIndex((c) => c.id === id);
  if (i === -1) return null;
  for (let j = i + 1; j < capsules.length; j++) {
    if (!capsules[j].context.error) return capsules[j].id;
  }
  return capsules[i + 1]?.id ?? null;
}
