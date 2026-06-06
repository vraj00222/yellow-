import type { CapsuleMeta } from './types';

/**
 * The taxonomy of problems Capsule catches. Each crash capsule is sorted into
 * exactly one category by matching the captured error (name + message) against
 * these rules, top to bottom — the first match wins, so order = priority.
 *
 * This is fully dynamic: it reads the real thrown error, never a hardcoded case,
 * so it works for any backend on any error. Healthy snapshots get no category.
 */
const RULES: { label: string; test: RegExp }[] = [
  { label: 'Missing reference', test: /missing|references?\s|not found|no such|does not exist|deleted/i },
  { label: 'Null / undefined', test: /cannot read|of undefined|of null|null is not|undefined is not|reading '/i },
  { label: 'Permission / RLS', test: /permission|denied|forbidden|unauthor|\brls\b|not allowed|\b40[13]\b/i },
  { label: 'Validation', test: /invalid|required|must be|expected .* (got|but)|malformed|not valid/i },
  { label: 'Constraint violation', test: /constraint|unique|duplicate|foreign key|violat/i },
  { label: 'Timeout / network', test: /timeout|timed out|econn|network|fetch failed|socket|\b50[234]\b/i },
  { label: 'Rate limit', test: /rate.?limit|too many|\b429\b/i },
  { label: 'Auth / token', test: /token|expired|\bjwt\b|credential|signature|session/i },
  { label: 'Parse / type', test: /json|parse|syntax|unexpected token|not a function|not iterable|\bnan\b/i },
  { label: 'Out of range', test: /range|out of bounds|index|overflow|negative|exceeds/i },
];

const FALLBACK = 'Runtime error';

/** The problem category for a capsule, or null for a healthy snapshot. */
export function categorize(meta: CapsuleMeta): string | null {
  const err = meta.context.error;
  if (!err) return null;
  const haystack = `${err.name}: ${err.message}`;
  for (const rule of RULES) if (rule.test.test(haystack)) return rule.label;
  return FALLBACK;
}

/** All category labels (for legends / docs). */
export const CATEGORIES = [...RULES.map((r) => r.label), FALLBACK];
