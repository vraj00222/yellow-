# CODEBASE.md — internal map (for Claude Code / contributors)

> **Living index for fast re-onboarding.** Update this file whenever the codebase
> changes (new file, moved responsibility, a stub gets wired). Pairs with
> `CLAUDE.md` (the rules) and `USAGE.md` (the user-facing guide).
>
> Last synced: shipped the **crash → triage → Telegram-approve → heal** workflow.
> Triage (category + **severity**) is now server-side (`src/triage.ts`, single source
> of truth; the dashboard's old `categorize.ts` is deleted). A **watcher + Telegram
> long-poll loop** (`src/notify/`) auto-alerts the developer's phone on every new crash
> with the **AI root cause** + one-tap **Approve / Reject / Investigate**; Approve records
> the healthy baseline to restore to and the **demo app self-heals** by polling
> `/api/approvals`. New SDK `reportError()` ingests **browser** crashes. A clickable
> buggy demo app (`demo/app/` "Yellow Store") drives ~10 error classes. The demo runs on
> the **mock adapter** (offline-reliable heal loop); **InsForge Model Gateway** powers the
> AI (Pro org $10 credits). See `docs/WORKFLOW.md`.
> **Next: agent opens a GitHub PR with the code fix; dev approves the PR from the phone.**

## What Capsule is

Version control for a running backend: **freeze** (snapshot all state),
**restore** (checkout), **diff** (what rows changed). Built to sit on InsForge
backend *branching*, behind one adapter so the whole product runs on a mock with
zero setup.

## Non-negotiable rules (full text in `CLAUDE.md`)

- **Adapter rule** — `BackendAdapter` (`src/core/types.ts`) is the ONLY thing that
  touches a backend; exactly 6 methods. Swapping backends changes no other file.
- **Redaction rule** — never freeze secrets: redact keys matching
  `/password|secret|token|authorization|cookie|ssn|card/i` in body/headers/session,
  truncate bodies > 32 KB. The freeze path must never mask the user's error.
- **Determinism** — `diffStates` output is sorted (tables/rows/fields) and never
  crashes on rows without `id` (it hashes the row).

## Architecture

`adapters` (backend I/O) ← `core` (engine) ← `sdk · cli · mcp · api` ← `dashboard`.
Everything depends only on the `BackendAdapter` interface.

## File map

### Core engine — `src/core/`
| File | Responsibility |
| --- | --- |
| `types.ts` | data model (`BackendState`, `CapsuleMeta`, …) + the `BackendAdapter` contract + `emptyState()` |
| `errors.ts` | `CapsuleNotFoundError` → CLI exit 1 / API 404 |
| `ids.ts` | `slug()`, `generateId()` (collision-checked `slug-4hex`) |
| `diff.ts` | `stableStringify`, `diffStates()` — id/hash-keyed rows, `schemaDrift`, deterministic |
| `store.ts` | `CapsuleStore` (freeze/restore/diff/list/getMeta/shareUrl), `normalizeId()`; loads each branch once per diff |
| `index.ts` | barrel export |

### Adapters — `src/adapters/` + `src/config.ts`
| File | Responsibility |
| --- | --- |
| `memory.ts` | `InMemoryBackend` (tests); deep-clones at every boundary |
| `mock.ts` | `MockBackend` (file-backed `.capsule/`, atomic temp+rename, cross-process). `writeLiveState()` = test/demo seeding, NOT part of the interface |
| `insforge.ts` | `InsForgeBackend` — **implemented & verified live**: `@insforge/sdk` `createAdminClient`; `snapshotState` reads `CAPSULE_TABLES` (or auto-discovers via `GET /api/database/tables`); capsules stored **write-once** as JSON in a Storage bucket (`branches/<id>.json`, `meta/<id>.json`) — InsForge Storage auto-renames duplicate keys, so never overwrite; `preflight()` powers `capsule connect`. Creds from env or `.insforge/project.json` |
| `../config.ts` | `getAdapter()` selects via `CAPSULE_ADAPTER` (mock default \| memory \| insforge); loads `./.env` via `process.loadEnvFile()` |

### SDK — `src/sdk/`
| File | Responsibility |
| --- | --- |
| `index.ts` | `initCapsule(adapter)` → `{ store, guard, errorMiddleware, reportError }`. `guard` freezes a `crash` capsule on throw, attaches `err.capsuleId`, re-throws the original error; freeze failures are swallowed. **`reportError(errorInfo, ctx)`** freezes a crash from an out-of-band (browser) error, same redaction |
| `redact.ts` | `redact()` (deep, circular-safe), `redactBody()` (redact + 32 KB truncate), `MAX_BODY_BYTES` |

### Triage + notify — `src/triage.ts`, `src/notify/`
| File | Responsibility |
| --- | --- |
| `triage.ts` | **Single source of truth** for `{ category, severity }` (CVSS-style bands) from the captured error; `rowsAffected(diff)` blast radius escalates severity. Served by the API; the dashboard renders it |
| `notify/telegram.ts` | Telegram Bot API over `fetch` — `sendMessage`/`editMessage`/`answerCallback`/`getUpdates` (long-poll, **no webhook**), HTML-escape helper; token from `TELEGRAM_BOT_TOKEN` (server-only) |
| `notify/store.ts` | Persistent notifier state in `.capsule/notify.json` (atomic) — `chatId`, `offset`, `seen`, `approvals`, `messageIds`; in-memory cache is the single writer (API) |
| `notify/service.ts` | The loop: **watcher** (new crash → triage → AI diagnose → Telegram alert with Approve/Reject/Investigate) + **poller** (`/start` captures chat; callbacks + free-text follow-ups drive approve/reject/investigate). API helpers: `listApprovals`/`settingsStatus`/`sendTest`/`notifyCapsule` |

### Surfaces
| File | Responsibility |
| --- | --- |
| `src/cli/index.ts` | `capsule` connect/freeze/restore/diff/list/share/session; `connect` = one-command InsForge onboarding (preflight + bucket + write `.env` + gen session secret); `share`/`session` mint dashboard links; `session <id> --role view\|edit` = a signed capability link; colored git-style diff; unknown id → exit 1 |
| `src/mcp/index.ts` | stdio MCP server "capsule"; 4 tools (`capsule_freeze/restore/diff/list`); `createServer()` + entry guard; `TOOL_NAMES` |
| `src/api/index.ts` | `node:http`; `GET /api/health`, `GET /api/capsules` (each with `triage`), `GET /api/capsules/:id` (meta+`triage` + summary + **frozen `state` rows** + `baseline` + `affected` diff + `approval`), `GET /api/diff?a&b`, `POST /api/restore/:id`, **`POST /api/capsules/:id/diagnose`** (AI root-cause), **`GET /api/approvals`**, **`GET /api/settings`** + **`POST /api/settings/test`**, **`POST /api/capsules/:id/notify`**; starts the notifier on boot; serves `dashboard/dist` (SPA fallback + traversal guard) |
| `src/version.ts` | `CAPSULE_VERSION` |

### Collaboration — `src/sessions/`
| File | Responsibility |
| --- | --- |
| `token.ts` | capability tokens for live session links — HMAC-SHA256 signed, role-scoped (`view`/`edit`/`owner`), expiring, constant-time verify; `mintToken`/`verifyToken`/`newSessionId`; needs `CAPSULE_SESSION_SECRET` (generated by `capsule connect`) |

### Agents — `src/agents/`
| File | Responsibility |
| --- | --- |
| `replicas.ts` | `AgentRunner` interface (`proposeFix(capsule, diff)`) + `ReplicasAgent` stub (Replicas sponsor — not wired) |
| `openrouter.ts` | **`OpenRouterAgent implements AgentRunner` — WIRED**: builds a prompt from the crash error + healthy→crash diff, calls **InsForge Model Gateway** (OpenRouter via the `openai` SDK, server-side `OPENROUTER_API_KEY`). Powers `POST /api/capsules/:id/diagnose` + the dashboard "Ask agent to fix" |

### Near-future stubs (interfaces only)
| File | Responsibility |
| --- | --- |
| `src/maintenance.ts` | `MaintenanceHooks` interface: `anonymize` / `gc` / `checkInvariants` — signatures only |

### Dashboard — `dashboard/` (Vite + React + Tailwind + GSAP)
InsForge-themed: flat charcoal planes (content < chrome < cards), mint (`#3DDC97`),
**no glows**, a clearly partitioned sidebar + full-width main; **Sora** (UI) +
**JetBrains Mono** (data); frozen-state **data tables**, terminal-style diff,
connection badge, pixel mascot, InsForge·Replicas footer.
| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | shell, sidebar timeline, topbar (segmented Inspect/Diff), footer; GSAP entrance; keyboard nav (j/k/d/i); refetches on focus; **selecting a capsule re-targets the diff to it vs its baseline** (`retargetDiff`); `showDiff` jumps Inspect→Diff |
| `src/components/` | `Timeline` (latest tag + **problem category** per card), `Detail` (**frozen-state data table** + **rows-affected** + **AI agent diagnosis** + error/request/session + restore), `DiffView` (terminal), `Ambient`, `Mascot`, `Sponsors`, `RotatingTagline`, `CountUp`, `Skeleton`, `ConnBadge`, `ShareButton`, `FirstRun` |
| `src/api.ts` · `types.ts` · `format.ts` · `anim.ts` · `share.ts` · `select.ts` · `categorize.ts` | fetch client (incl. `health()`, **`diagnose()`**) · wire types (incl. `CapsuleDetail{state,baseline,affected}`, `DiagnoseResult`) · helpers · anim consts · deep-links · `latestDiffPair`/`latestInspectId`/**`baselineFor`** · **`categorize()`** (11 problem categories) |
| `src/index.css` | the whole design system (CSS vars + components) |
| `tsconfig.json` | dashboard-only (DOM libs); typecheck `tsc -p dashboard/tsconfig.json --noEmit` |

### Demo / tests / config
| Path | Responsibility |
| --- | --- |
| `demo/checkout.ts` | `checkout()` with a data-dependent bug (cart → deleted product) |
| `demo/app/` | **Yellow Store** — clickable buggy app (`npm run app`, `:4100`). Routes wrapped in `guard()` trigger ~10 error classes; `public/capsule-client.js` ships browser errors to `/ingest` → `reportError()`. Seeds a healthy baseline; **self-heals** by polling `/api/approvals` and restoring live state on approval. Under `demo/` so it may write live state (adapter-rule exception) |
| `demo/run-demo.ts` | seed → freeze healthy → delete product → `guard` auto-freezes crash → diff → prints root cause (mock) |
| `demo/insforge-seed.ts` | `products` helpers over an admin client — `seedHealthy`/`breakState`/`resetHealthy` (fail-safe update-then-insert; demo-only) |
| `demo/insforge-crash.ts` | `npm run demo:insforge` — the same story LIVE on InsForge: seed → freeze → guarded crash (rich + redacted) → deep-link → reset `products` |
| `tests/*.test.ts` | diff, store, mock, config, redaction, mcp, checkout, stubs, token, insforge-seed — **30 tests** |
| `tsconfig.json` | ES2022, ESNext, Bundler, strict, `verbatimModuleSyntax`, `noEmit` |
| `package.json` | scripts: `capsule`, `mcp`, `api`, `demo`, `demo:insforge`, `dev:dashboard`, `build`, `typecheck`, `test` |

## Conventions / gotchas
- ESM, run with `tsx`. **`verbatimModuleSyntax`** is on → use `import type`.
  Relative imports are extensionless (`moduleResolution: Bundler`).
- `npm run typecheck` covers the backend only; the dashboard is typechecked
  separately (its own tsconfig has DOM libs).
- Never commit `.capsule/`, `.env`/`.env.local`, `.insforge/`, build output, or `.agents/` (all gitignored).
- Commit per working unit, only after typecheck is clean AND tests are green.

## Current state
- ✅ Wired & green (**30 tests**): core, mock + memory + **InsForge** adapters, sdk, cli (incl. `connect`/`session`), mcp, api, dashboard, demo, capability-token core, docs.
- ✅ **InsForge verified live** end-to-end (CLI + dashboard) — see "InsForge connection" below.
- ✅ **Live InsForge crash demo** — `npm run demo:insforge`: full freeze → crash → diff → restore story on the real backend (rich, redacted crash capsule), `products` reset after. See `demo/insforge-crash.ts`.
- ✅ Live **connection badge** — `GET /api/health` → dashboard `ConnBadge` shows the active adapter (InsForge·live / Mock / Memory), with offline + connecting states.
- ✅ Shareable deep-links — CLI `share` **+ in-dashboard Share buttons** on Inspect/Diff — plus signed session links (capability tokens); first-run empty state when no capsules exist.
- ✅ **Inspect shows the captured *state*** — frozen backend rows (data table) + **rows affected** vs the healthy baseline; selecting a capsule **re-targets the diff** to it vs its own baseline (each capsule shows its own change).
- ✅ **AI root-cause** — "Ask agent to fix" → `POST /api/capsules/:id/diagnose` → `OpenRouterAgent` (**InsForge Model Gateway**); grounded explanation + fix in ~4s.
- ✅ **Problem categories** — `categorize()` sorts each crash into one of ~11 categories (Missing reference, Null/undefined, Permission/RLS, …) from the real error; shown per timeline card.
- ✅ Flat theme (**no glows**), full-width main, partitioned sidebar.
- ⏳ Stubbed: `ReplicasAgent` (Replicas sponsor), maintenance hooks. (AI is wired via `OpenRouterAgent` / Model Gateway.)
- ⏳ Next (chosen): deeper InsForge — **meta→DB table, Realtime, Auth/RLS**. Then live co-watch (token core done; API/SSE/dashboard).

## InsForge connection (live, verified)
- **Project:** "My First Project" (Personal Org), `oss_host` = `https://mzrwuxe7.us-west.insforge.app`.
- **Creds:** `.insforge/project.json` (gitignored) holds `project_id`, `api_key` (an `ik_…` project key), `oss_host` — written by `npx @insforge/cli link`. The adapter reads it, or env `INSFORGE_URL`/`INSFORGE_API_KEY`. (`~/.insforge/credentials.json` is the *global* user login, not project creds.)
- **Env (`.env`, gitignored):** `CAPSULE_ADAPTER=insforge`, `CAPSULE_SESSION_SECRET=…` (both written by `capsule connect`), **`OPENROUTER_API_KEY=…`** (Model Gateway, written by `npx @insforge/cli ai setup`).
- **Model Gateway (AI):** `OpenRouterAgent` (`src/agents/openrouter.ts`) calls OpenRouter (`baseURL https://openrouter.ai/api/v1`) with the project key, **server-side only**. Default model `openai/gpt-4o` (override via `OPENROUTER_CHAT_MODEL`). This gateway key routes `gpt-4o` / `gpt-4o-mini` / `anthropic/claude-3-haiku` / `meta-llama/llama-3.3-70b` / `deepseek/deepseek-chat` — **not** `claude-3.5-sonnet` or `gemini-flash-1.5` (both 404).
- **Bucket:** `capsule` (PRIVATE) — holds `branches/<id>.json` + `meta/<id>.json`.
- **Tables:** auto-discovered via `GET /api/database/tables` (header `X-API-Key: <key>`); `CAPSULE_TABLES` overrides. A `products` table was seeded for the demo.
- **Gotchas (must-know for any InsForge work):**
  - Storage **auto-renames duplicate keys** (no overwrite) → write every object ONCE under a unique key.
  - `storage.list()` returns its array under **`data`** (not `objects`).
  - The admin client (project `ik_` key) **bypasses RLS** for reads (snapshots capture all rows — verified).
  - Branches are **CLI-only** (`insforge branch …`) and capped at 2 — reserved for the future one-click-reproduce, NOT capsule storage.

## Pick up here — deeper InsForge integration (then co-watch)
**Demo: hard 3 min + 1 min Q&A, due 2026-06-06.** User wants to use **all** InsForge
services and scale later; **co-watch is LAST**, after the rest is polished. Of the 4
chosen InsForge services, **1 is done** (Model Gateway → AI root-cause). Remaining, in
order — do each on a **backend branch** (`npx @insforge/cli branch create`) so prod stays safe:
- ▶ **1. Meta → InsForge Database table** — move `saveMeta`/`listMeta`/`getMeta` in `src/adapters/insforge.ts` from Storage JSON to a `capsules` DB table (queryable, RLS-ready, Realtime-ready). **Migrate the 10 existing capsules' meta.** Stays inside the 6-method adapter rule. *Riskiest (demo-critical) — verify the timeline still loads.*
- ▶ **2. Realtime** — dashboard subscribes to the `capsules` table → a new crash card appears live (no focus-poll). Needs CLI channel/trigger setup (insforge-cli `realtime`).
- ▶ **3. Auth + RLS** — secure capsule access (viewer SELECT / editor restore / owner manage). Pairs with co-watch.

### Then: live co-watch sessions
User chose the **"Both" access model** (auth'd invites + capability links, RLS-enforced).
- ✅ Done: `src/sessions/token.ts` (signed view/edit/owner tokens, tested), `capsule session <id> --role` mints links, `connect` generates `CAPSULE_SESSION_SECRET`. Dashboard already deep-links via `?capsule=` / `?from=&to=`.
- ▶ **Build next (increment 2 — live co-watch):**
  1. **API** (extend `src/api/index.ts`, or new `src/sessions/server.ts`): `POST /api/sessions` (create → return a view link + an edit link) and `GET /api/sessions/:id/stream?t=<token>` (SSE: presence + a synced "focus" = current capsule/diff/row). **Verify the token server-side** on connect and every write; `view` = read-only (writes → 403). Keep live sessions **in-memory in the API** (presence is ephemeral).
  2. **Dashboard** (`dashboard/src/App.tsx` + a new `Session` component): read `?session=&t=`, join the SSE stream, show presence + follow the shared focus; `edit` role drives the focus.
- ⏭ Increment 3: **annotations + roles** persisted in InsForge tables with **RLS** (viewers SELECT; editors INSERT/UPDATE own; owner manages) + a revocation list + token TTL. Increment 4: **fix-proposals → apply via an InsForge preview branch** (one-click reproduce).
- Security musts (user emphasized "fix all security flaws"): tokens are signed/expiring already; add server-side revocation + write rate-limits + participant caps; never put bucket URLs in links (API mediates; capsules are redacted); always enforce role on the server.

## Commands
```bash
npm run typecheck && npm test     # gate before any commit
npm run demo                      # end-to-end story
npm run capsule -- <cmd>          # CLI
npm run mcp                       # MCP stdio server
npm run api                       # HTTP API + built dashboard
npm run dev:dashboard             # Vite dev (proxies /api → :4000)
```
