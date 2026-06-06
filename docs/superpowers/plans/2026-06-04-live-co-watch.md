# Live Co-Watch Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live multiplayer co-watch to Capsule — a teammate opens a session link and joins a room with presence, role badges, live cursors, and a synced "focus" (the capsule/diff/row everyone is looking at), driven by the `edit` role.

**Architecture:** A new `src/sessions/server.ts` holds an in-memory `SessionHub` (pure, unit-tested) plus a thin HTTP/SSE handler. `src/api/index.ts` delegates `/api/sessions*` to it. The dashboard joins via `EventSource`, applies the shared focus to its existing view state (+ a new `selectedRow`), and renders a presence rail and cursor overlay. No backend I/O and no new dependencies this increment.

**Tech Stack:** TypeScript ESM (tsx), `node:http` Server-Sent Events, browser `EventSource`, React 18 (state only), GSAP (existing), vitest. Reuses `src/sessions/token.ts` (HMAC capability tokens).

**Spec:** `docs/superpowers/specs/2026-06-04-live-co-watch-design.md`

**Conventions (from CLAUDE.md):** ESM + `verbatimModuleSyntax` → use `import type` for type-only imports; relative imports are extensionless. Commit per task **only after** `npm run typecheck` is clean **and** `npm test` is green (dashboard tasks also run `npx tsc -p dashboard/tsconfig.json --noEmit`). Conventional commits. Never commit `.capsule/`, `.env`, `.insforge/`.

---

## File Structure

**Create:**
- `src/sessions/server.ts` — `SessionHub` (rooms, presence, focus, cursors, caps, rate-limit, revocation) + HTTP/SSE handler (`handleSessionApi`, `readJson`, SSE plumbing).
- `tests/sessions.test.ts` — hub unit tests (deterministic via injectable clock).
- `dashboard/src/session.ts` — browser session client (`createSession`, `openSession`).
- `dashboard/src/useSession.ts` — React hook wiring the EventSource lifecycle to state.
- `dashboard/src/components/Cursors.tsx` — pointer overlay on the stage.
- `dashboard/src/components/Session.tsx` — presence rail + "Start co-watch" share control.

**Modify:**
- `src/api/index.ts` — ensure session secret at boot; thread `req`; delegate `/api/sessions*`.
- `dashboard/src/types.ts` — add `Role`, `Focus`, `Participant`, `SessionLinks`.
- `dashboard/src/App.tsx` — `selectedRow` state; apply remote focus; drive focus when editor; capture cursor; mount `Session` + `Cursors`.
- `dashboard/src/components/DiffView.tsx` — accept `selectedRow` + `onSelectRow`; highlight/scroll the focused row.
- `dashboard/src/index.css` — styles for presence rail, cursors, co-watch control, focused row.
- `CODEBASE.md`, `USAGE.md` — living docs.

---

## Task 1: SessionHub core (the testable engine)

**Files:**
- Create: `src/sessions/server.ts`
- Test: `tests/sessions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/sessions.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mintToken, verifyToken } from '../src/sessions/token';
import { SessionHub, SessionError, MAX_PARTICIPANTS } from '../src/sessions/server';

const SAVED = process.env.CAPSULE_SESSION_SECRET;
beforeAll(() => {
  process.env.CAPSULE_SESSION_SECRET = 'unit-test-secret-key-0123456789';
});
afterAll(() => {
  if (SAVED === undefined) delete process.env.CAPSULE_SESSION_SECRET;
  else process.env.CAPSULE_SESSION_SECRET = SAVED;
});

/** Capture the events a member receives. */
function rec() {
  const events: { event: string; data: any }[] = [];
  return { send: (event: string, data: unknown) => events.push({ event, data }), events };
}
const types = (r: ReturnType<typeof rec>) => r.events.map((e) => e.event);

describe('SessionHub', () => {
  it('create() returns a room id with valid view + edit tokens', () => {
    const hub = new SessionHub();
    const { id, viewToken, editToken } = hub.create();
    expect(verifyToken(viewToken)).toEqual({ sessionId: id, role: 'view' });
    expect(verifyToken(editToken)).toEqual({ sessionId: id, role: 'edit' });
  });

  it('join() greets the newcomer with hello + focus + presence', () => {
    const hub = new SessionHub();
    const { id, editToken } = hub.create({ mode: 'diff', diffA: 'a', diffB: 'b' });
    const r = rec();
    const p = hub.join(id, editToken, r.send);
    expect(p.role).toBe('edit');
    expect(p.color).toMatch(/^#/);
    expect(types(r)).toEqual(['hello', 'focus', 'presence']);
    expect(r.events[0].data).toMatchObject({ pid: p.pid, role: 'edit', self: true });
    expect(r.events[1].data).toMatchObject({ mode: 'diff', diffA: 'a', diffB: 'b' });
  });

  it('join() lazily creates an unknown room from a valid token', () => {
    const hub = new SessionHub();
    const id = verifyToken(hub.create().viewToken).sessionId; // a real id
    const token = mintToken(id, 'view');
    const r = rec();
    expect(() => hub.join(id, token, r.send)).not.toThrow();
    expect(hub.snapshot(id)?.participants).toHaveLength(1);
  });

  it('join() rejects a bad token (401) and a session mismatch (403)', () => {
    const hub = new SessionHub();
    const { id } = hub.create();
    expect(() => hub.join(id, 'garbage', rec().send)).toThrow(SessionError);
    const otherToken = mintToken('some-other-session', 'edit');
    expect(() => hub.join(id, otherToken, rec().send)).toThrow(/mismatch/i);
  });

  it('join() enforces the participant cap (429)', () => {
    const hub = new SessionHub();
    const { id, viewToken } = hub.create();
    for (let i = 0; i < MAX_PARTICIPANTS; i++) hub.join(id, viewToken, rec().send);
    expect(() => hub.join(id, viewToken, rec().send)).toThrow(/full/i);
  });

  it('setFocus() broadcasts to everyone for edit, but 403s for view', () => {
    let clock = 1000;
    const hub = new SessionHub(() => clock);
    const { id, viewToken, editToken } = hub.create();
    const a = rec();
    const b = rec();
    hub.join(id, editToken, a.send);
    hub.join(id, viewToken, b.send);
    clock += 1000;
    hub.setFocus(id, editToken, { mode: 'detail', capsuleId: 'crash-1', diffA: null, diffB: null, row: null });
    expect(a.events.at(-1)).toMatchObject({ event: 'focus', data: { capsuleId: 'crash-1' } });
    expect(b.events.at(-1)).toMatchObject({ event: 'focus', data: { capsuleId: 'crash-1' } });
    expect(() =>
      hub.setFocus(id, viewToken, { mode: 'detail', capsuleId: 'x', diffA: null, diffB: null, row: null }),
    ).toThrow(/view/i);
  });

  it('setFocus() rate-limits rapid updates on the same clock tick', () => {
    let clock = 1000;
    const hub = new SessionHub(() => clock);
    const { id, editToken } = hub.create();
    const a = rec();
    hub.join(id, editToken, a.send);
    const f = (capsuleId: string) =>
      hub.setFocus(id, editToken, { mode: 'detail', capsuleId, diffA: null, diffB: null, row: null });
    clock += 1000;
    f('one'); // accepted
    f('two'); // dropped (same tick, under FOCUS_MIN_MS)
    const focuses = a.events.filter((e) => e.event === 'focus' && e.data.capsuleId);
    expect(focuses).toHaveLength(1);
    expect(focuses[0].data.capsuleId).toBe('one');
  });

  it('setCursor() broadcasts to others (not self) and throttles', () => {
    let clock = 0;
    const hub = new SessionHub(() => clock);
    const { id, viewToken } = hub.create();
    const a = rec();
    const b = rec();
    const pa = hub.join(id, viewToken, a.send);
    hub.join(id, viewToken, b.send);
    clock = 1000;
    hub.setCursor(id, viewToken, pa.pid, { x: 0.5, y: 0.5 });
    expect(b.events.at(-1)).toMatchObject({ event: 'cursor', data: { pid: pa.pid, x: 0.5, y: 0.5 } });
    expect(a.events.some((e) => e.event === 'cursor')).toBe(false); // never echoes to self
    hub.setCursor(id, viewToken, pa.pid, { x: 0.6, y: 0.6 }); // same tick → throttled
    expect(b.events.filter((e) => e.event === 'cursor')).toHaveLength(1);
  });

  it('leave() broadcasts presence and drops the empty room', () => {
    const hub = new SessionHub();
    const { id, viewToken } = hub.create();
    const a = rec();
    const p = hub.join(id, viewToken, a.send);
    hub.leave(id, p.pid);
    expect(hub.snapshot(id)).toBeNull();
  });

  it('end() revokes the room: view 403s, and stale tokens cannot rejoin', () => {
    const hub = new SessionHub();
    const { id, viewToken, editToken } = hub.create();
    const a = rec();
    hub.join(id, editToken, a.send);
    expect(() => hub.end(id, viewToken)).toThrow(/view/i);
    hub.end(id, editToken);
    expect(a.events.at(-1)?.event).toBe('ended');
    expect(() => hub.join(id, editToken, rec().send)).toThrow(/revoked/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/sessions.test.ts`
Expected: FAIL — `Cannot find module '../src/sessions/server'`.

- [ ] **Step 3: Implement the hub**

Create `src/sessions/server.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { mintToken, newSessionId, verifyToken } from './token';
import type { Role } from './token';

export interface Focus {
  mode: 'detail' | 'diff';
  capsuleId: string | null;
  diffA: string | null;
  diffB: string | null;
  row: string | null;
}

export interface Participant {
  pid: string;
  role: Role;
  color: string;
  label: string;
  cursor: { x: number; y: number } | null;
}

export type Send = (event: string, data: unknown) => void;

interface Member extends Participant {
  send: Send;
  lastCursorAt: number;
}

interface Room {
  id: string;
  focus: Focus;
  members: Map<string, Member>;
  createdAt: number;
  lastFocusAt: number;
}

export const MAX_PARTICIPANTS = 16;
const FOCUS_MIN_MS = 80;
const CURSOR_MIN_MS = 45;
const REVOKE_TTL_MS = 86_400_000; // 24h — matches the token default TTL

const PALETTE = ['#3ddc97', '#2dd4bf', '#38bdf8', '#a78bfa', '#f5a623', '#fb7185', '#a3e635', '#22d3ee'];
const LABELS = ['mint', 'teal', 'sky', 'violet', 'amber', 'rose', 'lime', 'cyan'];

/** An error carrying the HTTP status the handler should return. */
export class SessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

const emptyFocus = (): Focus => ({ mode: 'detail', capsuleId: null, diffA: null, diffB: null, row: null });

const clamp01 = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length <= 128 ? v : null);

function sanitizeFocus(f: Partial<Focus> | undefined): Focus {
  return {
    mode: f?.mode === 'diff' ? 'diff' : 'detail',
    capsuleId: str(f?.capsuleId),
    diffA: str(f?.diffA),
    diffB: str(f?.diffB),
    row: str(f?.row),
  };
}

const strip = (m: Member): Participant => ({
  pid: m.pid,
  role: m.role,
  color: m.color,
  label: m.label,
  cursor: m.cursor,
});

/**
 * In-memory manager of live co-watch rooms. Pure (no HTTP) so it can be unit
 * tested. The clock is injectable for deterministic rate-limit tests.
 */
export class SessionHub {
  private rooms = new Map<string, Room>();
  private revoked = new Map<string, number>(); // sessionId -> expiry epoch ms

  constructor(private now: () => number = Date.now) {}

  create(focus?: Partial<Focus>): { id: string; viewToken: string; editToken: string } {
    const id = newSessionId();
    this.rooms.set(id, {
      id,
      focus: sanitizeFocus(focus),
      members: new Map(),
      createdAt: this.now(),
      lastFocusAt: 0,
    });
    return { id, viewToken: mintToken(id, 'view'), editToken: mintToken(id, 'edit') };
  }

  /** Verify a token for a room without side effects; also checks the cap. */
  checkJoin(sessionId: string, token: string): Role {
    const role = this.auth(token, sessionId);
    const room = this.rooms.get(sessionId);
    if (room && room.members.size >= MAX_PARTICIPANTS) throw new SessionError('session is full', 429);
    return role;
  }

  join(sessionId: string, token: string, send: Send): Participant {
    const role = this.checkJoin(sessionId, token);
    const room = this.ensureRoom(sessionId);
    const idx = room.members.size % PALETTE.length;
    const member: Member = {
      pid: randomUUID(),
      role,
      color: PALETTE[idx],
      label: LABELS[idx],
      cursor: null,
      send,
      lastCursorAt: 0,
    };
    room.members.set(member.pid, member);
    send('hello', { pid: member.pid, role, self: true });
    send('focus', room.focus);
    this.broadcastPresence(room);
    return strip(member);
  }

  leave(sessionId: string, pid: string): void {
    const room = this.rooms.get(sessionId);
    if (!room || !room.members.delete(pid)) return;
    if (room.members.size === 0) this.rooms.delete(sessionId);
    else this.broadcastPresence(room);
  }

  setFocus(sessionId: string, token: string, focus: Partial<Focus>): void {
    if (this.auth(token, sessionId) === 'view') throw new SessionError('view role cannot drive focus', 403);
    const room = this.rooms.get(sessionId);
    if (!room) throw new SessionError('no such session', 404);
    if (this.now() - room.lastFocusAt < FOCUS_MIN_MS) return; // rate-limit
    room.lastFocusAt = this.now();
    room.focus = sanitizeFocus(focus);
    for (const m of room.members.values()) m.send('focus', room.focus);
  }

  setCursor(sessionId: string, token: string, pid: string, cursor: { x: number; y: number }): void {
    this.auth(token, sessionId); // any role may move its own cursor
    const room = this.rooms.get(sessionId);
    if (!room) throw new SessionError('no such session', 404);
    const me = room.members.get(pid);
    if (!me) throw new SessionError('not a participant', 404);
    if (this.now() - me.lastCursorAt < CURSOR_MIN_MS) return; // throttle
    me.lastCursorAt = this.now();
    me.cursor = { x: clamp01(cursor?.x), y: clamp01(cursor?.y) };
    for (const other of room.members.values()) {
      if (other.pid !== pid) other.send('cursor', { pid, x: me.cursor.x, y: me.cursor.y });
    }
  }

  end(sessionId: string, token: string): void {
    if (this.auth(token, sessionId) === 'view') throw new SessionError('view role cannot end a session', 403);
    const room = this.rooms.get(sessionId);
    this.revoked.set(sessionId, this.now() + REVOKE_TTL_MS);
    if (!room) return;
    for (const m of room.members.values()) m.send('ended', {});
    this.rooms.delete(sessionId);
  }

  snapshot(sessionId: string): { focus: Focus; participants: Participant[] } | null {
    const room = this.rooms.get(sessionId);
    if (!room) return null;
    return { focus: room.focus, participants: [...room.members.values()].map(strip) };
  }

  private auth(token: string, sessionId: string): Role {
    this.pruneRevoked();
    if (this.revoked.has(sessionId)) throw new SessionError('session revoked', 403);
    let claims: { sessionId: string; role: Role };
    try {
      claims = verifyToken(token);
    } catch {
      throw new SessionError('invalid or expired token', 401);
    }
    if (claims.sessionId !== sessionId) throw new SessionError('token/session mismatch', 403);
    return claims.role;
  }

  private ensureRoom(id: string): Room {
    let room = this.rooms.get(id);
    if (!room) {
      room = { id, focus: emptyFocus(), members: new Map(), createdAt: this.now(), lastFocusAt: 0 };
      this.rooms.set(id, room);
    }
    return room;
  }

  private broadcastPresence(room: Room): void {
    const participants = [...room.members.values()].map(strip);
    for (const m of room.members.values()) m.send('presence', { participants });
  }

  private pruneRevoked(): void {
    const t = this.now();
    for (const [id, exp] of this.revoked) if (exp < t) this.revoked.delete(id);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/sessions.test.ts`
Expected: PASS (all 11). Then `npm test` — Expected: all prior tests still green (28 + 11).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sessions/server.ts tests/sessions.test.ts
git commit -m "feat(sessions): in-memory SessionHub (presence, synced focus, cursors, caps, revocation)"
```

---

## Task 2: HTTP/SSE handler + wire into the API

**Files:**
- Modify: `src/sessions/server.ts` (append the HTTP layer)
- Modify: `src/api/index.ts`

- [ ] **Step 1: Append the HTTP/SSE handler to `src/sessions/server.ts`**

Add these imports at the **top** of the file (alongside the existing imports):

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
```

Append at the **end** of `src/sessions/server.ts`:

```ts
// ---- HTTP / SSE layer ----

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no', // disable proxy buffering (nginx / vite dev proxy)
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new SessionError('request body too large', 413);
    chunks.push(c as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new SessionError('invalid JSON body', 400);
  }
}

/** Route `/api/sessions*`. Returns true if it handled the request. */
export async function handleSessionApi(
  method: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  hub: SessionHub,
): Promise<void> {
  const path = url.pathname;
  const token = url.searchParams.get('t') ?? '';

  try {
    if (method === 'POST' && path === '/api/sessions') {
      const body = await readJson(req);
      const created = hub.create(body.focus as Partial<Focus> | undefined);
      const base = `/?session=${created.id}&t=`;
      return sendJson(res, 200, {
        sessionId: created.id,
        viewToken: created.viewToken,
        editToken: created.editToken,
        viewUrl: base + encodeURIComponent(created.viewToken),
        editUrl: base + encodeURIComponent(created.editToken),
      });
    }

    const m = /^\/api\/sessions\/([^/]+)(\/stream|\/focus|\/cursor)?$/.exec(path);
    if (!m) return sendJson(res, 404, { error: `No route for ${method} ${path}` });
    const sessionId = decodeURIComponent(m[1]);
    const sub = m[2];

    if (method === 'GET' && sub === '/stream') return streamSession(sessionId, token, req, res, hub);
    if (method === 'POST' && sub === '/focus') {
      hub.setFocus(sessionId, token, (await readJson(req)) as Partial<Focus>);
      return noContent(res);
    }
    if (method === 'POST' && sub === '/cursor') {
      const pid = url.searchParams.get('pid') ?? '';
      const b = await readJson(req);
      hub.setCursor(sessionId, token, pid, { x: Number(b.x), y: Number(b.y) });
      return noContent(res);
    }
    if (method === 'DELETE' && !sub) {
      hub.end(sessionId, token);
      return noContent(res);
    }
    return sendJson(res, 404, { error: `No route for ${method} ${path}` });
  } catch (e) {
    if (e instanceof SessionError) return sendJson(res, e.status, { error: e.message });
    throw e;
  }
}

function noContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
}

function streamSession(
  sessionId: string,
  token: string,
  req: IncomingMessage,
  res: ServerResponse,
  hub: SessionHub,
): void {
  // Verify BEFORE committing to a 200 SSE stream, so we can still send 401/403/429.
  try {
    hub.checkJoin(sessionId, token);
  } catch (e) {
    if (e instanceof SessionError) return sendJson(res, e.status, { error: e.message });
    throw e;
  }

  res.writeHead(200, SSE_HEADERS);
  res.write('retry: 3000\n\n');
  const send: Send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const participant = hub.join(sessionId, token, send);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    hub.leave(sessionId, participant.pid);
  });
}
```

- [ ] **Step 2: Wire the API in `src/api/index.ts`**

Add imports near the top (after the existing imports, line ~9):

```ts
import { randomBytes } from 'node:crypto';
import { SessionHub, handleSessionApi } from '../sessions/server';
```

After `const DASHBOARD_DIST = ...` (line ~13) add the secret guard + hub:

```ts
if (!process.env.CAPSULE_SESSION_SECRET) {
  process.env.CAPSULE_SESSION_SECRET = randomBytes(24).toString('base64url');
  console.log('[capsule:api] using an ephemeral CAPSULE_SESSION_SECRET — set one to persist session links across restarts');
}
const hub = new SessionHub();
```

Change `handle()` (line ~19) to pass `req` into `handleApi`:

```ts
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method ?? 'GET';
  if (url.pathname.startsWith('/api/')) return handleApi(method, url, req, res);
  return serveStatic(url.pathname, res);
}
```

Change `handleApi`'s signature and add the delegation as its **first** check:

```ts
async function handleApi(method: string, url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = url.pathname;

  if (path.startsWith('/api/sessions')) return handleSessionApi(method, url, req, res, hub);

  if (method === 'GET' && path === '/api/capsules') {
    return sendJson(res, 200, await store.list());
  }
  // …rest unchanged…
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (SSE is verified by hand, not unit tests — per spec)**

Run in one terminal: `npm run demo && npm run api`
In another:

```bash
# create a room
curl -s -XPOST localhost:4000/api/sessions -H 'content-type: application/json' -d '{"focus":{"mode":"diff"}}'
# → copy editToken from the JSON, then open the stream (Ctrl-C to stop):
curl -N "localhost:4000/api/sessions/<sessionId>/stream?t=<editToken>"
# Expected: an SSE stream emitting `event: hello`, `event: focus`, `event: presence`, then `: ping` every ~25s.
# In a third terminal, push focus and watch it appear in the stream:
curl -s -XPOST "localhost:4000/api/sessions/<sessionId>/focus?t=<editToken>" -H 'content-type: application/json' \
  -d '{"mode":"detail","capsuleId":"crash-1"}'
# A view token must be rejected on focus:
curl -s -XPOST "localhost:4000/api/sessions/<sessionId>/focus?t=<viewToken>" -d '{}' -w '\n%{http_code}\n'
# Expected: 403
```

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/sessions/server.ts src/api/index.ts
git commit -m "feat(sessions): SSE endpoints + ephemeral secret; API delegates /api/sessions"
```

---

## Task 3: Dashboard wire types + session client

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/session.ts`

- [ ] **Step 1: Add the wire types**

Append to `dashboard/src/types.ts`:

```ts
export type Role = 'view' | 'edit' | 'owner';

export interface Focus {
  mode: 'detail' | 'diff';
  capsuleId: string | null;
  diffA: string | null;
  diffB: string | null;
  row: string | null;
}

export interface Participant {
  pid: string;
  role: Role;
  color: string;
  label: string;
  cursor: { x: number; y: number } | null;
}

export interface SessionLinks {
  sessionId: string;
  viewToken: string;
  editToken: string;
  viewUrl: string;
  editUrl: string;
}
```

- [ ] **Step 2: Create the session client**

Create `dashboard/src/session.ts`:

```ts
import type { Focus, Participant, Role, SessionLinks } from './types';

/** Start a live room from the server (mints the tokens) and get back share links. */
export async function createSession(focus?: Partial<Focus>): Promise<SessionLinks> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ focus }),
  });
  if (!res.ok) throw new Error(`Could not start co-watch (${res.status})`);
  return (await res.json()) as SessionLinks;
}

export interface SessionHandlers {
  onHello: (self: { pid: string; role: Role }) => void;
  onPresence: (participants: Participant[]) => void;
  onFocus: (focus: Focus) => void;
  onCursor: (c: { pid: string; x: number; y: number }) => void;
  onEnded: () => void;
}

export interface SessionClient {
  postFocus: (focus: Focus) => void;
  postCursor: (x: number, y: number) => void;
  end: () => void;
  close: () => void;
}

const json = (event: MessageEvent): any => JSON.parse(event.data);

/** Join a room's SSE stream and get back senders for focus/cursor. */
export function openSession(sessionId: string, token: string, h: SessionHandlers): SessionClient {
  const base = `/api/sessions/${encodeURIComponent(sessionId)}`;
  const q = `?t=${encodeURIComponent(token)}`;
  const es = new EventSource(`${base}/stream${q}`);
  let pid = '';

  es.addEventListener('hello', (e) => {
    const d = json(e as MessageEvent);
    pid = d.pid;
    h.onHello(d);
  });
  es.addEventListener('presence', (e) => h.onPresence(json(e as MessageEvent).participants));
  es.addEventListener('focus', (e) => h.onFocus(json(e as MessageEvent)));
  es.addEventListener('cursor', (e) => h.onCursor(json(e as MessageEvent)));
  es.addEventListener('ended', () => {
    h.onEnded();
    es.close();
  });

  return {
    postFocus: (focus) => {
      void fetch(`${base}/focus${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(focus),
      });
    },
    postCursor: (x, y) => {
      void fetch(`${base}/cursor${q}&pid=${encodeURIComponent(pid)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    },
    end: () => {
      void fetch(`${base}${q}`, { method: 'DELETE' });
    },
    close: () => es.close(),
  };
}
```

- [ ] **Step 3: Typecheck the dashboard**

Run: `npx tsc -p dashboard/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/session.ts
git commit -m "feat(dashboard): session wire types + EventSource client"
```

---

## Task 4: useSession hook

**Files:**
- Create: `dashboard/src/useSession.ts`

- [ ] **Step 1: Create the hook**

Create `dashboard/src/useSession.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { openSession } from './session';
import type { Focus, Participant, Role } from './types';

const params =
  typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
export const sessionId = params.get('session');
export const sessionToken = params.get('t');

export interface RemoteCursor {
  x: number;
  y: number;
  color: string;
  label: string;
}

export interface SessionState {
  active: boolean;
  role: Role | null;
  selfPid: string | null;
  participants: Participant[];
  cursors: Record<string, RemoteCursor>;
  ended: boolean;
  drive: (focus: Focus) => void;
  moveCursor: (x: number, y: number) => void;
}

/**
 * Joins the room named by `?session=&t=` (if present) and surfaces presence,
 * cursors and role. Remote focus is delivered through `onRemoteFocus`.
 */
export function useSession(onRemoteFocus: (focus: Focus) => void): SessionState {
  const [role, setRole] = useState<Role | null>(null);
  const [selfPid, setSelfPid] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const [ended, setEnded] = useState(false);

  const client = useRef<ReturnType<typeof openSession> | null>(null);
  const focusCb = useRef(onRemoteFocus);
  focusCb.current = onRemoteFocus;
  const meta = useRef<Record<string, { color: string; label: string }>>({});

  useEffect(() => {
    if (!sessionId || !sessionToken) return;
    const c = openSession(sessionId, sessionToken, {
      onHello: ({ pid, role }) => {
        setSelfPid(pid);
        setRole(role);
      },
      onPresence: (ps) => {
        setParticipants(ps);
        meta.current = Object.fromEntries(ps.map((p) => [p.pid, { color: p.color, label: p.label }]));
        // Drop cursors for participants who have left.
        setCursors((prev) => {
          const live: Record<string, RemoteCursor> = {};
          for (const p of ps) if (prev[p.pid]) live[p.pid] = prev[p.pid];
          return live;
        });
      },
      onFocus: (f) => focusCb.current(f),
      onCursor: ({ pid, x, y }) =>
        setCursors((prev) => ({
          ...prev,
          [pid]: { x, y, color: meta.current[pid]?.color ?? '#3ddc97', label: meta.current[pid]?.label ?? '' },
        })),
      onEnded: () => setEnded(true),
    });
    client.current = c;
    return () => c.close();
  }, []);

  return {
    active: Boolean(sessionId && sessionToken),
    role,
    selfPid,
    participants,
    cursors,
    ended,
    drive: (f) => client.current?.postFocus(f),
    moveCursor: (x, y) => client.current?.postCursor(x, y),
  };
}
```

- [ ] **Step 2: Typecheck the dashboard**

Run: `npx tsc -p dashboard/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/useSession.ts
git commit -m "feat(dashboard): useSession hook (presence, cursors, role, remote focus)"
```

---

## Task 5: Presentational components — Cursors + Session

**Files:**
- Create: `dashboard/src/components/Cursors.tsx`
- Create: `dashboard/src/components/Session.tsx`

- [ ] **Step 1: Create the cursor overlay**

Create `dashboard/src/components/Cursors.tsx`:

```tsx
import type { CSSProperties } from 'react';
import type { RemoteCursor } from '../useSession';

/** Other participants' pointers, positioned by normalized coords over `.stage`. */
export function Cursors({ cursors }: { cursors: Record<string, RemoteCursor> }) {
  const entries = Object.entries(cursors);
  if (!entries.length) return null;
  return (
    <div className="cursors" aria-hidden="true">
      {entries.map(([pid, c]) => (
        <div
          key={pid}
          className="cursor"
          style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, '--c': c.color } as CSSProperties}
        >
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
            <path d="M1 1l12 5.6-5 1.6-1.7 5z" fill={c.color} stroke="#0b0b0d" strokeWidth="1" />
          </svg>
          {c.label && <span className="cursor__tag mono">{c.label}</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the presence rail + start control**

Create `dashboard/src/components/Session.tsx`:

```tsx
import { useState } from 'react';
import { createSession } from '../session';
import type { CSSProperties } from 'react';
import type { Focus, Participant, Role, SessionLinks } from '../types';

/** Shown while you ARE in a session: who's here + who's driving. */
export function PresenceRail({
  participants,
  selfPid,
  role,
}: {
  participants: Participant[];
  selfPid: string | null;
  role: Role | null;
}) {
  if (!participants.length) return null;
  const driver = participants.find((p) => p.role === 'edit' || p.role === 'owner');
  return (
    <div className="presence" role="group" aria-label="People in this session">
      <div className="presence__avatars">
        {participants.map((p) => (
          <span
            key={p.pid}
            className={`avatar${p.pid === selfPid ? ' avatar--me' : ''}`}
            style={{ '--c': p.color } as CSSProperties}
            title={`${p.pid === selfPid ? 'you' : p.label} · ${p.role}`}
          >
            {p.pid === selfPid ? '★' : p.label[0].toUpperCase()}
          </span>
        ))}
      </div>
      <span className="presence__status mono">
        {role === 'edit' || role === 'owner'
          ? 'you drive'
          : driver
            ? `following ${driver.label}`
            : 'waiting for host'}
      </span>
    </div>
  );
}

/** Shown when you are NOT in a session: start one focused on the current view. */
export function StartCoWatch({ focus }: { focus: Focus }) {
  const [links, setLinks] = useState<SessionLinks | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      setLinks(await createSession(focus));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  if (links) {
    const origin = window.location.origin;
    return (
      <div className="cowatch">
        <CopyLink label="view" url={origin + links.viewUrl} />
        <CopyLink label="edit" url={origin + links.editUrl} />
      </div>
    );
  }
  return (
    <button type="button" className="cowatch__start" onClick={start} disabled={busy}>
      {busy ? 'starting…' : err ?? 'Start co-watch'}
    </button>
  );
}

function CopyLink({ label, url }: { label: string; url: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <button type="button" className={`cowatch__link cowatch__link--${label}`} onClick={copy}>
      <span className="cowatch__role mono">{label}</span>
      {done ? 'copied ✓' : 'copy link'}
    </button>
  );
}
```

- [ ] **Step 3: Typecheck the dashboard**

Run: `npx tsc -p dashboard/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/Cursors.tsx dashboard/src/components/Session.tsx
git commit -m "feat(dashboard): presence rail, start-co-watch control, cursor overlay"
```

---

## Task 6: Integrate into App (focus sync + cursor capture)

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Add imports**

Add to the import block at the top of `dashboard/src/App.tsx`:

```ts
import { useSession } from './useSession';
import { Cursors } from './components/Cursors';
import { PresenceRail, StartCoWatch } from './components/Session';
import type { CapsuleMeta, Focus } from './types';
```

(Replace the existing `import type { CapsuleMeta } from './types';` line with the combined one above.)

- [ ] **Step 2: Add `selectedRow` state + session wiring inside `App()`**

Immediately after the existing `const shell = useRef<HTMLDivElement>(null);` line, add:

```ts
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const lastRemote = useRef<string>('');

  // Apply a focus pushed by the editor. Skip an "empty" focus so a freshly
  // joined viewer keeps their own ?capsule/?from&to view until the host drives.
  const session = useSession((f: Focus) => {
    if (!f.capsuleId && !f.diffA && !f.diffB) return;
    lastRemote.current = JSON.stringify(f);
    setMode(f.mode);
    if (f.mode === 'detail') setSelectedId(f.capsuleId);
    else {
      setDiffA(f.diffA);
      setDiffB(f.diffB);
    }
    setSelectedRow(f.row);
  });

  const focus: Focus = { mode, capsuleId: selectedId, diffA, diffB, row: selectedRow };
  const focusKey = JSON.stringify(focus);

  // When YOU are the editor, broadcast local view changes (debounced, echo-suppressed).
  useEffect(() => {
    if (session.role !== 'edit' && session.role !== 'owner') return;
    if (focusKey === lastRemote.current) return;
    const id = setTimeout(() => session.drive(focus), 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, session.role]);

  // Capture this user's cursor over the stage as normalized 0..1 coords.
  useEffect(() => {
    if (!session.active) return;
    const stage = document.querySelector('.stage');
    if (!(stage instanceof HTMLElement)) return;
    let last = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) session.moveCursor(x, y);
    };
    stage.addEventListener('mousemove', onMove);
    return () => stage.removeEventListener('mousemove', onMove);
  }, [session.active]);
```

- [ ] **Step 3: Render the rail/start control in the topbar**

In the `.topbar` block, immediately **after** the closing `</div>` of `.segmented` and before the `{error ? …}` expression, add:

```tsx
          <div className="topbar__session">
            {session.active ? (
              <PresenceRail
                participants={session.participants}
                selfPid={session.selfPid}
                role={session.role}
              />
            ) : (
              <StartCoWatch focus={focus} />
            )}
          </div>
```

- [ ] **Step 4: Render the cursor overlay inside `.stage`**

Change the `.stage` block so `Cursors` is a child of `.stage` (sibling of `.stage__inner`):

```tsx
        <div className="stage">
          <div className="stage__inner" key={mode}>
            {mode === 'detail' ? (
              <Detail id={selectedId} />
            ) : (
              <DiffView
                capsules={capsules ?? []}
                a={diffA}
                b={diffB}
                onA={setDiffA}
                onB={setDiffB}
                selectedRow={selectedRow}
                onSelectRow={setSelectedRow}
              />
            )}
          </div>
          {session.active && <Cursors cursors={session.cursors} />}
        </div>
```

(`selectedRow`/`onSelectRow` props are added to `DiffView` in Task 7.)

- [ ] **Step 5: Show a banner when the host ends the session (optional but cheap)**

Inside the `.topbar` `{error ? … }` is unchanged; add right after it:

```tsx
          {session.ended ? (
            <span className="topbar__err mono" role="status">
              session ended by host
            </span>
          ) : null}
```

- [ ] **Step 6: Typecheck the dashboard**

Run: `npx tsc -p dashboard/tsconfig.json --noEmit`
Expected: FAIL — `DiffView` does not yet accept `selectedRow`/`onSelectRow`. This is expected; Task 7 adds them. (If you prefer a green checkpoint, do Task 7 before re-running.)

- [ ] **Step 7: Commit (after Task 7 makes typecheck green)**

Defer the commit to the end of Task 7 so the tree typechecks. See Task 7 Step 4.

---

## Task 7: Row-level focus in DiffView

**Files:**
- Modify: `dashboard/src/components/DiffView.tsx`

- [ ] **Step 1: Extend the `Props` and thread the row props through**

In `dashboard/src/components/DiffView.tsx`, change the `Props` interface:

```ts
interface Props {
  capsules: CapsuleMeta[];
  a: string | null;
  b: string | null;
  onA: (id: string) => void;
  onB: (id: string) => void;
  selectedRow: string | null;
  onSelectRow: (key: string | null) => void;
}
```

Update the component signature and the `<Terminal>` call:

```tsx
export function DiffView({ capsules, a, b, onA, onB, selectedRow, onSelectRow }: Props) {
```

and where `<Terminal diff={diff} … bId={b} />` is rendered, add the two props:

```tsx
        <Terminal diff={diff} aLabel={aLabel} bLabel={bLabel} aId={a} bId={b} selectedRow={selectedRow} onSelectRow={onSelectRow} />
```

- [ ] **Step 2: Add a stable row key + make rows clickable + highlight the focused one**

Add this helper near the other helpers (e.g., below `rowText`):

```ts
/** A stable key for a diff row: its id when present, else its JSON. */
function rowKey(table: string, row: Row): string {
  const id = row.id;
  return `${table}:${id === undefined || id === null ? JSON.stringify(row) : String(id)}`;
}
```

Change `Terminal`'s signature to receive the row props:

```tsx
function Terminal({
  diff,
  aLabel,
  bLabel,
  aId,
  bId,
  selectedRow,
  onSelectRow,
}: {
  diff: StateDiff;
  aLabel: string;
  bLabel: string;
  aId: string;
  bId: string;
  selectedRow: string | null;
  onSelectRow: (key: string | null) => void;
}) {
```

Inside `Terminal`, define a small helper for a focusable line and use it for the removed/added/changed rows. Replace the three row-render blocks inside the `tables.map(...)` with focus-aware versions:

```tsx
            {tbl.removed.map((row, i) => {
              const key = rowKey(name, row);
              return (
                <div
                  className={`tline tline--del${selectedRow === key ? ' tline--focus' : ''}`}
                  key={`r${i}`}
                  data-rowkey={key}
                  onClick={() => onSelectRow(selectedRow === key ? null : key)}
                >
                  - {rowText(row)}
                </div>
              );
            })}
            {tbl.added.map((row, i) => {
              const key = rowKey(name, row);
              return (
                <div
                  className={`tline tline--add${selectedRow === key ? ' tline--focus' : ''}`}
                  key={`a${i}`}
                  data-rowkey={key}
                  onClick={() => onSelectRow(selectedRow === key ? null : key)}
                >
                  + {rowText(row)}
                </div>
              );
            })}
            {tbl.changed.map((c, i) => {
              const key = rowKey(name, c.before);
              return (
                <div
                  className={`tchange${selectedRow === key ? ' tchange--focus' : ''}`}
                  key={`c${i}`}
                  data-rowkey={key}
                  onClick={() => onSelectRow(selectedRow === key ? null : key)}
                >
                  <div className="tline tline--ctx">~ {rowLabel(c.before)}</div>
                  {c.changedFields.map((f) => (
                    <Fragment key={f}>
                      <div className="tline tline--del">
                        -   {f}: {fmt(c.before[f])}
                      </div>
                      <div className="tline tline--add">
                        +   {f}: {fmt(c.after[f])}
                      </div>
                    </Fragment>
                  ))}
                </div>
              );
            })}
```

- [ ] **Step 3: Scroll the focused row into view when it changes (e.g., the host selected it)**

Add this effect inside `Terminal` (after its variable declarations, before the `return`):

```tsx
  useLayoutEffect(() => {
    if (!selectedRow) return;
    const el = document.querySelector(`[data-rowkey="${CSS.escape(selectedRow)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: prefersReduced() ? 'auto' : 'smooth' });
  }, [selectedRow]);
```

Ensure `useLayoutEffect` is imported at the top of the file (it already imports from `'react'`; add it if missing):

```ts
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
```

- [ ] **Step 4: Typecheck + test + commit (covers Task 6 and Task 7)**

Run: `npx tsc -p dashboard/tsconfig.json --noEmit`
Expected: no errors.
Run: `npm run typecheck && npm test`
Expected: green (backend unaffected).

```bash
git add dashboard/src/App.tsx dashboard/src/components/DiffView.tsx
git commit -m "feat(dashboard): join sessions — synced focus, row focus, cursor capture"
```

---

## Task 8: Styling (themed to the existing tokens)

**Files:**
- Modify: `dashboard/src/index.css`

- [ ] **Step 1: Append the co-watch styles**

Append to the end of `dashboard/src/index.css`:

```css
/* ===== live co-watch ===== */
.topbar__session {
  margin-left: auto;
  display: flex;
  align-items: center;
}

/* presence rail */
.presence {
  display: flex;
  align-items: center;
  gap: 10px;
}
.presence__avatars {
  display: flex;
}
.avatar {
  width: 24px;
  height: 24px;
  margin-left: -6px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  color: #0b0b0d;
  background: var(--c, var(--mint));
  border: 1.5px solid var(--chrome);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c, var(--mint)) 60%, transparent);
}
.avatar:first-child {
  margin-left: 0;
}
.avatar--me {
  outline: 1.5px solid var(--mint-bright);
  outline-offset: 1px;
}
.presence__status {
  font-size: 11.5px;
  color: var(--dim);
  white-space: nowrap;
}

/* start co-watch */
.cowatch__start {
  font: inherit;
  font-size: 12px;
  color: var(--mint);
  background: var(--mint-soft);
  border: 1px solid var(--mint-line);
  border-radius: var(--r-sm);
  padding: 5px 11px;
  cursor: pointer;
  transition: background 0.16s ease;
}
.cowatch__start:hover {
  background: color-mix(in srgb, var(--mint) 22%, transparent);
}
.cowatch {
  display: flex;
  gap: 6px;
}
.cowatch__link {
  font: inherit;
  font-size: 11.5px;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 4px 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cowatch__link:hover {
  border-color: var(--border-2);
}
.cowatch__role {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mint);
}
.cowatch__link--edit .cowatch__role {
  color: var(--amber);
}

/* focused diff row */
.tline--focus,
.tchange--focus {
  background: var(--mint-soft) !important;
  box-shadow: inset 2px 0 0 var(--mint);
}
.tline[data-rowkey],
.tchange[data-rowkey] {
  cursor: pointer;
}

/* cursor overlay */
.stage {
  position: relative;
}
.cursors {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
}
.cursor {
  position: absolute;
  transform: translate(-2px, -2px);
  transition: left 0.09s linear, top 0.09s linear;
  will-change: left, top;
}
.cursor__tag {
  position: absolute;
  left: 14px;
  top: 12px;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  color: #0b0b0d;
  background: var(--c, var(--mint));
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .cursor {
    transition: none;
  }
}
```

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `npm run build`
Expected: Vite build succeeds (no CSS/JS errors), `dashboard/dist` produced.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/index.css
git commit -m "style(dashboard): co-watch presence rail, cursors, focused-row theming"
```

---

## Task 9: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Build + run the API (serves the built dashboard)**

```bash
npm run demo        # ensure there are capsules
npm run build       # build dashboard/dist
npm run api         # http://localhost:4000
```

- [ ] **Step 2: Start a session as the editor**

In the browser at `http://localhost:4000`, pick a diff, click **Start co-watch**, copy the **edit** link, open it in window A. Copy the **view** link, open it in window B (or a second profile / incognito).

- [ ] **Step 3: Verify the four behaviors**

- **Presence:** both windows show two avatars; window A reads "you drive", window B "following …".
- **Synced focus:** in A (edit), switch Inspect↔Diff, change the diff A/B pickers, click a diff row — B follows each change and highlights/scrolls to the same row.
- **Read-only:** in B (view), confirm changing the view does NOT move A (viewers don't drive). (Network tab: a focus POST from B would be 403; the UI simply doesn't send one.)
- **Cursors:** moving the mouse over the stage in A shows a colored "mint/teal" pointer with a label in B, and vice-versa, smoothly.
- **Revoke:** in A, end the session (reload A to drop, or call `DELETE /api/sessions/:id?t=<editToken>`); B shows "session ended by host".

- [ ] **Step 4: Verify the CLI link still works**

```bash
npm run capsule -- session <a-capsule-id> --role edit
# open the printed URL → it joins a live room (lazy-created), with ?capsule= as the initial local view.
```

Expected: opens the dashboard in a live session; the existing `token` test remains green.

---

## Task 10: Living docs

**Files:**
- Modify: `CODEBASE.md`
- Modify: `USAGE.md`

- [ ] **Step 1: Update `CODEBASE.md`**

- Add `src/sessions/server.ts` to the **Collaboration — `src/sessions/`** table:
  `| server.ts | in-memory SessionHub (presence, synced focus, cursors, caps, rate-limit, revocation) + SSE handler; routed from src/api/index.ts |`
- In the **Surfaces** table, update the `src/api/index.ts` row to mention `/api/sessions` (POST create, GET …/stream SSE, POST …/focus|cursor, DELETE …).
- In the **Dashboard** table, add `session.ts`, `useSession.ts`, `components/Session.tsx`, `components/Cursors.tsx`.
- Update **Current state**: move "live co-watch session layer" from ⏳ to ✅ (presence + synced focus + cursors, in-memory, capability-token enforced). Bump the test count to 39.
- Update **Pick up here** → make increment 3 (annotations + roles persisted in InsForge with RLS) the next increment; note co-watch (inc 2) shipped.

- [ ] **Step 2: Update `USAGE.md`**

- Move **Live co-watch sessions** from "⏳ Coming soon" into "✅ Done now":
  `- **Live co-watch sessions** — Start co-watch in the dashboard (or a `capsule session` link) opens a live room: presence + role badges + live cursors + a synced focus (capsule / diff / row), driven by the edit role. In-memory + capability-token enforced (view is read-only).`
- Under the dashboard surface, add a one-line "Start co-watch" mention.
- Bump the test count (23 → 39) where stated.

- [ ] **Step 3: Final gate + commit**

Run: `npm run typecheck && npm test && npx tsc -p dashboard/tsconfig.json --noEmit`
Expected: all green.

```bash
git add CODEBASE.md USAGE.md
git commit -m "docs: live co-watch shipped — update CODEBASE/USAGE, next = inc3 (RLS annotations)"
```

---

## Self-Review

**Spec coverage:**
- 5 endpoints (POST /sessions, GET /stream, POST /focus, POST /cursor, DELETE) → Task 2. ✔
- SSE events hello/presence/focus/cursor + heartbeat → Task 1 (hub `send`) + Task 2 (`streamSession`). ✔
- SessionHub create/join/leave/setFocus/setCursor/end/snapshot → Task 1. ✔
- Ephemeral secret, lazy room creation, cursors-for-all → Task 2 (boot), Task 1 (`ensureRoom`, `setCursor`). ✔
- Security: token verified on connect + every write, view→403, cap→429, rate-limits, revocation, no bucket URLs → Task 1 (`auth`, caps, throttles, `revoked`) + Task 2 (verify before SSE). ✔
- Dashboard: session.ts + useSession + Session.tsx + Cursors.tsx + App focus/cursor + DiffView row focus → Tasks 3–7. ✔
- Tests at hub level (deterministic, injectable clock) → Task 1. ✔
- Living docs → Task 10. ✔
- CLI link reconciliation → confirmed near-zero (already emits `?session=&t=`); verified in Task 9 Step 4. ✔

**Type consistency:** `Focus` { mode, capsuleId, diffA, diffB, row } identical in `src/sessions/server.ts` and `dashboard/src/types.ts`. `Participant` { pid, role, color, label, cursor } identical. `SessionLinks` matches the `POST /api/sessions` response. `Role` imported from `token.ts` (backend) / declared in `types.ts` (dashboard). `Send` signature `(event, data)` consistent across hub + handler + client. ✔

**Placeholder scan:** no TBD/TODO; every step has concrete code or an exact command + expected output. The one intentional non-green checkpoint (Task 6 Step 6) is called out explicitly with the reason and resolved in Task 7. ✔
