# Capsule workflow — crash → triage → approve-from-phone → heal

The end-to-end loop, and exactly how to test it.

## The cast (two people, two surfaces)

- **End user / customer** → uses the **Yellow Store** app (`:4100`). Pokes bugs.
  Never sees Capsule.
- **Developer (you)** → owns the **Capsule dashboard** (`:4000`) *and* the
  **Telegram** chat. The dashboard is your triage console; Telegram is your pocket.

```
Yellow Store (:4100)  ──guard()──►  capsule (frozen state)  ──►  Capsule API (:4000)
   user clicks a bug                 (mock .capsule/, shared)        watcher → triage → AI
        │                                                            → Telegram alert
        └────────────────────── self-heals on approval ◄── dev taps ✅ on phone
```

## One-time setup

1. **AI** (InsForge Model Gateway, server-side): `OPENROUTER_API_KEY` is already
   in `.env` (Pro org — burns the $10 credits).
2. **Telegram bot:** message **@BotFather** → `/newbot` → copy the token →
   put it in `.env` as `TELEGRAM_BOT_TOKEN=…`.
3. **Adapter:** `.env` has `CAPSULE_ADAPTER=mock` — the demo runs fully local so
   the freeze → restore → *heal* loop works offline with zero network risk. The
   **AI is the live InsForge piece** (watch the credits tick up while you test).

## Run it (two terminals)

```bash
npm run app    # terminal 1 — Yellow Store (resets .capsule, seeds a healthy baseline)
npm run api    # terminal 2 — Capsule dashboard + API + Telegram approval loop
```

Open the **dashboard** http://localhost:4000 and the **store** http://localhost:4100.
On your phone, open your bot and tap **Start** (`/start`) once — the dashboard ⚙
Settings panel flips to **Connected**.

## The test, step by step

### 1. Generate a crash (as the user)
In the Yellow Store:
- Click **💥 Ship bad deploy** (deletes product `p2`, reprices `p1`).
- Click **🛒 Checkout** → it **crashes**: `Cart c1 references missing product p2`.

The store's `guard()` freezes a crash capsule with the **exact backend state**.

### 2. See it triaged (dashboard, live)
Within ~3s a new card appears (no refresh) with a **severity badge**
(🔴 CRITICAL), the **category** (Missing reference), and a **Pending** chip.
Open it → captured error, **rows affected** (`− products p2`), the frozen state
table, and the redacted request/session (card number + token are `***`).

### 3. Get pinged on your phone (Telegram)
The watcher auto-runs the **AI root cause** (InsForge Model Gateway) and sends you
a message: severity, the error, the **AI root cause + fix**, and three buttons —
**✅ Approve & restore · ❌ Reject · 🔍 Investigate**.

### 4. Respond — and watch the result
- **✅ Approve & restore** → the store **self-heals** (Studio Tee reappears;
  Checkout again → it succeeds), dashboard chip flips **Approved**. *(fixes the
  symptom now — repairs the running data)*
- **🤖 Fix on GitHub** → the agent rewrites the buggy file and opens a **real PR**
  on `lumen-store`; Telegram replies with the link. Merge it to fix the root cause
  in source. *(also on the dashboard as "🤖 Open fix PR")*
- **❌ Reject** → nothing changes; chip → **Rejected** (kept for investigation).
- **🔍 Investigate** *or just type a follow-up* (e.g. "check the logs, is restore
  really right?") → the agent re-answers with a deeper analysis + the buttons again.

> **Dashboard login:** hardcoded `admin` / `capsule` (override via
> `DASHBOARD_USER`/`DASHBOARD_PASS`). Machine endpoints stay open.

### 5. Check InsForge in between
Open your **InsForge dashboard → Model Credits**: it ticks up ($/$10) with every
diagnosis — that's the live InsForge Model Gateway doing the root-cause analysis.
(Capsule data is on the local mock adapter for demo reliability; flip
`CAPSULE_ADAPTER=insforge` to store capsules + state in InsForge DB/Storage too.)

### 6. Show the breadth
Back in the store, click the other bug buttons — **View ghost profile**
(Null/undefined), **Open admin** (Permission/RLS), **Reuse coupon** (Constraint),
**Import CSV** (Parse/type), **Crash the UI** (frontend capture via the browser
shim), etc. Each lands in the dashboard, auto-sorted by category + severity, and
(if connected) pings Telegram. Tip: do the **Checkout headline first and approve
it** so the store is healthy again before showing the rest.

## Two kinds of fix

- **Approve & restore** — repairs the running data instantly (heals the symptom).
- **Fix on GitHub** — the agent (InsForge Model Gateway) rewrites the buggy source
  file and opens a **PR** on the configured repo (`GITHUB_FIX_REPO` /
  `GITHUB_FIX_PATH`, via the `gh` CLI). Review + merge to fix the root cause.
  The store the agent patches is its own repo: **github.com/vraj00222/lumen-store**.

**Next:** wire the merged PR to a Vercel deploy so merge → auto-redeploy → the
live site is fixed (needs the store + Capsule publicly hosted).
