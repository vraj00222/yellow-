import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockBackend } from '../../src/adapters/mock';
import { initCapsule } from '../../src/sdk';
import { checkout, type Cart } from '../checkout';
import type { BackendState } from '../../src/core/types';

/**
 * "Yellow Store" — a deliberately buggy demo app. Each button hits a backend
 * route wrapped in capsule.guard(), so a crash freezes a capsule (with the exact
 * backend state) that the Capsule dashboard + Telegram approval loop pick up.
 *
 * This file lives under demo/, so it may legitimately import a concrete adapter
 * and write live state (simulating a production backend) — the adapter rule's
 * documented exception.
 */

const ROOT = resolve(process.cwd(), '.capsule');
const PORT = Number(process.env.DEMO_PORT ?? 4100);
const CAPSULE_API = process.env.CAPSULE_API ?? 'http://localhost:4000';
const PUBLIC = resolve(fileURLToPath(new URL('.', import.meta.url)), 'public');

const healthy: BackendState = {
  schemaVersion: '1',
  tables: {
    products: [
      { id: 'p1', name: 'Aero Cap', price: 25, stock: 40 },
      { id: 'p2', name: 'Studio Tee', price: 18, stock: 5 },
      { id: 'p3', name: 'Travel Mug', price: 12, stock: 80 },
    ],
    carts: [{ id: 'c1', userId: 'u1', items: [{ productId: 'p2', qty: 1 }, { productId: 'p1', qty: 2 }] }],
    users: [{ id: 'u1', email: 'sam@example.com', plan: 'pro' }],
  },
};

const cart: Cart = {
  id: 'c1',
  userId: 'u1',
  items: [
    { productId: 'p2', qty: 1 },
    { productId: 'p1', qty: 2 },
  ],
};

const backend = new MockBackend(ROOT);
const { store, guard, reportError } = initCapsule(backend);

/** Common guard context — includes secrets on purpose, to prove redaction works. */
const ctx = {
  request: {
    method: 'POST',
    url: '/checkout',
    headers: { authorization: 'Bearer sek_live_9f2c1d', cookie: 'sid=abc123' },
    body: { cartId: cart.id, card: '4111111111111111' },
  },
  session: { userId: 'u1', token: 'sek_live_9f2c1d' },
};

async function seed(): Promise<void> {
  if (process.env.RESET !== '0') {
    // Wipe capsule data for a clean timeline, but KEEP notify.json so the
    // developer's Telegram connection (chat id) survives a demo restart.
    await rm(join(ROOT, 'branches'), { recursive: true, force: true });
    await rm(join(ROOT, 'meta'), { recursive: true, force: true });
    await rm(join(ROOT, 'live.json'), { force: true });
  }
  await backend.writeLiveState(healthy);
  await store.freeze('healthy');
  console.log('[yellow-store] seeded a healthy production database + froze baseline');
}

/* ----------------------------------------------------------- error scenarios */

type Handler = () => Promise<unknown> | unknown;

const SCENARIOS: Record<string, { ctxUrl: string; run: Handler }> = {
  // The headline: a bad deploy deleted a product the cart still references.
  checkout: {
    ctxUrl: 'POST /api/checkout',
    run: async () => checkout(await backend.snapshotState(), cart),
  },
  profile: {
    ctxUrl: 'GET /api/profile?user=ghost',
    run: async () => {
      const state = await backend.snapshotState();
      const user = (state.tables.users ?? []).find((u) => u.id === 'ghost') as { email: string } | undefined;
      return { email: user!.email.toLowerCase() }; // user is undefined -> Cannot read 'email'
    },
  },
  admin: {
    ctxUrl: 'GET /api/admin/users',
    run: () => {
      throw new Error('Permission denied: admin access required (403)');
    },
  },
  signup: {
    ctxUrl: 'POST /api/signup',
    run: () => {
      throw new Error('Invalid signup: field "email" is required');
    },
  },
  coupon: {
    ctxUrl: 'POST /api/coupon',
    run: () => {
      throw new Error('duplicate key value violates unique constraint "coupons_code_key"');
    },
  },
  sync: {
    ctxUrl: 'GET /api/inventory/sync',
    run: () => {
      throw new Error('fetch failed: connect ECONNREFUSED inventory-service:9000 (network timeout)');
    },
  },
  like: {
    ctxUrl: 'POST /api/products/p1/like',
    run: () => {
      throw new Error('Rate limit exceeded: too many requests (429)');
    },
  },
  orders: {
    ctxUrl: 'GET /api/orders',
    run: () => {
      throw new Error('JWT expired — session token is no longer valid, please re-authenticate');
    },
  },
  import: {
    ctxUrl: 'POST /api/import',
    run: () => JSON.parse('{ "rows": [ {"id": 1}, ]'), // SyntaxError: Unexpected token
  },
  report: {
    ctxUrl: 'GET /api/report?page=999',
    run: () => {
      throw new Error('Index 999 out of range: report only has 3 pages');
    },
  },
};

/* ------------------------------------------------------------------- the heal */

/**
 * Poll the Capsule API for approvals. When the developer approves a crash from
 * Telegram, restore live state to the healthy baseline — the app heals itself.
 */
async function healLoop(): Promise<void> {
  let lastHealed = '';
  for (;;) {
    try {
      const res = await fetch(`${CAPSULE_API}/api/approvals`);
      if (res.ok) {
        const approvals = (await res.json()) as Record<string, { status: string; restoreTo?: string }>;
        for (const [id, a] of Object.entries(approvals)) {
          if (a.status === 'approved' && a.restoreTo && id !== lastHealed) {
            const restored = await store.restore(a.restoreTo);
            await backend.writeLiveState(restored);
            lastHealed = id;
            console.log(`[yellow-store] ✅ approval ${id} → restored live to ${a.restoreTo}; app healed`);
          }
        }
      }
    } catch {
      /* Capsule API not up yet — keep trying */
    }
    await sleep(2000);
  }
}

/* --------------------------------------------------------------- http server */

const server = createServer((req, res) => {
  handle(req, res).catch((err) => sendJson(res, 500, { error: (err as Error).message }));
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/api/state') {
    const state = await backend.snapshotState();
    return sendJson(res, 200, state.tables);
  }

  if (path === '/api/deploy-bad' && method === 'POST') {
    const broken = structuredClone(healthy);
    broken.tables.products = broken.tables.products.filter((p) => p.id !== 'p2');
    broken.tables.products[0] = { ...broken.tables.products[0], price: 30, stock: 38 };
    await backend.writeLiveState(broken);
    return sendJson(res, 200, { ok: true, message: 'Shipped a bad deploy: product p2 deleted, p1 repriced.' });
  }

  if (path === '/api/reseed' && method === 'POST') {
    await backend.writeLiveState(healthy);
    return sendJson(res, 200, { ok: true, message: 'Reseeded healthy state.' });
  }

  // Browser errors shipped by capsule-client.js — same redaction-safe path.
  if (path === '/ingest' && method === 'POST') {
    const body = (await readBody(req)) as { name?: string; message?: string; stack?: string; url?: string };
    const meta = await reportError(
      { name: body.name ?? 'Error', message: body.message ?? 'Unknown frontend error', stack: body.stack },
      { request: { method: 'GET', url: body.url ?? '/ (browser)' } },
    );
    return sendJson(res, 200, { ok: true, capsuleId: meta.id });
  }

  const scenarioMatch = /^\/api\/run\/([a-z]+)$/.exec(path);
  if (scenarioMatch) {
    const s = SCENARIOS[scenarioMatch[1]];
    if (!s) return sendJson(res, 404, { error: 'unknown scenario' });
    try {
      const result = await guard(s.run, { ...ctx, request: { ...ctx.request, url: s.ctxUrl } });
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        error: (err as Error).message,
        capsuleId: (err as { capsuleId?: string }).capsuleId,
      });
    }
  }

  return serveStatic(path, res);
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
function contentType(file: string): string {
  return TYPES[extname(file)] ?? 'application/octet-stream';
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

await seed();
void healLoop();
server.listen(PORT, () => {
  console.log(`[yellow-store] buggy demo app on http://localhost:${PORT}`);
  console.log(`[yellow-store] watching ${CAPSULE_API}/api/approvals to self-heal on approval`);
});
