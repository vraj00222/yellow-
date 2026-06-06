import { describe, it, expect } from 'vitest';
import { HEALTHY_PRODUCTS } from '../demo/insforge-seed';

describe('demo/insforge-seed', () => {
  it('HEALTHY_PRODUCTS is p1/p2/p3 with the required fields', () => {
    expect(HEALTHY_PRODUCTS.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    for (const p of HEALTHY_PRODUCTS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.price).toBe('number');
      expect(typeof p.stock).toBe('number');
    }
  });

  it('p2 is the Studio Tee the demo deletes', () => {
    expect(HEALTHY_PRODUCTS.find((p) => p.id === 'p2')?.name).toBe('Studio Tee');
  });
});
