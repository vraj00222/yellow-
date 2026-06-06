import { describe, expect, it } from 'vitest';
import { diffStates } from '../src/core/diff';
import { generateId, slug } from '../src/core/ids';
import type { BackendState } from '../src/core/types';

function state(tables: BackendState['tables'], schemaVersion = '1'): BackendState {
  return { schemaVersion, tables };
}

describe('diffStates', () => {
  it('detects added, removed, and changed rows keyed by id', () => {
    const a = state({
      products: [
        { id: 'p1', name: 'A', price: 10 },
        { id: 'p2', name: 'B', price: 20 },
      ],
    });
    const b = state({
      products: [
        { id: 'p1', name: 'A', price: 15 },
        { id: 'p3', name: 'C', price: 30 },
      ],
    });
    const d = diffStates(a, b);
    expect(d.tables.products.removed).toEqual([{ id: 'p2', name: 'B', price: 20 }]);
    expect(d.tables.products.added).toEqual([{ id: 'p3', name: 'C', price: 30 }]);
    expect(d.tables.products.changed).toHaveLength(1);
    expect(d.tables.products.changed[0].key).toBe('id:"p1"');
    expect(d.tables.products.changed[0].changedFields).toEqual(['price']);
    expect(d.schemaDrift).toBe(false);
  });

  it('reports no changes for identical states', () => {
    const a = state({ users: [{ id: 'u1', name: 'Z' }] });
    const b = state({ users: [{ id: 'u1', name: 'Z' }] });
    const d = diffStates(a, b);
    expect(d.tables.users.added).toEqual([]);
    expect(d.tables.users.removed).toEqual([]);
    expect(d.tables.users.changed).toEqual([]);
  });

  it('keys rows without id on a stable content hash (never crashes)', () => {
    const a = state({ logs: [{ msg: 'a' }, { msg: 'b' }] });
    const b = state({ logs: [{ msg: 'b' }, { msg: 'c' }] });
    const d = diffStates(a, b);
    expect(d.tables.logs.removed).toEqual([{ msg: 'a' }]);
    expect(d.tables.logs.added).toEqual([{ msg: 'c' }]);
    expect(d.tables.logs.changed).toEqual([]);
  });

  it('flags schema drift and reports added/removed tables', () => {
    const a = state({ products: [{ id: 'p1' }], legacy: [{ id: 'x' }] }, '1');
    const b = state({ products: [{ id: 'p1' }], orders: [{ id: 'o1' }] }, '2');
    const d = diffStates(a, b);
    expect(d.schemaDrift).toBe(true);
    expect(d.schemaVersionA).toBe('1');
    expect(d.schemaVersionB).toBe('2');
    expect(d.addedTables).toEqual(['orders']);
    expect(d.removedTables).toEqual(['legacy']);
  });

  it('is deterministic regardless of input row order', () => {
    const a = state({ t: [{ id: 'b' }, { id: 'a' }, { id: 'c' }] });
    const b = state({ t: [{ id: 'c' }, { id: 'a' }] });
    const d = diffStates(a, b);
    expect(d.tables.t.removed).toEqual([{ id: 'b' }]);
  });
});

describe('id generator', () => {
  it('slugifies labels and falls back for empty input', () => {
    expect(slug('Checkout Crash!')).toBe('checkout-crash');
    expect(slug('   ')).toBe('capsule');
  });

  it('regenerates on collision with existing ids', () => {
    const existing = new Set<string>();
    const id = generateId('healthy', existing);
    expect(id).toMatch(/^healthy-[0-9a-f]{4}$/);
    existing.add(id);
    expect(generateId('healthy', existing)).not.toBe(id);
  });
});
