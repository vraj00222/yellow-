import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { CapsuleStore, normalizeId } from '../core/store';
import { CapsuleNotFoundError } from '../core/errors';
import { getAdapter } from '../config';
import { CAPSULE_VERSION } from '../version';
import { OpenRouterAgent } from '../agents/openrouter';
import { triage, rowsAffected } from '../triage';
import {
  startNotifier,
  listApprovals,
  getApproval,
  settingsStatus,
  sendTest,
  notifyCapsule,
} from '../notify/service';
import type { BackendState, CapsuleMeta } from '../core/types';

const store = new CapsuleStore(getAdapter());
const agent = new OpenRouterAgent();
const PORT = Number(process.env.PORT ?? 4000);
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? `http://localhost:${PORT}`;
const DASHBOARD_DIST = resolve(process.cwd(), 'dashboard/dist');

const server = createServer((req, res) => {
  handle(req, res).catch((err) => sendError(res, err));
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method ?? 'GET';
  if (url.pathname.startsWith('/api/')) return handleApi(method, url, res);
  return serveStatic(url.pathname, res);
}

async function handleApi(method: string, url: URL, res: ServerResponse): Promise<void> {
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') {
    return sendJson(res, 200, {
      adapter: process.env.CAPSULE_ADAPTER ?? 'mock',
      version: CAPSULE_VERSION,
    });
  }

  if (method === 'GET' && path === '/api/capsules') {
    const metas = await store.list();
    return sendJson(
      res,
      200,
      metas.map((m) => ({ ...m, triage: triage(m) })),
    );
  }

  if (method === 'GET' && path === '/api/approvals') {
    return sendJson(res, 200, await listApprovals());
  }

  if (method === 'GET' && path === '/api/settings') {
    return sendJson(res, 200, await settingsStatus());
  }

  if (method === 'POST' && path === '/api/settings/test') {
    return sendJson(res, 200, await sendTest());
  }

  if (method === 'GET' && path === '/api/diff') {
    const a = url.searchParams.get('a');
    const b = url.searchParams.get('b');
    if (!a || !b) return sendJson(res, 400, { error: 'query params "a" and "b" are required' });
    return sendJson(res, 200, await store.diff(a, b));
  }

  const capsuleMatch = /^\/api\/capsules\/([^/]+)$/.exec(path);
  if (method === 'GET' && capsuleMatch) {
    const id = decodeURIComponent(capsuleMatch[1]);
    const [meta, state, metas] = await Promise.all([
      store.getMeta(id),
      store.restore(id),
      store.list(),
    ]);
    // Pair the snapshot with the healthy baseline it regressed from so the UI can
    // show "what changed" inline — not just the error, but the rows that moved.
    const baseline = findBaseline(metas, meta.id);
    const affected = baseline ? await store.diff(baseline.id, meta.id) : null;
    const rows = affected ? rowsAffected(affected) : 0;
    return sendJson(res, 200, {
      meta: { ...meta, triage: triage(meta, rows) },
      summary: summarize(state),
      state,
      baseline: baseline ? { id: baseline.id, label: baseline.label } : null,
      affected,
      approval: await getApproval(meta.id),
    });
  }

  // AI root-cause via InsForge Model Gateway: hand the crash + its healthy→crash
  // diff to a model and return a plain-English root cause + fix.
  const diagnoseMatch = /^\/api\/capsules\/([^/]+)\/diagnose$/.exec(path);
  if (method === 'POST' && diagnoseMatch) {
    const id = decodeURIComponent(diagnoseMatch[1]);
    const [meta, metas] = await Promise.all([store.getMeta(id), store.list()]);
    const baseline = findBaseline(metas, meta.id);
    const diff = await store.diff(baseline ? baseline.id : meta.id, meta.id);
    return sendJson(res, 200, await agent.proposeFix(meta, diff));
  }

  // Manually (re)send a capsule's alert to Telegram — the dashboard "Send to Telegram" button.
  const notifyMatch = /^\/api\/capsules\/([^/]+)\/notify$/.exec(path);
  if (method === 'POST' && notifyMatch) {
    const id = decodeURIComponent(notifyMatch[1]);
    return sendJson(res, 200, await notifyCapsule(id));
  }

  const restoreMatch = /^\/api\/restore\/([^/]+)$/.exec(path);
  if (method === 'POST' && restoreMatch) {
    const id = decodeURIComponent(restoreMatch[1]);
    const state = await store.restore(id);
    return sendJson(res, 200, { id: normalizeId(id), state });
  }

  return sendJson(res, 404, { error: `No route for ${method} ${path}` });
}

function summarize(state: BackendState): { schemaVersion: string; tables: Record<string, number> } {
  const tables: Record<string, number> = {};
  for (const [name, rows] of Object.entries(state.tables)) tables[name] = rows.length;
  return { schemaVersion: state.schemaVersion, tables };
}

/**
 * The snapshot a capsule most likely regressed from: the most recent *healthy*
 * capsule older than it, falling back to the immediately older one. Lets the
 * inspector show the rows that changed, not just the captured error. `metas` is
 * newest-first (as `store.list()` returns).
 */
function findBaseline(metas: CapsuleMeta[], id: string): CapsuleMeta | null {
  const i = metas.findIndex((m) => m.id === id);
  if (i === -1) return null;
  for (let j = i + 1; j < metas.length; j++) {
    if (!metas[j].context.error) return metas[j];
  }
  return metas[i + 1] ?? null;
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  if (!existsSync(DASHBOARD_DIST)) {
    return sendJson(res, 404, {
      error: 'dashboard not built — run `npm run build`, or use `npm run dev:dashboard` in dev',
    });
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(DASHBOARD_DIST, rel);
  if (candidate.startsWith(DASHBOARD_DIST) && isFile(candidate)) {
    return sendFile(res, candidate);
  }
  return sendFile(res, join(DASHBOARD_DIST, 'index.html')); // SPA fallback
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof CapsuleNotFoundError) {
    sendJson(res, 404, { error: err.message });
    return;
  }
  console.error('[capsule:api]', err);
  sendJson(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
}

async function sendFile(res: ServerResponse, filePath: string): Promise<void> {
  // no-store so a rebuilt dashboard is never masked by a stale browser cache.
  res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
  res.end(await readFile(filePath));
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function contentType(file: string): string {
  return CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

server.listen(PORT, () => {
  console.log(`[capsule:api] listening on http://localhost:${PORT}`);
  // Watch for new crashes → triage → Telegram approval loop.
  startNotifier({ store, agent, dashboardUrl: DASHBOARD_URL });
});
