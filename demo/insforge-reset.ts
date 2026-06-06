import { createAdminClient } from '@insforge/sdk';
import { loadCredentials } from '../src/adapters/insforge';
import { resetHealthy } from './insforge-seed';

// Restore the demo `products` table to its healthy baseline (p1, p2, p3).
async function main(): Promise<void> {
  const { baseUrl, apiKey } = loadCredentials();
  const db = createAdminClient({ baseUrl, apiKey }).database;
  await resetHealthy(db);
  console.log('✓ products reset to healthy (p1 Aero Cap, p2 Studio Tee, p3 Travel Mug)');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
