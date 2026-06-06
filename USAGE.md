# Capsule — Usage Guide

**Version control for a running backend.** Freeze the whole backend state into a
capsule (commit), restore that exact state later (checkout), and diff two
capsules to see precisely which rows changed. When a request crashes, Capsule
auto-freezes the exact state that caused it — so you stop *reproducing* bugs and
start *restoring* them.

> This is a living document. The **Done now** and **Coming soon** sections are
> kept current as features ship.

---

## Quickstart

```bash
npm install
npm run demo                       # the whole story in one command (mock backend)
npm run demo:insforge              # the same story, live on your InsForge backend
npm run api                        # http://localhost:4000  (API + dashboard)
npm run dev:dashboard              # http://localhost:5173  (live UI, proxies /api)
```

`npm run demo` seeds a tiny production DB, freezes a **healthy** capsule, deletes
a product, runs the same checkout inside `guard()` so the crash auto-freezes, and
diffs the two — printing the deleted product as the root cause.

---

## The four ways to use Capsule — and when

### 1) SDK — capture crashes automatically *(use inside your app)*
**When:** you want every production crash to auto-freeze the exact state behind it.

```ts
import { initCapsule } from 'capsule';
import { getAdapter } from 'capsule/config';

const capsule = initCapsule(getAdapter());

// wrap a handler…
app.post('/checkout', (req, res) =>
  capsule.guard(() => checkout(req.body), { request: req, session: req.session })
);

// …or catch everything (Express-style):
app.use(capsule.errorMiddleware());
```
On a throw, `guard` freezes a `crash` capsule, attaches `err.capsuleId`, logs the
`capsule://` handle, and **re-throws your original error unchanged**. Secrets/PII
in the request body, headers, and session are redacted; bodies > 32 KB truncated.

### 2) CLI — manual snapshots & diffs *(use from your terminal / CI)*
**When:** freeze before a risky migration; inspect/diff/restore by hand; scripting.

```bash
capsule connect                        # one-time InsForge setup (see above)
capsule freeze --label pre-migration   # snapshot current state
capsule list                           # newest first; red dot = captured an error
capsule diff <a> <b>                   # git-style data diff
capsule restore <id>                   # load a capsule's exact state (accepts capsule://id)
capsule share <id>                     # capsule:// handle + a dashboard deep-link
capsule session <id> --role view|edit  # mint a shareable live-session link (signed)
```
Unknown id → clear message + exit code 1.

### 3) MCP — let an AI agent drive Capsule *(use from Claude / any MCP client)*
**When:** you want your coding agent to freeze/restore/diff/list while debugging.

```bash
npm run mcp     # stdio server "capsule" exposing capsule_freeze / restore / diff / list
```
Point your MCP client at that command; the four `capsule_*` tools appear with zod schemas.

### 4) Dashboard + API — the visual time machine *(use to triage)*
**When:** you want to *see* the timeline, inspect a crash, and diff to the root cause.

```bash
npm run api            # serves the built dashboard + JSON API on :4000
npm run dev:dashboard  # live-editing dev server on :5173
```
Timeline of capsules (each tagged with its **problem category**) → **Inspect**
(the **frozen backend rows**, the **rows affected** vs the healthy baseline, a
one-click **AI root-cause** via InsForge Model Gateway, the captured error +
redacted request/session) → **Diff** (terminal-style; the changed/removed rows)
→ **Restore**. Selecting a capsule re-targets the diff to *that capsule vs its
own baseline*.

### When to use what
| Surface | Use it for |
| --- | --- |
| **SDK** | automatic capture in a running app |
| **CLI** | manual / scripted snapshots, diffs, CI gates |
| **MCP** | agent-driven debugging |
| **Dashboard** | visual triage and root-cause |

---

## Configuration
```bash
CAPSULE_ADAPTER=mock        # default — file-backed under .capsule/, zero setup
CAPSULE_ADAPTER=memory      # in-process (tests)
CAPSULE_ADAPTER=insforge    # real InsForge backend   (see "Connecting InsForge")
```
Swapping the adapter changes nothing else in your code.

## Connecting InsForge (one command)
```bash
npx @insforge/cli login && npx @insforge/cli link   # link this folder to your project
npm run capsule -- connect                          # discovers tables, ensures the
                                                    # private `capsule` bucket, writes .env
npm run api                                         # → your InsForge capsules, live
```
`connect` writes `.env` (`CAPSULE_ADAPTER=insforge`) so **every surface** (CLI, MCP,
API, dashboard) runs on InsForge with no flags. Manual alternative: set `INSFORGE_URL`
+ `INSFORGE_API_KEY` in `.env` instead of linking. `CAPSULE_TABLES` is optional
(auto-discovered).

Under the hood: `freeze` selects all rows from your tables and stores the snapshot as
a JSON object in the `capsule` bucket; `restore` / `diff` read those back. (Large
tables snapshot in one page for now — pagination is on the roadmap.)

> See **[COMPARISON.md](./COMPARISON.md)** for the same bug debugged *without* vs
> *with* Capsule — the case for onboarding every InsForge user.

---

## ✅ Done now
- `freeze / restore / diff / list / share` across **CLI, SDK, MCP, API, and the dashboard**.
- Automatic crash capture via `guard()` / `errorMiddleware()`, with secret/PII
  redaction + 32 KB body truncation, never masking your original error.
- Deterministic data diff (id-keyed, hash fallback, schema-drift flag).
- File-backed **mock** + in-memory adapters (run with zero setup).
- **Real InsForge backend** (`CAPSULE_ADAPTER=insforge`) — snapshots your live
  database and stores capsules in InsForge Storage. Verified end-to-end on a live
  project (CLI + dashboard). See **Connecting InsForge** above.
- **`capsule connect`** — one-command onboarding (discover tables, ensure bucket, write `.env`).
- **Shareable deep-links** — `capsule share <id>` prints a dashboard URL
  (`/?capsule=<id>`, or `/?from=<a>&to=<b>`) that opens straight to that capsule/diff;
  the dashboard's Inspect and Diff views each have a **Share** button that copies the
  same deep-link to your clipboard.
- **Signed session links** — `capsule session <id> --role view|edit` mints a
  capability link (HMAC-signed, role-scoped, expiring) for collaborative debugging.
- Terminal-themed dashboard (timeline · inspect · diff · restore) with a live
  **connection badge** showing which backend adapter is serving (InsForge·live /
  Mock / Memory) via `GET /api/health`, and a first-run empty state when no capsules
  exist yet.
- **Live InsForge crash demo** — `npm run demo:insforge` seeds `products`, freezes
  healthy, triggers a real `guard()` crash (auto-frozen with error/stack + redacted
  secrets), diffs to the deleted row, and resets the table — the whole story on the
  real backend.
- **Inspect shows the captured *state*, not just the error** — the frozen backend
  rows (as a data table), the **rows affected** vs the healthy baseline, and the
  captured error/request/session. Selecting any capsule re-targets the **Diff** to
  that capsule vs its own baseline (each capsule shows its own change).
- **AI root-cause** — the **Ask agent to fix** button hands the capsule (error +
  diff + frozen rows) to **InsForge Model Gateway** (OpenRouter) and returns a
  plain-English root cause + fix. Server-side only; key provisioned by
  `npx @insforge/cli ai setup`.
- **Problem categories** — every crash is auto-sorted into one of ~11 categories
  (Missing reference, Null/undefined, Permission/RLS, Validation, Constraint
  violation, Timeout/network, …) from the real error, shown on each timeline card.
- Flat InsForge theme (plain colors, **no glows**) with a clearly partitioned sidebar.
- End-to-end demo + 30 passing tests.

## ⏳ Coming soon (scaffolded, not yet wired)
- **Live co-watch sessions** — open a session link and a teammate hops in to debug
  together (presence + synced view, then annotations + roles). The capability tokens
  are ready (signed view/edit, RLS-enforced model chosen); the realtime layer
  (API SSE + dashboard) is the next increment.
- **Deeper InsForge integration** — capsule metadata in an InsForge **Database**
  table (queryable, RLS-ready), a **Realtime** live capsule feed, and **Auth + RLS**
  on capsule access. (Model Gateway is already wired, for AI root-cause.)
- **Maintenance hooks** — `anonymize` (staging mirrors), `gc` (retention),
  `checkInvariants` (proactive bad-state alerts).

## 🔮 Future roadmap (overall)
> When an item ships, it moves up to **Done now** and a new one is added here.

- **One-click reproduce** ⭐ — restore a crash capsule into an isolated InsForge
  preview branch and re-run the failing request against it (deterministic repro).
- **Invariant monitoring** — declare data invariants; auto-freeze + alert the
  instant one breaks, *before* the crash reaches a user.
- **PII-safe staging mirrors** — restore a production capsule into staging with
  secrets/PII scrubbed.
- **Shareable capsule viewer** — `capsule://id` opens a hosted page a teammate can read.
- **CI data-diff on PRs** — a GitHub Action comments the row-level diff of a deploy/migration.
- **Bisect** — binary-search a timeline of capsules to find where an invariant first broke.
- **Retention + delta storage** — store diffs instead of full snapshots; auto-prune.
- **Auth + multi-tenant** (InsForge auth) — projects/teams, RBAC.
- **MTTR dashboard** — capsules/day, bugs caught pre-crash, time-to-restore.
