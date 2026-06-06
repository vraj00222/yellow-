import { describe, expect, it } from 'vitest';
import { checkout } from '../demo/checkout';
import type { BackendState } from '../src/core/types';

const state: BackendState = {
  schemaVersion: '1',
  tables: {
    products: [
      { id: 'p1', name: 'Cap', price: 25 },
      { id: 'p2', name: 'Tee', price: 18 },
    ],
  },
};

describe('demo checkout (data-dependent bug)', () => {
  it('totals a valid cart', () => {
    const receipt = checkout(state, {
      id: 'c1',
      userId: 'u1',
      items: [
        { productId: 'p1', qty: 2 },
        { productId: 'p2', qty: 1 },
      ],
    });
    expect(receipt.total).toBe(68);
    expect(receipt.lines).toHaveLength(2);
  });

  it('throws when a cart references a deleted product', () => {
    expect(() =>
      checkout(state, { id: 'c1', userId: 'u1', items: [{ productId: 'p2', qty: 1 }] }),
    ).not.toThrow();
    const broken: BackendState = { schemaVersion: '1', tables: { products: [{ id: 'p1', name: 'Cap', price: 25 }] } };
    expect(() =>
      checkout(broken, { id: 'c1', userId: 'u1', items: [{ productId: 'p2', qty: 1 }] }),
    ).toThrow(/Cart c1 references missing product p2/);
  });
});
