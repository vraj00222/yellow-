import { randomBytes } from 'node:crypto';

/** Lowercase, hyphenate, strip edges. Empty input falls back to "capsule". */
export function slug(label: string): string {
  const s = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'capsule';
}

function randomHex(chars: number): string {
  return randomBytes(Math.ceil(chars / 2))
    .toString('hex')
    .slice(0, chars);
}

/**
 * `slug(label)-<4 hex>`. Regenerates on collision with an existing id, so two
 * capsules with the same label never clash.
 */
export function generateId(label: string, existingIds: ReadonlySet<string>): string {
  const base = slug(label);
  let id = `${base}-${randomHex(4)}`;
  while (existingIds.has(id)) {
    id = `${base}-${randomHex(4)}`;
  }
  return id;
}
