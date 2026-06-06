import type { CapsuleMeta, StateDiff } from './core/types';

/**
 * Severity bands, qualitative CVSS-style. Order matters: `escalate()` walks up.
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

const ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

interface Rule {
  label: string;
  severity: Severity;
  test: RegExp;
}

/**
 * The taxonomy of problems Capsule catches. A crash is sorted into exactly one
 * category by matching the captured error (name + message), top to bottom — the
 * first match wins, so order = matching priority (NOT severity order).
 *
 * Severity reflects blast radius / risk class:
 *  - critical: data integrity or security (missing refs, constraints, permission)
 *  - high:     the request is broken in a way that needs code (null, auth, parse)
 *  - medium:   bad input or transient infra (validation, rate limit, network)
 *  - low:      benign edge cases (out of range)
 *
 * Fully dynamic: it reads the real thrown error, never a hardcoded case.
 */
const RULES: Rule[] = [
  { label: 'Missing reference', severity: 'critical', test: /missing|references?\s|not found|no such|does not exist|deleted/i },
  { label: 'Null / undefined', severity: 'high', test: /cannot read|of undefined|of null|null is not|undefined is not|reading '/i },
  { label: 'Permission / RLS', severity: 'critical', test: /permission|denied|forbidden|unauthor|\brls\b|not allowed|\b40[13]\b/i },
  // Parse/type before Validation so "not valid JSON" is a parse error, not validation.
  { label: 'Parse / type', severity: 'high', test: /json|parse|syntax|unexpected token|not a function|not iterable|\bnan\b/i },
  { label: 'Validation', severity: 'medium', test: /invalid|required|must be|expected .* (got|but)|malformed|not valid/i },
  { label: 'Constraint violation', severity: 'critical', test: /constraint|unique|duplicate|foreign key|violat/i },
  { label: 'Timeout / network', severity: 'medium', test: /timeout|timed out|econn|network|fetch failed|socket|\b50[234]\b/i },
  { label: 'Rate limit', severity: 'medium', test: /rate.?limit|too many|\b429\b/i },
  { label: 'Auth / token', severity: 'high', test: /token|expired|\bjwt\b|credential|signature|session/i },
  { label: 'Out of range', severity: 'low', test: /range|out of bounds|index|overflow|negative|exceeds/i },
];

const FALLBACK: Rule = { label: 'Runtime error', severity: 'medium', test: /.^/ };

export interface Triage {
  category: string;
  severity: Severity;
}

function escalate(s: Severity): Severity {
  return ORDER[Math.min(ORDER.indexOf(s) + 1, ORDER.length - 1)];
}

/**
 * Category + severity for a capsule, or null for a healthy snapshot.
 * `rowsAffected` (rows that moved vs the healthy baseline) escalates one band
 * when the blast radius is large — a five-row data regression is worse than one.
 */
export function triage(meta: CapsuleMeta, rowsAffected = 0): Triage | null {
  const err = meta.context.error;
  if (!err) return null;
  const haystack = `${err.name}: ${err.message}`;
  const rule = RULES.find((r) => r.test.test(haystack)) ?? FALLBACK;
  const severity = rowsAffected >= 5 ? escalate(rule.severity) : rule.severity;
  return { category: rule.label, severity };
}

/** All category labels (for legends / docs). */
export const CATEGORIES = [...RULES.map((r) => r.label), FALLBACK.label];

/** Total rows that moved (added + removed + changed) — the blast radius. */
export function rowsAffected(diff: StateDiff): number {
  let n = 0;
  for (const t of Object.values(diff.tables)) {
    n += t.added.length + t.removed.length + t.changed.length;
  }
  return n;
}
