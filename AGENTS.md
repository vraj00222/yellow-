# AGENTS.md

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **Yellow** (API base `https://4pnn9xn8.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->

<!-- IMPECCABLE:START -->
## Design context

Frontend design is steered by `PRODUCT.md` (strategy) and `DESIGN.md` (visual
system). Read them before changing the dashboard UI.

- **Register:** `brand` / showcase-first. The dashboard is treated as the pitch:
  optimized to wow judges in a 2-minute demo, with motion that makes the
  freeze → restore → diff "time machine" feel real. It stays unmistakably on the
  InsForge identity (pure black + mint `#3DDC97` + vanishing grid), elevated, not
  reinvented.
- **Principles:** the demo is the product · perform the value prop, don't describe
  it · on-theme, elevated · terminal-native trust · make the sponsor tech visible.
- **Accessibility:** WCAG 2.2 AA. Every animation ships with a
  `prefers-reduced-motion` fallback; keep `:focus-visible` rings and the
  `j`/`k`/`d`/`i` keyboard nav.
- **Tooling:** the `impeccable` skill is set up (`.impeccable/live/config.json`
  points live mode at `dashboard/index.html`). Reach for it for UI work.
<!-- IMPECCABLE:END -->
