import { emptyState, type BackendAdapter, type BackendState, type CapsuleMeta } from '../core/types';
import { CapsuleNotFoundError } from '../core/errors';

/**
 * In-process adapter for tests. Deep-clones on every boundary so a later live
 * mutation can never leak into an already-frozen branch.
 */
export class InMemoryBackend implements BackendAdapter {
  private live: BackendState = emptyState();
  private readonly branches = new Map<string, BackendState>();
  private readonly metas = new Map<string, CapsuleMeta>();

  /** Test/seed helper — simulates the production backend's own data. Not part of the contract. */
  setLive(state: BackendState): void {
    this.live = clone(state);
  }

  async snapshotState(): Promise<BackendState> {
    return clone(this.live);
  }

  async saveBranch(id: string, state: BackendState): Promise<void> {
    this.branches.set(id, clone(state));
  }

  async loadBranch(id: string): Promise<BackendState> {
    const state = this.branches.get(id);
    if (!state) throw new CapsuleNotFoundError(id);
    return clone(state);
  }

  async saveMeta(meta: CapsuleMeta): Promise<void> {
    this.metas.set(meta.id, clone(meta));
  }

  async getMeta(id: string): Promise<CapsuleMeta> {
    const meta = this.metas.get(id);
    if (!meta) throw new CapsuleNotFoundError(id);
    return clone(meta);
  }

  async listMeta(): Promise<CapsuleMeta[]> {
    return [...this.metas.values()].map(clone);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
