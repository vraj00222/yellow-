# Spec — InsForge live crash demo (`npm run demo:insforge`)

> Status: approved (design). Date: 2026-06-05. Owner: Vraj.
> Goal: a one-command, on-stage **live guarded crash against real InsForge** that
> auto-freezes a *rich* crash capsule, so the dashboard demo (Inspect → Diff →
> Restore) tells the whole story on the sponsor backend — not just on the mock.

## Why
Today the full crash story (error + stack + redacted secrets) only exists on the
**mock** (`npm run demo`). The **live InsForge** capsules are bare snapshots
(`context: {}`), so *Inspect* is weak on InsForge even though the **data diff
already works live** (`p2` removed). This closes that gap: produce a crash capsule
on InsForge that carries the error, stack, and redacted request/session — captured
**automatically by `guard()`**, exactly as a real app would.

## Demo storyboard (~2 min, judges)
Pre: `npm run api` running; dashboard open (ConnBadge = "InsForge·live").
1. **Trigger (live terminal, ~20s):** `npm run demo:insforge` prints seed → froze
   healthy → checkout OK → bad deploy deletes `p2` → checkout ✗ → `crash captured
   → capsule://crash-yyyy` → products reset ✓ → a `/?from=…&to=…` deep-link.
2. **Inspect the flagged crash (~25s):** red node; Error + stack; Request with
   `card: ***redacted***`; Session with `token: ***redacted***`.
3. **Diff = climax (~30s):** press `d` → terminal diff resolves to `- p2 Studio Tee`.
4. **Restore + InsForge proof (~25s):** Restore loads the exact state; flash the
   InsForge console (Storage `capsule` bucket objects + Database `products`).
   Tagline: "git for a running backend, powered by InsForge."

## Approach (chosen: A)
A standalone `demo/` script. `demo/` is the **sanctioned exception** to the adapter
rule (it legitimately simulates the production app). Freeze/crash go through the
real product path (`getAdapter()` → `initCapsule()` → `guard()`); the `products`
writes use a direct `@insforge/sdk` admin client. **No changes** to
`core/sdk/cli/api/dashboard` or the `BackendAdapter` interface.

Rejected: (B) a `capsule demo` CLI subcommand — would force the CLI to write
`products` via the SDK, breaking the adapter rule. (C) an HTTP `/checkout` app —
more realistic but more to build + more stage risk; revisit later.

## Components
| File | Responsibility |
| --- | --- |
| `demo/insforge-seed.ts` (new) | Pure-ish `products` helpers over an admin client: `seedHealthy()` = delete ids `[p1,p2,p3]` then insert the 3 healthy rows; `breakState()` = delete `p2`; `resetHealthy()` = `seedHealthy()`. Idempotent; no PK/upsert assumptions. |
| `demo/insforge-crash.ts` (new) | Orchestrates the run (below). Builds the admin client + `getAdapter()`/`initCapsule()`; reuses `demo/checkout.ts` + the same cart/request/session. |
| `src/adapters/insforge.ts` | **Export** the existing `loadCredentials()` (additive) so the demo reuses one creds path. No behavior change. |
| `package.json` | add `"demo:insforge": "tsx demo/insforge-crash.ts"`. |
| `USAGE.md` / `CODEBASE.md` | document `demo:insforge` after it's verified live. |

## Data flow (run order)
1. `seedHealthy()` → `products` = {p1 Aero Cap 25/40, p2 Studio Tee 18/5, p3 Travel Mug 12/80}.
2. `store.freeze('healthy')` → snapshot (3 rows) → capsule on InsForge.
3. Guarded checkout OK (contrast beat): `guard(() => checkout(await adapter.snapshotState(), cart), { request, session })` → prints receipt total.
4. `breakState()` → delete `p2` ("bad deploy").
5. Guarded checkout **throws** `Cart c1 references missing product p2` → `guard`
   snapshots current (broken, 2 rows) + error + **redacted** request(`card`)/session(`token`),
   freezes `crash`, re-throws → caught at top level; print id + deep-link.
6. `finally`: `resetHealthy()` → `products` back to 3 rows (live table clean).

Request/session reused from `demo/run-demo.ts`: body `{ cartId:'c1', card:'4111111111111111' }`,
session `{ userId:'u1', token:'sek_live_9f2c' }` → both redacted by the SDK.

## `products` schema assumption
Columns observed live: `id` (text, e.g. `"p2"`), `name`, `price`, `stock`. Seeding
uses **delete-by-id + insert** (not upsert) to avoid PK/conflict-target guesswork.
Exact `@insforge/sdk` calls (`.from('products').insert([...])`, `.delete().in('id', […])` /
`.eq('id','p2')`) confirmed via the `insforge` skill during implementation.

## Error handling / safety
- `resetHealthy()` runs in a `finally` so the live table is restored even if a step throws.
- The expected crash is caught at top level; the script exits **0** with a clean
  summary (never looks like a failure on stage), like `demo/run-demo.ts`.
- The freeze path already swallows capture failures and never masks the original error.

## Testing / verification
- Unit: a small test for `seedHealthy()`'s **dataset shape** (the 3 healthy rows) —
  pure data, no network. (SDK calls themselves are integration, exercised live.)
- Integration (the real gate): run `npm run demo:insforge` against InsForge → expect
  `crash` capsule with `context.error`; `capsule diff healthy-… crash-…` shows `- p2`;
  `products` ends at 3 rows. Re-run twice to prove idempotency + cleanup.
- Keep `npm run typecheck` + `npm test` green before committing.

## Out of scope (later increments)
- Cleaning old bare capsules from the bucket (optional manual pre-demo polish).
- HTTP `/checkout` app (Approach C). Live co-watch sessions. Frontend/website
  redesign ideas (user has these for later).
