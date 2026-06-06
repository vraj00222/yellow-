# Capsule

**Version control for a running backend.** Freeze the whole backend state into a
capsule (commit), restore that exact state later (checkout), and diff two
capsules to see precisely which rows changed.

Capsule is designed to sit on top of [InsForge](https://insforge.dev)'s backend
"branching" (an isolated clone of an entire backend — DB + auth + storage +
functions). It talks to any backend through a **single adapter interface**, and
ships with a file-backed mock so the whole product runs with zero setup.

```
freeze   →  snapshot current backend state as a capsule
restore  →  load the exact state a capsule captured
diff     →  what rows were added / removed / changed between two capsules
```

## Quickstart

```bash
npm install
npm run demo        # the whole story in one command (see below)
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

### The demo

`npm run demo` seeds a tiny "production" database, freezes a **healthy**
capsule, runs `checkout()` successfully, then deletes a product (a bad change)
and runs the same checkout inside `capsule.guard()`. The checkout now throws a
*data-dependent* bug; the guard auto-freezes a **crash** capsule, and a diff of
`healthy → crash` prints the deleted product as the root cause.

### Dashboard

```bash
npm run api            # http://localhost:4000  (JSON API + built dashboard)
npm run dev:dashboard  # http://localhost:5173  (Vite dev, proxies /api → :4000)
```

A dark "time machine": a timeline of capsules, an inspector (error, redacted
request/session, table counts), and a git-style **diff** that highlights the
removed product. Run `npm run demo` first so there are capsules to explore.

### CLI

```bash
npm run capsule -- freeze --label healthy
npm run capsule -- list
npm run capsule -- restore <id>        # accepts <id> or capsule://<id>
npm run capsule -- diff <a> <b>
npm run capsule -- share <id>
```

### MCP

```bash
npm run mcp   # stdio server "capsule" exposing capsule_freeze/restore/diff/list
```

## Architecture

Everything depends on **one** interface — `BackendAdapter` (six methods) — and
nothing else touches a backend. Swapping the backend changes no other file.

```
src/
  core/        types, id generator, diffStates, CapsuleStore  (the engine)
  adapters/    InMemoryBackend · MockBackend (file-backed, atomic) · InsForge (stub)
  config.ts    getAdapter() — selected by CAPSULE_ADAPTER (default "mock")
  sdk/         initCapsule(): store + guard() + errorMiddleware() + redaction
  cli/         the `capsule` command
  mcp/         stdio MCP server
  api/         node:http server backing the dashboard
  agents/      Replicas agent (stub) — autonomous fix proposals (coming soon)
  maintenance.ts   anonymize / gc / checkInvariants — interfaces only (planned)
dashboard/     Vite + React + Tailwind + GSAP SPA
demo/          a tiny production app with a data-dependent checkout bug
tests/         vitest
```

### Adapters

| `CAPSULE_ADAPTER` | Adapter           | Notes                                            |
| ----------------- | ----------------- | ------------------------------------------------ |
| `mock` (default)  | `MockBackend`     | File-backed under `.capsule/`, atomic writes     |
| `memory`          | `InMemoryBackend` | In-process, used by tests                        |
| `insforge`        | `InsForgeBackend` | Stub — throws "not wired yet" until credits land |

### Data model

```ts
BackendState = { schemaVersion: string; tables: Record<string, Row[]> }
CapsuleMeta  = { id; label; createdAt; schemaVersion; context }
//   id = slug(label) + "-" + 4 hex   (regenerated on collision)
//   context = { error?, request?, session?, gitCommit? }
```

## Safety

- **Secrets are never frozen.** Before storing, keys matching
  `/password|secret|token|authorization|cookie|ssn|card/i` are redacted in
  request body, headers, and session, and bodies over 32KB are truncated.
- **The freeze path never masks your error.** If capturing a crash capsule
  fails, that failure is logged and swallowed — your original error is always
  re-thrown unchanged.

## Roadmap (scaffolded, not yet wired)

- **InsForge adapter** — map each capsule to an InsForge branch.
- **Replicas agent** — restore a crash capsule, hand its state + diff to an
  autonomous coding agent, and surface the proposed fix (the dashboard's
  "Ask agent to fix" button).
- **Maintenance hooks** — `anonymize` (staging mirrors), `gc` (retention),
  `checkInvariants` (proactive bad-state alerts).
