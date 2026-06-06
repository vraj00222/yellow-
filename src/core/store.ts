import type { BackendAdapter, BackendState, CapsuleContext, CapsuleMeta, StateDiff } from './types';
import { generateId } from './ids';
import { diffStates } from './diff';

const SCHEME = 'capsule://';

/** Accept ids with or without the `capsule://` prefix everywhere user-facing. */
export function normalizeId(id: string): string {
  return id.startsWith(SCHEME) ? id.slice(SCHEME.length) : id;
}

/**
 * The product engine. Wraps a BackendAdapter to freeze (snapshot+commit),
 * restore (checkout), diff, and list capsules. Touches the backend only
 * through the adapter interface.
 */
export class CapsuleStore {
  constructor(private readonly adapter: BackendAdapter) {}

  async freeze(label: string, context: CapsuleContext = {}): Promise<CapsuleMeta> {
    return this.ingest(label, await this.adapter.snapshotState(), context);
  }

  /**
   * Freeze a capsule from a state supplied by the caller (rather than snapshotting
   * the adapter). Used by the HTTP ingest path, where an external app reports a
   * crash together with its own backend tables.
   */
  async ingest(label: string, state: BackendState, context: CapsuleContext = {}): Promise<CapsuleMeta> {
    const existing = await this.adapter.listMeta();
    const id = generateId(label, new Set(existing.map((m) => m.id)));
    const meta: CapsuleMeta = {
      id,
      label,
      createdAt: new Date().toISOString(),
      schemaVersion: state.schemaVersion,
      context,
    };
    await this.adapter.saveBranch(id, state);
    await this.adapter.saveMeta(meta);
    return meta;
  }

  async restore(id: string): Promise<BackendState> {
    return this.adapter.loadBranch(normalizeId(id));
  }

  /** Loads each branch exactly once (deduped when a === b). */
  async diff(a: string, b: string): Promise<StateDiff> {
    const idA = normalizeId(a);
    const idB = normalizeId(b);
    if (idA === idB) {
      const state = await this.adapter.loadBranch(idA);
      return diffStates(state, state);
    }
    const [stateA, stateB] = await Promise.all([
      this.adapter.loadBranch(idA),
      this.adapter.loadBranch(idB),
    ]);
    return diffStates(stateA, stateB);
  }

  /** Newest first, with a stable id tie-break. */
  async list(): Promise<CapsuleMeta[]> {
    const metas = await this.adapter.listMeta();
    return metas.sort((x, y) => {
      if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? 1 : -1;
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
    });
  }

  async getMeta(id: string): Promise<CapsuleMeta> {
    return this.adapter.getMeta(normalizeId(id));
  }

  shareUrl(id: string): string {
    return `${SCHEME}${normalizeId(id)}`;
  }
}
