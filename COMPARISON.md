# Debugging on InsForge: without Capsule vs with Capsule

A side-by-side on one real, common failure — a **data-dependent bug**: a cart
references a product that was deleted, so `checkout()` throws a 500 in
production. (Run `npm run demo`, or reproduce on InsForge with the `products`
table.)

---

## Without Capsule — what InsForge gives you today

InsForge ships strong operational tooling: `insforge logs <source>`,
`insforge diagnose`, `insforge db query`, RLS policies, and the dashboard. For
this bug, here's the actual experience:

- **`insforge diagnose`** → everything is green:
  ```
  Advisor Scan — 0 critical · 0 warning · 0 info
  Database — Connections 5/60 · Cache Hit 97.2% · Locks waiting 0
  Recent Errors (last 100/source) — postgres.logs: 1  (a checkpoint, not your bug)
  ```
- **`insforge logs postgres.logs`** → infrastructure noise (checkpoints, cron),
  nothing about your failing request.
- **The database has already moved on.** `SELECT * FROM products` shows the
  *current* state (p2 gone) — but not **when** it changed, **who/what** changed
  it, or that a cart still points at it. The exact state at the moment of failure
  is gone.

So you're left doing **archaeology**: read the stack trace, guess which row
changed, hand-write queries, and try to recreate the precise data shape that
triggered it — which you often **can't reproduce**, because prod has moved.

> InsForge tells you the *system* is healthy. It can't tell you the *data state*
> that broke your code, or what changed.

**Time to root cause:** minutes to hours, frequently "cannot reproduce."

---

## With Capsule — the missing time machine for state

Capsule sits **on top of InsForge** (snapshots stored in InsForge Storage):

1. `capsule.guard()` **auto-froze the exact backend state** at the moment of
   failure into a capsule — with secrets/PII redacted.
2. ```
   $ capsule diff healthy crash
   @@ products @@  -1
   - id=p2  name=Studio Tee  price=18  stock=5
   ```
   The deleted product — the **root cause, named, in seconds**.
3. `capsule restore <id>` brings that exact state back; soon, **one-click
   reproduce** spins a real InsForge preview branch loaded with it.

**Time to root cause:** one diff.

---

## Side by side

| | **Without Capsule** | **With Capsule** |
| --- | --- | --- |
| State at the failure moment | gone (prod moved on) | a frozen capsule |
| "What changed?" | manual guesswork | a deterministic diff |
| Reproduce the bug | recreate the data by hand | `restore` / preview branch |
| Secrets in the trail | raw in logs | redacted in the capsule |
| The signal you get | "system healthy" | "this row was deleted" |
| MTTR | minutes–hours | seconds |

---

## Why every InsForge user should onboard Capsule

InsForge gives you a great backend, **branching**, and solid logs/metrics.
Capsule adds the one thing that's missing for *data-dependent* production bugs:
a **freeze / restore / diff** time machine for backend state. It's
**complementary, not competing** — built entirely on InsForge primitives
(Storage for snapshots, branches for reproduce). Onboarding is one command:

```bash
npx @insforge/cli login && npx @insforge/cli link   # you already have a backend
npm run capsule -- connect                          # + a debugging time machine
```
