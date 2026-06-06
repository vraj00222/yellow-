import { describe, expect, it } from 'vitest';
import { initCapsule } from '../src/sdk';
import { InMemoryBackend } from '../src/adapters/memory';

describe('SDK guard', () => {
  it('redacts secret-like keys in body/headers/session and never masks the original error', async () => {
    const { store, guard } = initCapsule(new InMemoryBackend());
    const boom = new Error('checkout failed');

    await expect(
      guard(
        () => {
          throw boom;
        },
        {
          request: {
            method: 'POST',
            url: '/checkout',
            headers: { authorization: 'Bearer abc', 'content-type': 'application/json' },
            body: { cardNumber: '4111111111111111', password: 'hunter2', amount: 42 },
          },
          session: { token: 'sekret', userId: 'u1' },
        },
      ),
    ).rejects.toBe(boom); // exact original error, unmodified

    const [meta] = await store.list();
    expect(meta.label).toBe('crash');
    const body = meta.context.request?.body as Record<string, unknown>;
    expect(body.password).toBe('[REDACTED]');
    expect(body.cardNumber).toBe('[REDACTED]');
    expect(body.amount).toBe(42);
    const headers = meta.context.request?.headers as Record<string, unknown>;
    expect(headers.authorization).toBe('[REDACTED]');
    expect(meta.context.session).toEqual({ token: '[REDACTED]', userId: 'u1' });
    expect(meta.context.error?.message).toBe('checkout failed');
  });

  it('truncates a captured body larger than 32KB', async () => {
    const { store, guard } = initCapsule(new InMemoryBackend());
    await expect(
      guard(
        () => {
          throw new Error('big');
        },
        { request: { body: { blob: 'x'.repeat(40 * 1024) } } },
      ),
    ).rejects.toThrow('big');

    const [meta] = await store.list();
    expect(meta.context.request?.body).toMatch(/^\[TRUNCATED \d+ bytes\]$/);
  });

  it('attaches capsuleId to the thrown error', async () => {
    const { guard } = initCapsule(new InMemoryBackend());
    const err = new Error('x') as Error & { capsuleId?: string };
    await guard(() => {
      throw err;
    }).catch(() => {});
    expect(err.capsuleId).toMatch(/^crash-[0-9a-f]{4}$/);
  });
});
