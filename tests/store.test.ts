import { describe, expect, it } from 'vitest';
import { CapsuleStore } from '../src/core/store';
import { CapsuleNotFoundError } from '../src/core/errors';
import { InMemoryBackend } from '../src/adapters/memory';
import type { BackendState } from '../src/core/types';

const healthy: BackendState = {
  schemaVersion: '1',
  tables: {
    products: [
      { id: 'p1', name: 'Cap', price: 25 },
      { id: 'p2', name: 'Tee', price: 18 },
    ],
  },
};

describe('CapsuleStore on InMemoryBackend', () => {
  it('freezes, lists, and restores a capsule (id with and without prefix)', async () => {
    const backend = new InMemoryBackend();
    backend.setLive(healthy);
    const store = new CapsuleStore(backend);

    const meta = await store.freeze('healthy');
    expect(meta.id).toMatch(/^healthy-[0-9a-f]{4}$/);
    expect(meta.schemaVersion).toBe('1');

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(meta.id);

    expect(await store.restore(meta.id)).toEqual(healthy);
    expect(await store.restore(store.shareUrl(meta.id))).toEqual(healthy);
  });

  it('diffs a healthy snapshot against a broken one and shows the removed row', async () => {
    const backend = new InMemoryBackend();
    backend.setLive(healthy);
    const store = new CapsuleStore(backend);
    const good = await store.freeze('healthy');

    // production mutates live: delete p2
    backend.setLive({
      schemaVersion: '1',
      tables: { products: [{ id: 'p1', name: 'Cap', price: 25 }] },
    });
    const bad = await store.freeze('crash');

    const d = await store.diff(good.id, bad.id);
    expect(d.tables.products.removed).toEqual([{ id: 'p2', name: 'Tee', price: 18 }]);
    expect(d.tables.products.added).toEqual([]);
    // the earlier branch is unaffected by the later live mutation (clone isolation)
    expect(await store.restore(good.id)).toEqual(healthy);
  });

  it('throws a clear, typed error when restoring an unknown id', async () => {
    const store = new CapsuleStore(new InMemoryBackend());
    await expect(store.restore('nope-0000')).rejects.toBeInstanceOf(CapsuleNotFoundError);
    await expect(store.restore('nope-0000')).rejects.toThrow(/No capsule found/);
  });
});
