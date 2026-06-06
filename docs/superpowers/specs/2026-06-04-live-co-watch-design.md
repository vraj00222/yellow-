# Live co-watch sessions — increment 2 (design spec)

- **Date:** 2026-06-04
- **Status:** approved, pre-implementation
- **Builds on:** `src/sessions/token.ts` (signed view/edit/owner capability tokens, tested),
  `capsule session <id> --role` link minting, `CAPSULE_SESSION_SECRET` from `capsule connect`.
- **Source of truth for scope:** `CODEBASE.md` → "Pick up here — next increment: live co-watch sessions".

## Goal

Turn the single-player time machine into a multiplayer one: open a session link and a
teammate joins the same room to debug together — **presence + role badges + live cursors +
a synced "focus"** (the capsule / diff pair / selected row everyone is looking at). The
`edit` role drives the shared focus; viewers follow.

## Decisions (resolved forks)

1. **Dashboard ambition → "Live cursors too".** Presence rail (colored avatars + role
   badges), a "following [color]" banner, synced focus, **and** live pointer cursors per
   participant overlaid on the stage. InsForge black+mint theme, JetBrains Mono labels,
   GSAP for rail entrance + cursor smoothing, `prefers-reduced-motion` respected.
2. **Edit powers → "Synced viewing only".** `edit`/`owner` drive the shared focus only.
   **No shared mutations** — `Restore` stays a private, per-user action. Smallest blast
   radius; clean match for "co-watch".

### Calls made where the spec was silent

- **Ephemeral secret for zero-setup.** If `CAPSULE_SESSION_SECRET` is unset, the API
  generates an ephemeral one at boot (logged), so co-watch works in the mock demo with no
  `connect`. Links die on restart — consistent with in-memory rooms anyway.
- **Lazy room creation.** A valid (signed) token for an unknown room creates it on first
  `stream` connect. Makes both dashboard-created rooms and CLI-minted links work uniformly.
  Safe: only our server mints tokens; caps / rate-limits / revocation still apply.
- **Cursors for everyone** (viewers included) — that's the point of "live cursors";
  aggressively throttled.

## Architecture (isolation-first)

```
dashboard ──HTTP/SSE──▶ src/api/index.ts ──delegates /api/sessions*──▶ src/sessions/server.ts
                                                                         ├─ SessionHub (in-memory, no HTTP → unit-testable)
                                                                         └─ handleSessionApi (HTTP/SSE glue) + readJson()
```

- **`SessionHub`** — in-memory manager of live rooms. Pure-ish, no `http` imports, fully
  unit-testable. Owns rooms, participants, focus, caps, rate-limits, revocation.
- **`handleSessionApi(method, url, req, res, hub)`** — the HTTP/SSE glue. Adds a small
  `readJson(req)` helper (the current API never parses POST bodies).
- **`src/api/index.ts`** — when `path.startsWith('/api/sessions')`, delegate; thread `req`
  through `handleApi` (today it only passes `method, url, res`). At boot, ensure
  `CAPSULE_SESSION_SECRET` (generate ephemeral if missing).

The adapter rule is untouched — sessions are ephemeral API state, **no backend I/O** this
increment (persistence + RLS is increment 3).

## Data model

```ts
type Focus = {
  mode: 'detail' | 'diff';
  capsuleId: string | null;   // detail target
  diffA: string | null;       // diff left
  diffB: string | null;       // diff right
  row: string | null;         // selected row key within the focused diff
};

type Participant = {
  pid: string;                // server-assigned, unguessable
  role: Role;                 // from the verified token
  color: string;              // round-robin from a fixed palette (mint, teal, …)
  label: string;              // color name — anonymous identity for inc2
  cursor: { x: number; y: number } | null;  // normalized 0..1 over the stage
};

type Room = {
  id: string;
  focus: Focus;
  participants: Map<pid, Participant & { send: (event: SseEvent) => void }>;
  createdAt: number;
};
```

The stream carries **only ids, presence, and cursor coords — never capsule contents.** All
capsule data keeps flowing through the existing redacted `/api/capsules*` routes. Tokens
carry only `{ sessionId, role, expiry }`.

## HTTP + SSE protocol

Token travels as `?t=<token>` on every call (`EventSource` can't set headers). Verified
server-side on connect **and** every write.

| Route | Role | Behavior |
| --- | --- | --- |
| `POST /api/sessions` `{focus?}` | open* | create room + mint **view & edit tokens**; returns `{ sessionId, viewToken, editToken, viewUrl, editUrl }` (urls = `/?session=<id>&t=<token>`). Dashboard "Start co-watch" path (only the server holds the secret). |
| `GET /api/sessions/:id/stream?t=` | any | **SSE**. Verify → (lazy-create if needed) → join → enforce cap. Emits events below + `:ping` heartbeat (~25s). On socket close → leave. |
| `POST /api/sessions/:id/focus?t=` | edit/owner | set shared focus; **view → 403**. Validate shape; rate-limit (~10/s, excess coalesced). |
| `POST /api/sessions/:id/cursor?t=` | any | set own cursor `{x,y}` (normalized 0..1). Rate-limit (~20/s, excess dropped). |
| `DELETE /api/sessions/:id?t=` | edit/owner | **end room**: disconnect all + add to `revoked` set (server-side revocation). |

`*` Creating a room is open in inc2 (same posture as the existing `capsule session` CLI
minting links locally). Auth'd creation is inc3.

**SSE events (server → client):**

- `hello` → `{ pid, role, self: true }` — once on join, so the client knows its own pid/role.
- `presence` → `{ participants: Participant[] }` — full roster on every join/leave.
- `focus` → `Focus` — once on join (snapshot) + on every change.
- `cursor` → `{ pid, x, y }` — lightweight, on cursor move (not the full roster).

**Errors:** bad/expired/missing token → 401; wrong role for a write → 403; unknown
session on a write → 404; cap exceeded → 429.

## SessionHub API (the unit-tested core)

```ts
create(focus?: Focus): { id, viewToken, editToken }
join(sessionId, token, send): Participant           // verify, lazy-create, cap, assign pid/color, broadcast presence + snapshot
leave(sessionId, pid): void                          // remove, broadcast presence
setFocus(sessionId, token, focus): void              // role∈{edit,owner} else throw 403; validate; rate-limit; broadcast
setCursor(sessionId, token, pid, cursor): void       // any role; rate-limit; broadcast
end(sessionId, token): void                          // role∈{edit,owner}; disconnect all; revoke
snapshot(sessionId): { focus, participants }         // for a newcomer
```

Constants: `MAX_PARTICIPANTS = 16`, focus `~10/s`, cursor `~20/s` (per-pid token bucket).
Color palette: `#3DDC97` (mint), teal, sky, violet, amber, rose, lime, cyan — round-robin,
skip taken.

## Dashboard (the "live cursors" build)

- `dashboard/src/session.ts` — SSE client + POST helpers (mirrors `api.ts`): `createSession`,
  `openSession` (EventSource + `postFocus`/`postCursor`/`endSession`).
- `dashboard/src/useSession.ts` — hook: reads `?session=&t=`, manages the EventSource
  lifecycle, exposes `{ role, selfPid, participants, focus, drive(focus), moveCursor(x,y) }`.
- `dashboard/src/components/Session.tsx` — presence rail (colored avatars + role badges),
  "following [color]" banner, **Start co-watch** share control (view/edit links + copy).
- `dashboard/src/components/Cursors.tsx` — smoothed pointer overlay on `.stage` (skips self;
  respects reduced-motion).
- `dashboard/src/App.tsx` — apply incoming `focus` to existing `selectedId/mode/diffA/diffB`
  **plus a new `selectedRow`**; if `role === 'edit'`, local view changes call `drive(focus)`
  (throttled); cursor moves over `.stage` call `moveCursor`. Mount `Session` + `Cursors`.
- `dashboard/src/components/DiffView.tsx` — add `selectedRow` + `onSelectRow` to highlight
  and scroll the focused row.
- `dashboard/src/types.ts` — `Focus`, `Participant`, session event types (wire mirror).

Note: shadcn/ui is **not** introduced here — that's the increment-2-styling pass (step 2).
This increment styles with the existing CSS system; shadcn layers on afterward.

## Security (all server-enforced)

- Verify token signature + expiry + role + session-match on connect **and** every write.
- `view` → 403 on `focus` and `delete`; `cursor` allowed for all.
- `MAX_PARTICIPANTS` cap → 429 when full.
- Per-pid rate limits on focus + cursor (excess coalesced/dropped, not errored).
- `DELETE` revokes: stale-token reconnect within TTL → 403 (revoked set pruned past max TTL).
- **No bucket URLs** in any link or event; capsule data only via existing redacted routes.
- Tokens carry nothing sensitive.

## Testing (vitest — gate before commit)

`tests/sessions.test.ts`, hub-level (deterministic, no flaky SSE over the wire):

- join assigns a unique pid + color; `MAX_PARTICIPANTS` enforced.
- `view` token `setFocus` → throws (forbidden); `edit` `setFocus` → broadcasts to all.
- `join`/`leave` broadcast updated presence; `snapshot` returns current focus + roster.
- `setCursor` updates + broadcasts; rate-limit drops excess.
- `end` disconnects all + revokes; reconnect with a revoked/expired/bad token rejected.

Keep all 28 existing tests green; typecheck backend (`tsc --noEmit`) + dashboard
(`tsc -p dashboard/tsconfig.json`) clean.

## Files

**Create:** `src/sessions/server.ts`, `tests/sessions.test.ts`, `dashboard/src/session.ts`,
`dashboard/src/useSession.ts`, `dashboard/src/components/Session.tsx`,
`dashboard/src/components/Cursors.tsx`.
**Modify:** `src/api/index.ts`, `dashboard/src/App.tsx`, `dashboard/src/components/DiffView.tsx`,
`dashboard/src/types.ts`, plus living docs `CODEBASE.md` + `USAGE.md` (move co-watch
"Coming soon" → "Done now"; set next = inc3).

## Open item

Reconcile the existing `capsule session <id> --role` CLI link shape with `/?session=&t=`
(re-read `src/cli/index.ts` first). Likely: have it print a live-room link carrying the
capsule as initial focus (`/?session=<room>&t=<token>&capsule=<id>`), relying on lazy room
creation. Confirm during implementation; do not regress the existing command/tests.

## Out of scope (later increments)

- **Inc 3:** persisted annotations + roles in InsForge tables with **RLS** (viewers SELECT;
  editors INSERT/UPDATE own; owner manages), persisted revocation list, token TTL policy.
- **Inc 4:** fix-proposals → apply via an InsForge preview branch (one-click reproduce).
- **Styling:** the shadcn/ui + InsForge-parity restyle is the agreed step 2, after this.
