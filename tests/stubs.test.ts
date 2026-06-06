import { describe, expect, it } from 'vitest';
import { ReplicasAgent } from '../src/agents/replicas';
import type { CapsuleMeta, StateDiff } from '../src/core/types';

const meta: CapsuleMeta = {
  id: 'crash-0000',
  label: 'crash',
  createdAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: '1',
  context: {},
};

const diff: StateDiff = {
  schemaDrift: false,
  schemaVersionA: '1',
  schemaVersionB: '1',
  addedTables: [],
  removedTables: [],
  tables: {},
};

describe('ReplicasAgent (stub)', () => {
  it('throws "not wired yet" until Replicas credits land', async () => {
    await expect(new ReplicasAgent().proposeFix(meta, diff)).rejects.toThrow(/not wired yet/i);
  });
});
