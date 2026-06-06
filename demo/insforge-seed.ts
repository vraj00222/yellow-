import type { InsForgeClient } from '@insforge/sdk';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

/** The known-healthy baseline the demo seeds and resets to. */
export const HEALTHY_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Aero Cap', price: 25, stock: 40 },
  { id: 'p2', name: 'Studio Tee', price: 18, stock: 5 },
  { id: 'p3', name: 'Travel Mug', price: 12, stock: 80 },
];

type Db = InsForgeClient['database'];

/**
 * Ensure one product row exists with the healthy values. Update first, insert only
 * if the row is missing — we NEVER delete here, so a wrong SDK call surfaces on the
 * first (non-destructive) update and can never leave `products` empty.
 */
async function ensureProduct(db: Db, p: Product): Promise<void> {
  const upd = await db
    .from('products')
    .update({ name: p.name, price: p.price, stock: p.stock })
    .eq('id', p.id)
    .select();
  if (upd.error) throw new Error(`seed: update ${p.id} failed — ${upd.error.message}`);
  if (Array.isArray(upd.data) && upd.data.length > 0) return; // existed → updated
  const ins = await db.from('products').insert([p]);
  if (ins.error) throw new Error(`seed: insert ${p.id} failed — ${ins.error.message}`);
}

/** Reset `products` to the healthy baseline (idempotent, non-destructive). */
export async function seedHealthy(db: Db): Promise<void> {
  for (const p of HEALTHY_PRODUCTS) await ensureProduct(db, p);
}

/** The "bad deploy": delete product p2 so the cart's checkout throws. */
export async function breakState(db: Db): Promise<void> {
  const { error } = await db.from('products').delete().eq('id', 'p2');
  if (error) throw new Error(`break: delete p2 failed — ${error.message}`);
}

/** Restore `products` to healthy after the run. */
export async function resetHealthy(db: Db): Promise<void> {
  await seedHealthy(db);
}
