import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Capability tokens for live debugging sessions.
 *
 * A token is `base64url(claims).base64url(HMAC-SHA256(claims))` — stateless,
 * tamper-proof, role-scoped, and time-limited. The client never decides its own
 * role: the server mints the token and re-verifies it (signature + expiry +
 * role) on every privileged action. Revocation is handled at the session layer
 * (a server-side revoked-set + short TTLs); this module is the crypto core.
 */
export type Role = 'view' | 'edit' | 'owner';

interface Claims {
  s: string; // session id
  r: Role; // role
  e: number; // expiry, epoch seconds
}

const ROLES: ReadonlySet<string> = new Set<Role>(['view', 'edit', 'owner']);

function secret(): string {
  const value = process.env.CAPSULE_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      'CAPSULE_SESSION_SECRET is required (>=16 chars). Run `capsule connect` to generate one.',
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Mint a signed capability token. Default TTL 24h. */
export function mintToken(sessionId: string, role: Role, ttlSeconds = 86_400): string {
  const claims: Claims = { s: sessionId, r: role, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Verify a token → its session id + role. Throws on bad signature, expiry, or shape. */
export function verifyToken(token: string): { sessionId: string; role: Role } {
  const dot = token.indexOf('.');
  if (dot <= 0) throw new Error('malformed token');
  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('bad signature');
  }
  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
  } catch {
    throw new Error('bad payload');
  }
  if (typeof claims.s !== 'string' || !claims.s) throw new Error('bad session');
  if (!ROLES.has(claims.r)) throw new Error('bad role');
  if (typeof claims.e !== 'number' || claims.e < Math.floor(Date.now() / 1000)) {
    throw new Error('token expired');
  }
  return { sessionId: claims.s, role: claims.r };
}

/** A fresh, unguessable session id. */
export function newSessionId(): string {
  return randomBytes(9).toString('base64url');
}
