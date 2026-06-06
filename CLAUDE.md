# CLAUDE.md

Guidance for working in this repo. Capsule is "version control for a running
backend": freeze / restore / diff backend state. See `README.md` for the tour.

## The adapter rule (non-negotiable)

`BackendAdapter` (in `src/core/types.ts`) is the **only** interface that touches
a backend. It has exactly six methods: `snapshotState`, `saveBranch`,
`loadBranch`, `saveMeta`, `getMeta`, `listMeta`.

- Every other layer (`core`, `sdk`, `cli`, `mcp`, `api`, `dashboard`) depends on
  this interface and nothing else. **Swapping the backend must change no other
  file.** New backend? Implement the six methods in `src/adapters/` and route it
  through `getAdapter()` in `src/config.ts` — stop there.
- Do not import a concrete adapter outside `src/config.ts` (and `demo/`, which
  legitimately simulates the production backend by writing `.capsule/live.json`).
- `CAPSULE_ADAPTER` selects the adapter (`mock` default, `memory`, `insforge`).

## The redaction rule (never freeze secrets)

In `src/sdk/redact.ts` + `src/sdk/index.ts`:

- Before storing `context.request` (body + headers) and `context.session`,
  redact any value whose **key** matches
  `/password|secret|token|authorization|cookie|ssn|card/i`.
- Truncate a captured body that serializes to more than **32KB**.
- The **freeze path must never mask the user's error**: if capturing a crash
  capsule throws, log and swallow it and re-throw the *original* error. `guard()`
  already guarantees this — keep it that way.

## Git discipline (hard rule)

- One focused, conventional-commit per working unit (scaffold, core, adapters,
  sdk, cli, mcp, api, dashboard, demo+tests, docs).
- Commit **only** after `npm run typecheck` is clean **and** `npm test` is green.
- Never commit `.capsule/`, `.env`, secrets, or build output (see `.gitignore`).

## Commands

```bash
npm run typecheck   # tsc --noEmit (backend); dashboard: tsc -p dashboard/tsconfig.json
npm test            # vitest
npm run demo        # end-to-end story
npm run capsule --  # CLI
npm run mcp         # MCP stdio server
npm run api         # HTTP API + built dashboard
npm run dev:dashboard
```

## Conventions

- TypeScript ESM, run with `tsx`. `strict` + `verbatimModuleSyntax` are on —
  use `import type` for type-only imports.
- Keep it lean: no speculative abstractions, no dead code. The dashboard **may
  use `shadcn/ui`** (copied components + Radix primitives, `cva`/`tailwind-merge`/
  `clsx`/`lucide-react`) — themed to the existing black+mint InsForge CSS tokens,
  **not** its default look. Design skills (`frontend-design`/`impeccable`/
  `apple-ui-design`) are guidance only and add nothing to the repo. App state
  stays in React (no Redux/Zustand) unless a real need arises.
- `diffStates` output must stay deterministic (sorted tables/rows/fields) and
  must never crash on rows without an `id` (it hashes the row instead).
- **Living docs (update with every change):** `CODEBASE.md` is the file-by-file
  map + current state for fast re-onboarding — read it first in a new session and
  keep it in sync. `USAGE.md` is the user-facing guide; move shipped items from
  its "Coming soon"/"Future" sections into "Done now" as they land.
