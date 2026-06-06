import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapsuleStore } from '../src/core/store';
import { CapsuleNotFoundError } from '../src/core/errors';
import { MockBackend } from '../src/adapters/mock';
import type { BackendState } from '../src/core/types';

const dirs: string[] = [];
async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'capsule-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const state: BackendState = { schemaVersion: '1', tables: { products: [{ id: 'p1' }] } };

describe('MockBackend', () => {
  it('persists capsules across separate adapter instances (process-independent)', async () => {
    const root = await tempRoot();

    // "process 1": freeze
    const writer = new MockBackend(root);
    await writer.writeLiveState(state);
    const meta = await new CapsuleStore(writer).freeze('healthy');

    // "process 2": a fresh adapter on the same dir sees the frozen capsule
    const reader = new CapsuleStore(new MockBackend(root));
    const list = await reader.list();
    expect(list.map((m) => m.id)).toContain(meta.id);
    expect(await reader.restore(meta.id)).toEqual(state);
  });

  it('returns empty state when live data is missing (never crashes)', async () => {
    const backend = new MockBackend(await tempRoot());
    expect(await backend.snapshotState()).toEqual({ schemaVersion: '0', tables: {} });
  });

  it('throws CapsuleNotFoundError for an unknown branch', async () => {
    const backend = new MockBackend(await tempRoot());
    await expect(backend.loadBranch('ghost-0000')).rejects.toBeInstanceOf(CapsuleNotFoundError);
  });
});
