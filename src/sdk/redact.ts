/** Keys whose values must never be frozen into a capsule. */
const REDACT_KEY = /password|secret|token|authorization|cookie|ssn|card/i;
const REDACTED = '[REDACTED]';

export const MAX_BODY_BYTES = 32 * 1024;

/**
 * Deep-redact any value whose KEY matches the sensitive pattern. The matched
 * value is replaced wholesale (no recursion into it). Circular references are
 * handled so redaction can never throw inside the freeze path.
 */
export function redact(value: unknown): unknown {
  return redactInner(value, new WeakSet());
}

function redactInner(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redactInner(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEY.test(k) ? REDACTED : redactInner(v, seen);
  }
  return out;
}

/** Redact a request body, then truncate it if it serializes to more than 32KB. */
export function redactBody(body: unknown): unknown {
  if (body === undefined) return undefined;
  const redacted = redact(body);
  const serialized = safeStringify(redacted);
  if (serialized !== undefined && Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
    return `[TRUNCATED ${Buffer.byteLength(serialized, 'utf8')} bytes]`;
  }
  return redacted;
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
