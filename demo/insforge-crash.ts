import { createAdminClient } from '@insforge/sdk';
import { getAdapter } from '../src/config';
import { loadCredentials } from '../src/adapters/insforge';
import { initCapsule } from '../src/sdk';
import { checkout, type Cart } from './checkout';
import { seedHealthy, breakState } from './insforge-seed';
import type { CapsuleRequest } from '../src/core/types';

// Simulates the production app: a checkout whose cart references product p2.
const cart: Cart = {
  id: 'c1',
  userId: 'u1',
  items: [
    { productId: 'p2', qty: 1 },
    { productId: 'p1', qty: 2 },
  ],
};

// The request/session carry secrets on purpose — to show redaction in the capsule.
const request: CapsuleRequest = {
  method: 'POST',
  url: '/checkout',
  body: { cartId: cart.id, card: '4111111111111111' },
};
const session: Record<string, unknown> = { userId: 'u1', token: 'sek_live_9f2c' };

async function main(): Promise<void> {
  const { baseUrl, apiKey } = loadCredentials();
  const db = createAdminClient({ baseUrl, apiKey }).database;
  const adapter = getAdapter(); // CAPSULE_ADAPTER=insforge from .env (loaded by config)
  const { store, guard } = initCapsule(adapter);

  console.log('① seed products on InsForge (healthy: 3)');
  await seedHealthy(db);

  const healthy = await store.freeze('healthy');
  console.log(`② froze healthy → ${store.shareUrl(healthy.id)}`);

  const ok = await guard(async () => checkout(await adapter.snapshotState(), cart), {
    request,
    session,
  });
  console.log(`③ checkout OK — receipt $${ok.total}`);

  console.log('④ bad deploy: product p2 (Studio Tee) deleted from InsForge');
  await breakState(db);

  let crashId: string | undefined;
  try {
    await guard(async () => checkout(await adapter.snapshotState(), cart), { request, session });
  } catch (err) {
    crashId = (err as { capsuleId?: string }).capsuleId;
    console.log(`⑤ a checkout request comes in → ✗ ${(err as Error).message}`);
  }
  if (!crashId) throw new Error('demo invariant failed: expected a crash capsule');
  console.log(`   ↳ Capsule caught it and froze the exact state → ${store.shareUrl(crashId)}`);

  const dash = process.env.CAPSULE_DASHBOARD_URL ?? 'http://localhost:4000';
  console.log('\nVerify it — InsForge alone never recorded this crash:');
  console.log('  • InsForge → Database → products: p2 (Studio Tee) is GONE');
  console.log(`  • InsForge → Storage → "capsule" bucket: branches/${crashId}.json + meta/${crashId}.json`);
  console.log(`  • Dashboard → ${dash}/?from=${healthy.id}&to=${crashId}`);
  console.log('      diff → the deleted row · crash → error + request (card/token redacted)');
  console.log('\nRestore the products table when you are done:  npm run demo:reset\n');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
