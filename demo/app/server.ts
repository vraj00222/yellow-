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
 * "Lumen" — a real-feeling storefront that is deliberately buggy. Shoppers and
 * admins trigger crashes through natural actions (checkout, discontinue a
 * product, apply a promo, view orders…). Every backend route is wrapped in
 * capsule.guard(), so a crash freezes a capsule (with the exact backend state)
 * that the Capsule dashboard + Telegram approval loop pick up.
 *
 * Under demo/, so it may import a concrete adapter and write live state
 * (simulating production) — the adapter rule's documented exception.
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
      { id: 'p4', name: 'Canvas Tote', price: 20, stock: 25 },
      { id: 'p5', name: 'Desk Lamp', price: 35, stock: 14 },
      { id: 'p6', name: 'Noise Buds', price: 60, stock: 9 },
    ],
    carts: [{ id: 'c1', userId: 'u1', items: [{ productId: 'p2', qty: 1 }, { productId: 'p1', qty: 2 }] }],
    users: [{ id: 'u1', email: 'sam@example.com', plan: 'pro' }],
  },
};

const defaultCart: Cart = {
  id: 'c1',
  userId: 'u1',
  items: [
    { productId: 'p2', qty: 1 },
    { productId: 'p1', qty: 2 },
  ],
};

const backend = new MockBackend(ROOT);
const { store, guard, reportError } = initCapsule(backend);

/** Common guard context — carries secrets on purpose, to prove redaction works. */
function reqCtx(url: string, body?: unknown) {
  return {
    request: {
      method: 'POST',
      url,
      headers: { authorization: 'Bearer sek_live_9f2c1d', cookie: 'sid=abc123' },
      body: body ?? { card: '4111111111111111' },
    },
    session: { userId: 'u1', token: 'sek_live_9f2c1d' },
  };
}

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
  console.log('[lumen] seeded a healthy production database + froze baseline');
}

/* --------------------------- breadth bugs (real store actions) ------------- */

type Handler = () => Promise<unknown> | unknown;

const SCENARIOS: Record<string, { url: string; run: Handler }> = {
  wishlist: {
    url: 'GET /api/wishlist?user=guest',
    run: async () => {
      const state = await backend.snapshotState();
      const user = (state.tables.users ?? []).find((u) => u.id === 'guest') as { email: string } | undefined;
      return { saved: user!.email }; // guest is undefined -> Cannot read 'email'
    },
  },
  refund: {
    url: 'POST /api/admin/refund',
    run: () => {
      throw new Error('Permission denied: admin refund requires owner role (403)');
    },
  },
  signup: {
    url: 'POST /api/account/signup',
    run: () => {
      throw new Error('Invalid signup: field "email" is required');
    },
  },
  promo: {
    url: 'POST /api/cart/promo',
    run: () => {
      throw new Error('duplicate key value violates unique constraint "promo_redemptions_code_key"');
    },
  },
  sync: {
    url: 'POST /api/admin/inventory/sync',
    run: () => {
      throw new Error('fetch failed: connect ECONNREFUSED inventory-service:9000 (network timeout)');
    },
  },
  like: {
    url: 'POST /api/products/p1/like',
    run: () => {
      throw new Error('Rate limit exceeded: too many requests (429)');
    },
  },
  orders: {
    url: 'GET /api/account/orders',
    run: () => {
      throw new Error('JWT expired — session token is no longer valid, please re-authenticate');
    },
  },
  importcsv: {
    url: 'POST /api/admin/import',
    run: () => JSON.parse('{ "rows": [ {"sku": 1}, ]'), // SyntaxError
  },
  report: {
    url: 'GET /api/admin/report?page=999',
    run: () => {
      throw new Error('Index 999 out of range: sales report only has 3 pages');
    },
  },
};

/* ------------------------------------------------------------------- the heal */

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
            console.log(`[lumen] ✅ approval ${id} → restored live to ${a.restoreTo}; store healed`);
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

  // Shopper checkout — crashes if the cart references a discontinued product.
  if (path === '/api/checkout' && method === 'POST') {
    const body = (await readBody(req)) as { items?: Cart['items'] };
    const cart: Cart = body.items?.length ? { id: 'c1', userId: 'u1', items: body.items } : defaultCart;
    try {
      const receipt = await guard(async () => checkout(await backend.snapshotState(), cart), reqCtx('POST /api/checkout', { cartId: cart.id, card: '4111111111111111' }));
      return sendJson(res, 200, { ok: true, receipt });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: (err as Error).message, capsuleId: (err as { capsuleId?: string }).capsuleId });
    }
  }

  // Admin: discontinue a product (the realistic "bad change" behind the headline crash).
  const disc = /^\/api\/admin\/discontinue\/([a-z0-9]+)$/.exec(path);
  if (disc && method === 'POST') {
    const id = disc[1];
    const state = await backend.snapshotState();
    const before = state.tables.products.length;
    state.tables.products = state.tables.products.filter((p) => p.id !== id);
    await backend.writeLiveState(state);
    return sendJson(res, 200, { ok: true, removed: before - state.tables.products.length, id });
  }

  if (path === '/api/admin/restock' && method === 'POST') {
    await backend.writeLiveState(healthy);
    return sendJson(res, 200, { ok: true, message: 'Catalog restored to healthy.' });
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

  const scenario = /^\/api\/run\/([a-z]+)$/.exec(path);
  if (scenario && method === 'POST') {
    const s = SCENARIOS[scenario[1]];
    if (!s) return sendJson(res, 404, { error: 'unknown action' });
    try {
      const result = await guard(s.run, reqCtx(s.url));
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: (err as Error).message, capsuleId: (err as { capsuleId?: string }).capsuleId });
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
  console.log(`[lumen] storefront on http://localhost:${PORT}`);
  console.log(`[lumen] watching ${CAPSULE_API}/api/approvals to self-heal on approval`);
});
