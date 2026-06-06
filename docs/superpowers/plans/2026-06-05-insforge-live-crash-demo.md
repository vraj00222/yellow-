# InsForge Live Crash Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run demo:insforge` — a one-command live guarded crash against the real InsForge backend that auto-freezes a *rich* crash capsule (error + stack + redacted secrets), then resets the `products` table to healthy.

**Architecture:** A `demo/` script (the sanctioned exception to the adapter rule). Freeze/crash go through the real path (`getAdapter()` → `initCapsule()` → `guard()`); `products` writes use a direct `@insforge/sdk` admin client. No changes to `core/sdk/cli/api/dashboard` or the `BackendAdapter` interface (one additive export only).

**Tech Stack:** TypeScript ESM, `tsx`, `@insforge/sdk` (PostgREST query builder), `vitest`.

---

### Task 1: Products seed helpers + dataset test

**Files:**
- Create: `demo/insforge-seed.ts`
- Test: `tests/insforge-seed.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/insforge-seed.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/insforge-seed.test.ts`
Expected: FAIL — cannot find module `../demo/insforge-seed`.

- [ ] **Step 3: Write minimal implementation**

```ts
// demo/insforge-seed.ts
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

/** Reset `products` to the healthy baseline: delete the demo ids, then insert them. */
export async function seedHealthy(db: Db): Promise<void> {
  const ids = HEALTHY_PRODUCTS.map((p) => p.id);
  const del = await db.from('products').delete().in('id', ids);
  if (del.error) throw new Error(`seed: clear products failed — ${del.error.message}`);
  const ins = await db.from('products').insert(HEALTHY_PRODUCTS);
  if (ins.error) throw new Error(`seed: insert products failed — ${ins.error.message}`);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/insforge-seed.test.ts`
Expected: PASS (2 tests). If the SDK type `InsForgeClient['database']` errors, confirm the exact member via the `insforge` skill and adjust the `Db` alias.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect exit 0)
```bash
git add demo/insforge-seed.ts tests/insforge-seed.test.ts
git commit -m "feat(demo): InsForge products seed/break/reset helpers + dataset test"
```

---

### Task 2: Export `loadCredentials` for reuse

**Files:**
- Modify: `src/adapters/insforge.ts` (the `function loadCredentials` declaration, ~line 148)

- [ ] **Step 1: Make the helper exported (additive, no behavior change)**

Change:
```ts
function loadCredentials(): { baseUrl: string; apiKey: string } {
```
to:
```ts
export function loadCredentials(): { baseUrl: string; apiKey: string } {
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (the in-file call site still resolves; export is additive).

- [ ] **Step 3: Commit** (committed together with Task 3 — the crash script is its only consumer; skip a standalone commit)

---

### Task 3: The live crash orchestrator + npm script

**Files:**
- Create: `demo/insforge-crash.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the orchestrator**

```ts
// demo/insforge-crash.ts
import { createAdminClient } from '@insforge/sdk';
import { getAdapter } from '../src/config';
import { loadCredentials } from '../src/adapters/insforge';
import { initCapsule } from '../src/sdk';
import { checkout, type Cart } from './checkout';
import { seedHealthy, breakState, resetHealthy } from './insforge-seed';
import type { CapsuleRequest } from '../src/core/types';

const cart: Cart = {
  id: 'c1',
  userId: 'u1',
  items: [
    { productId: 'p2', qty: 1 },
    { productId: 'p1', qty: 2 },
  ],
};

const request: CapsuleRequest = {
  method: 'POST',
  url: '/checkout',
  body: { cartId: cart.id, card: '4111111111111111' },
};
const session: Record<string, unknown> = { userId: 'u1', token: 'sek_live_9f2c' };

async function main(): Promise<void> {
  const { baseUrl, apiKey } = loadCredentials();
  const db = createAdminClient({ baseUrl, apiKey }).database;
  const adapter = getAdapter(); // CAPSULE_ADAPTER=insforge (from .env, loaded by config)
  const { store, guard } = initCapsule(adapter);

  console.log('① seed products on InsForge (healthy: 3)');
  await seedHealthy(db);

  try {
    const healthy = await store.freeze('healthy');
    console.log(`② froze healthy → ${store.shareUrl(healthy.id)}`);

    const ok = await guard(async () => checkout(await adapter.snapshotState(), cart), {
      request,
      session,
    });
    console.log(`③ checkout OK — receipt $${ok.total}`);

    console.log('④ bad deploy: product p2 (Studio Tee) deleted');
    await breakState(db);

    let crashId: string | undefined;
    try {
      await guard(async () => checkout(await adapter.snapshotState(), cart), { request, session });
    } catch (err) {
      crashId = (err as { capsuleId?: string }).capsuleId;
      console.log(`⑤ checkout ✗ ${(err as Error).message}`);
    }
    if (!crashId) throw new Error('demo invariant failed: expected a crash capsule');
    console.log(`   crash captured → ${store.shareUrl(crashId)}`);

    const dash = process.env.CAPSULE_DASHBOARD_URL ?? 'http://localhost:4000';
    console.log(`\n→ open ${dash}/?from=${healthy.id}&to=${crashId}\n`);
  } finally {
    await resetHealthy(db);
    console.log('⑥ products reset to healthy ✓');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Add the npm script** to `package.json` `scripts` (after `"demo"`):

```json
    "demo:insforge": "tsx demo/insforge-crash.ts",
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If the `request`/`session` literals error on the `guard` call, mirror `demo/run-demo.ts` (inline the objects) — but explicit `CapsuleRequest` typing should satisfy it.

- [ ] **Step 4: Run the full unit suite (no regressions)**

Run: `npm test`
Expected: all green (previous 28 + 2 new = 30).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/insforge.ts demo/insforge-crash.ts package.json
git commit -m "feat(demo): live InsForge crash trigger (npm run demo:insforge)"
```

---

### Task 4: Verify live end-to-end (the real gate)

**Files:** none (verification only)

- [ ] **Step 1: Run it against real InsForge**

Run: `npm run demo:insforge`
Expected output (ids vary): seed → `② froze healthy → capsule://healthy-…` → `③ checkout OK — receipt $68` → `④ … deleted` → `⑤ checkout ✗ Cart c1 references missing product p2` → `   crash captured → capsule://crash-…` → deep-link → `⑥ products reset to healthy ✓`. Exit code 0.

- [ ] **Step 2: Confirm the crash capsule is rich and the diff shows the bug**

Run: `npm run capsule -- list` (expect a `crash` row with a red ● dot)
Run: `npm run capsule -- diff <healthy-id> <crash-id>`
Expected: `products` → red `- {"id":"p2",…"Studio Tee"…}`.

- [ ] **Step 3: Confirm cleanup + idempotency**

Run: `npm run demo:insforge` a second time.
Expected: same clean run, exit 0 (proves seed/reset are repeatable). The live `products` table ends with 3 rows.

- [ ] **Step 4 (optional): eyeball in the dashboard**

Run: `npm run api`, open the printed deep-link → Inspect shows Error + stack + `card: ***redacted***` + `token: ***redacted***`; Diff shows `- p2 Studio Tee`. Stop the server when done.

---

### Task 5: Docs + final gate

**Files:**
- Modify: `USAGE.md` (Quickstart + Done now)
- Modify: `CODEBASE.md` (demo/tests row + current state)

- [ ] **Step 1: USAGE.md** — under Quickstart add:

```md
npm run demo:insforge              # the same story, live on your InsForge backend
```
and add a "Done now" bullet:
```md
- **Live InsForge crash demo** — `npm run demo:insforge` seeds the `products` table,
  freezes healthy, triggers a real guarded crash (auto-frozen with redacted secrets),
  diffs to the deleted row, and resets the table — the whole story on the real backend.
```

- [ ] **Step 2: CODEBASE.md** — update the demo row and current state:
  - demo row: add `demo/insforge-seed.ts` (products seed/break/reset) and `demo/insforge-crash.ts` (live guarded crash → `npm run demo:insforge`).
  - tests count: 28 → **30**.
  - current state: add `✅ Live InsForge crash demo (npm run demo:insforge) — full freeze→crash→diff→restore story on the real backend, products reset after.`

- [ ] **Step 3: Final gate**

Run: `npm run typecheck && npm test`
Expected: exit 0, 30 passed.

- [ ] **Step 4: Commit**

```bash
git add USAGE.md CODEBASE.md
git commit -m "docs: document npm run demo:insforge (live InsForge crash demo)"
```

---

## Self-Review

**Spec coverage:**
- Storyboard trigger script → Task 3 (orchestrator) + Task 4 (verify). ✓
- `seedHealthy`/`breakState`/`resetHealthy`, delete-by-id+insert → Task 1. ✓
- Reset in `finally` → Task 3 Step 1 (`finally` block). ✓
- Export `loadCredentials` → Task 2. ✓
- Reuse `checkout.ts` + redacted request/session → Task 3 (card/token literals). ✓
- npm script → Task 3 Step 2. ✓
- Docs (USAGE/CODEBASE), test count 30 → Task 5. ✓
- No core/cli/api/dashboard/adapter-interface changes → only `insforge.ts` export (additive). ✓

**Placeholder scan:** none — every code/command step is concrete. The one acknowledged unknown (exact `Db`/builder member names) has a fallback note in Task 1 Step 4 / Task 3 Step 3 (confirm via `insforge` skill), not a placeholder.

**Type consistency:** `HEALTHY_PRODUCTS: Product[]`, `Db = InsForgeClient['database']`, `seedHealthy/breakState/resetHealthy(db: Db)`, `request: CapsuleRequest`, `Cart` from `./checkout`, `guard<T>(fn, { request, session })` per `src/sdk/index.ts` — all consistent across tasks.

**Test-count math:** repo is at 28; Task 1 adds 2 → 30 (used in Task 5).
