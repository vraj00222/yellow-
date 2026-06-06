import type {
  BackendAdapter,
  CapsuleContext,
  CapsuleErrorInfo,
  CapsuleMeta,
  CapsuleRequest,
} from '../core/types';
import { CapsuleStore } from '../core/store';
import { redact, redactBody } from './redact';

export interface GuardContext {
  request?: CapsuleRequest;
  session?: Record<string, unknown>;
  gitCommit?: string;
}

/** Minimal Express-style request shape — avoids a hard dependency on express types. */
interface RequestLike {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
  session?: unknown;
}

type ErrorMiddleware = (
  err: unknown,
  req: RequestLike,
  res: unknown,
  next: (err?: unknown) => void,
) => void;

export interface Capsule {
  store: CapsuleStore;
  guard<T>(fn: () => T | Promise<T>, ctx?: GuardContext): Promise<T>;
  errorMiddleware(): ErrorMiddleware;
  /** Freeze a crash capsule from an error reported out-of-band (e.g. a browser). */
  reportError(errorInfo: CapsuleErrorInfo, ctx?: GuardContext): Promise<CapsuleMeta>;
}

export function initCapsule(adapter: BackendAdapter): Capsule {
  const store = new CapsuleStore(adapter);

  /** Capture a crash as a capsule. NEVER throws — the freeze path must not mask the user's error. */
  async function freezeCrash(err: unknown, ctx?: GuardContext): Promise<void> {
    try {
      const meta = await store.freeze('crash', buildContext(toErrorInfo(err), ctx));
      attachCapsuleId(err, meta.id);
      console.error(`[capsule] crash captured → ${store.shareUrl(meta.id)}`);
    } catch (freezeErr) {
      console.error('[capsule] failed to freeze crash capsule:', freezeErr);
    }
  }

  /**
   * Freeze a crash from an error reported out-of-band (e.g. a browser's
   * window.onerror shipped to an ingest route). Same redaction as guard().
   */
  async function reportError(errorInfo: CapsuleErrorInfo, ctx?: GuardContext): Promise<CapsuleMeta> {
    return store.freeze('crash', buildContext(errorInfo, ctx));
  }

  async function guard<T>(fn: () => T | Promise<T>, ctx?: GuardContext): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      await freezeCrash(err, ctx);
      throw err; // always the user's original error, untouched
    }
  }

  function errorMiddleware(): ErrorMiddleware {
    return (err, req, _res, next) => {
      const ctx: GuardContext = {
        request: {
          method: req.method,
          url: req.originalUrl ?? req.url,
          headers: req.headers,
          body: req.body,
        },
        session: isRecord(req.session) ? req.session : undefined,
      };
      void freezeCrash(err, ctx).finally(() => next(err));
    };
  }

  return { store, guard, errorMiddleware, reportError };
}

function buildContext(error: CapsuleErrorInfo, ctx?: GuardContext): CapsuleContext {
  const context: CapsuleContext = { error };
  if (ctx?.request) {
    context.request = {
      method: ctx.request.method,
      url: ctx.request.url,
      headers: ctx.request.headers
        ? (redact(ctx.request.headers) as Record<string, unknown>)
        : undefined,
      body: redactBody(ctx.request.body),
    };
  }
  if (ctx?.session) context.session = redact(ctx.session) as Record<string, unknown>;
  if (ctx?.gitCommit) context.gitCommit = ctx.gitCommit;
  return context;
}

function toErrorInfo(err: unknown): CapsuleErrorInfo {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: 'Error', message: typeof err === 'string' ? err : safeMessage(err) };
}

function safeMessage(err: unknown): string {
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

function attachCapsuleId(err: unknown, id: string): void {
  if (err && typeof err === 'object') {
    try {
      (err as Record<string, unknown>).capsuleId = id;
    } catch {
      /* frozen/sealed error object — ignore, the capsule still exists */
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
