import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MockBackend } from '../src/adapters/mock';
import { initCapsule } from '../src/sdk';
import { checkout, type Cart } from './checkout';
import type { BackendState } from '../src/core/types';

const ROOT = resolve(process.cwd(), '.capsule');

const healthy: BackendState = {
  schemaVersion: '1',
  tables: {
    products: [
      { id: 'p1', name: 'Aero Cap', price: 25, stock: 40 },
      { id: 'p2', name: 'Studio Tee', price: 18, stock: 5 },
      { id: 'p3', name: 'Travel Mug', price: 12, stock: 80 },
    ],
    carts: [{ id: 'c1', userId: 'u1', items: [{ productId: 'p2', qty: 1 }, { productId: 'p1', qty: 2 }] }],
    users: [{ id: 'u1', email: 'sam@example.com', plan: 'pro' }],
  },
};

const cart: Cart = {
  id: 'c1',
  userId: 'u1',
  items: [
    { productId: 'p2', qty: 1 },
    { productId: 'p1', qty: 2 },
  ],
};

async function main(): Promise<void> {
  // Start from a clean store so the timeline shows exactly this run.
  await rm(ROOT, { recursive: true, force: true });

  const backend = new MockBackend(ROOT);
  const { store, guard } = initCapsule(backend);

  console.log('① seed a healthy production database');
  await backend.writeLiveState(healthy);
  const healthyMeta = await store.freeze('healthy');
  console.log(`   frozen ${store.shareUrl(healthyMeta.id)}`);

  console.log('② run checkout against the healthy snapshot');
  const ok = checkout(await store.restore(healthyMeta.id), cart);
  console.log(`   ✓ checkout OK — receipt total $${ok.total}`);

  console.log('③ a bad change deletes product p2 (Studio Tee) and bumps p1');
  const broken = structuredClone(healthy);
  broken.tables.products = broken.tables.products.filter((p) => p.id !== 'p2');
  broken.tables.products[0] = { ...broken.tables.products[0], price: 30, stock: 38 };
  await backend.writeLiveState(broken);

  console.log('④ run checkout inside capsule.guard() — the crash auto-freezes');
  let crashId: string | undefined;
  try {
    await guard(async () => checkout(await backend.snapshotState(), cart), {
      request: { method: 'POST', url: '/checkout', body: { cartId: cart.id, card: '4111111111111111' } },
      session: { userId: 'u1', token: 'sek_live_9f2c' },
    });
  } catch (err) {
    crashId = (err as { capsuleId?: string }).capsuleId;
    console.log(`   ✗ ${(err as Error).message}`);
    console.log(`   captured ${store.shareUrl(crashId ?? '<none>')}`);
  }
  if (!crashId) throw new Error('demo invariant failed: checkout did not crash');

  console.log('⑤ diff healthy → crash to find the root cause\n');
  const diff = await store.diff(healthyMeta.id, crashId);
  const removed = diff.tables.products?.removed ?? [];
  if (removed.length === 0) throw new Error('demo invariant failed: expected a removed product');

  console.log('─'.repeat(60));
  for (const p of removed) {
    console.log(`  ROOT CAUSE  product "${p.id}" (${p.name}) was deleted between`);
    console.log(`              ${healthyMeta.id} and ${crashId} — that is the bug.`);
  }
  console.log('─'.repeat(60));
  console.log(`\n  Inspect it: npm run api  +  npm run dev:dashboard`);
  console.log(`  Compare ${healthyMeta.id}  →  ${crashId}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
