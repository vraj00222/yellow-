# Yellow

Your app just broke in production. A real user is stuck. You open your logs.

The error is there. The data that caused it is gone.

That is the problem. Not bad tooling. Not missing monitors. The actual root: software runs in time. A bug is a moment. A specific collision of data, user, session, and request that lasted milliseconds before the database moved on. Every tool developers have today captures what happened. Nobody captured what the world looked like when it happened.

Yellow captures that moment.

## Demo

[![Yellow Demo](https://img.youtube.com/vi/u8KBF_esBb4/0.jpg)](https://www.youtube.com/shorts/u8KBF_esBb4)

---

## Index

1. [What happens when a crash fires](#what-happens-when-a-crash-fires)
2. [The three things it does](#the-three-things-it-does)
3. [The loop](#the-loop)
4. [Quickstart](#quickstart)
5. [RAG pipeline](#rag-pipeline)
6. [CLI](#cli)
7. [Environment](#environment)
8. [Architecture](#architecture)
9. [Safety](#safety)
10. [Built with](#built-with)
11. [Why this did not exist before](#why-this-did-not-exist-before)

---

## What happens when a crash fires

Your app throws. In that exact millisecond, Yellow freezes the backend state. The rows, the session, the request. Then it tells you in plain English what changed.

```
products: row p2 (Studio Tee)   DELETED
carts:    row c1                 still references p2   <-- this is why it broke
```

Root cause. In 10 seconds. Not 3 hours.

Then it sends that to your phone. You tap approve. A Replicas AI agent opens a PR. You are back to sleep.

---

## The three things it does

**Freeze** captures backend state the moment your app crashes. DB rows, session, request. Frozen, immutable, always there.

**Diff** compares two frozen states and shows you exactly what changed. Not a stack trace. Not a log line. The actual data delta.

**Restore** loads the exact broken state into a safe environment so you can reproduce the bug on demand, fix it, and prove the fix works before shipping.

---

## The loop

```
crash fires
    your app throws in production

guard catches it
    Yellow freezes the exact state in that millisecond

diff runs
    healthy state vs crash state, row by row

phone alert fires
    Telegram message with the diff, the root cause, approve/reject buttons

agent wakes up
    Replicas reads the diff + your company docs from the RAG pipeline
    proposes a specific fix grounded in evidence, not guessing

you tap approve
    PR opens, fix ships
```

---

## Quickstart

```
npm install
npm run demo
npm run api
npm run dev:dashboard
```

`npm run demo` seeds a tiny production database, freezes a healthy snapshot, deletes a product, runs checkout inside `guard()`, auto-freezes the crash, and diffs the two states to name the root cause.

Dashboard runs at `http://localhost:5173`. Timeline of frozen states, diff inspector, one-click restore.

---

## RAG pipeline

Yellow gets smarter the more context you give it. Point it at your GitHub repo or Confluence space and it ingests your docs into a knowledge base. When a crash fires, the agent searches that knowledge base before proposing a fix. Past incidents, runbooks, architecture decisions. The fix matches how your team actually works.

```
npx tsx src/rag/run-ingest.ts
```

Edit `src/rag/run-ingest.ts` to point at any GitHub repo URL or Confluence page.

---

## CLI

```
npm run yellow -- freeze --label before-migration
npm run yellow -- list
npm run yellow -- diff <healthy-id> <crash-id>
npm run yellow -- restore <id>
npm run yellow -- share <id>
```

---

## Environment

```
YELLOW_ADAPTER=mock
INSFORGE_URL=
INSFORGE_API_KEY=
REPLICAS_API_KEY=
REPLICAS_AGENT_ID=
TELEGRAM_BOT_TOKEN=
DASHBOARD_URL=http://localhost:5173
```

---

## Architecture

One interface. Six methods. `BackendAdapter` is the only thing that touches a backend. Everything else is backend-agnostic. Swap InsForge for anything by changing one file.

```
src/
  core/        the engine. types, diffStates, YellowStore
  adapters/    MockBackend, InMemoryBackend, InsForgeBackend
  sdk/         guard(), errorMiddleware(), redaction
  agents/      Replicas agent. reads diff + RAG context, proposes fix
  notify/      Telegram loop. crash alert, one-tap approve/reject/investigate
  rag/         ingest.ts, retrieve.ts. knowledge base pipeline
  cli/         yellow command
  mcp/         stdio MCP server
  api/         JSON API backing the dashboard
dashboard/     Vite + React + Tailwind. the time machine UI
demo/          a real checkout bug. deleted foreign key, broken cart
```

---

## Safety

Secrets are never frozen. Any key matching `/password|secret|token|authorization|cookie|ssn|card/i` is redacted before storage. Request bodies over 32KB are truncated.

If freezing fails, Yellow swallows that failure silently and rethrows your original error unchanged. The crash capture path never becomes a second failure.

Shared yellow links are signed, scoped, and expire. Nobody gets access to state they should not see.

---

## Built with

InsForge for backend infrastructure. Replicas for the AI coding agent. Telegram for phone alerts. Vercel for the dashboard.

---

## Why this did not exist before

Capturing state at crash time sounds simple. It is not. You need to snapshot a live database without locking it, scope the snapshot to only the relevant rows, store it cheaply enough to do on every request, and do all of this without slowing down or masking the original error.

InsForge makes the infrastructure side of this possible. Yellow is the layer on top that makes it usable.

The words "can't reproduce" should not exist. They exist because the evidence disappears. Yellow keeps the evidence.
