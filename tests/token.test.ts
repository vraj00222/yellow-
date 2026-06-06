import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mintToken, newSessionId, verifyToken } from '../src/sessions/token';

const SAVED = process.env.CAPSULE_SESSION_SECRET;
beforeAll(() => {
  process.env.CAPSULE_SESSION_SECRET = 'unit-test-secret-key-0123456789';
});
afterAll(() => {
  if (SAVED === undefined) delete process.env.CAPSULE_SESSION_SECRET;
  else process.env.CAPSULE_SESSION_SECRET = SAVED;
});

describe('session capability tokens', () => {
  it('round-trips session id + role', () => {
    const sid = newSessionId();
    const { sessionId, role } = verifyToken(mintToken(sid, 'edit'));
    expect(sessionId).toBe(sid);
    expect(role).toBe('edit');
  });

  it('rejects an expired token', () => {
    expect(() => verifyToken(mintToken('s1', 'view', -1))).toThrow(/expired/i);
  });

  it('rejects a tampered token', () => {
    const token = mintToken('s1', 'view');
    const flipped = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(() => verifyToken(flipped)).toThrow(/signature|payload|malformed/i);
  });

  it('rejects a forged role (re-signing requires the secret)', () => {
    const sig = mintToken('s1', 'view').split('.')[1];
    const forgedPayload = Buffer.from(
      JSON.stringify({ s: 's1', r: 'edit', e: Math.floor(Date.now() / 1000) + 999 }),
    ).toString('base64url');
    expect(() => verifyToken(`${forgedPayload}.${sig}`)).toThrow(/signature/i);
  });

  it('requires a secret to mint', () => {
    const saved = process.env.CAPSULE_SESSION_SECRET;
    delete process.env.CAPSULE_SESSION_SECRET;
    try {
      expect(() => mintToken('s1', 'view')).toThrow(/CAPSULE_SESSION_SECRET/);
    } finally {
      process.env.CAPSULE_SESSION_SECRET = saved;
    }
  });
});
