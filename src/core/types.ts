/**
 * Core data model and the single backend contract.
 *
 * `BackendAdapter` is the ONLY interface that touches a backend. Every other
 * layer (sdk, cli, mcp, api, dashboard) depends on this contract and nothing
 * else, so swapping the backend implementation changes no other file.
 */

export type Row = Record<string, unknown>;

export interface BackendState {
  schemaVersion: string;
  tables: Record<string, Row[]>;
}

export interface CapsuleErrorInfo {
  name: string;
  message: string;
  stack?: string;
}

export interface CapsuleRequest {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
}

export interface CapsuleContext {
  error?: CapsuleErrorInfo;
  request?: CapsuleRequest;
  session?: Record<string, unknown>;
  gitCommit?: string;
}

export interface CapsuleMeta {
  id: string;
  label: string;
  /** ISO 8601, UTC. */
  createdAt: string;
  schemaVersion: string;
  context: CapsuleContext;
}

/** The one interface that touches a backend. Exactly six methods — no more. */
export interface BackendAdapter {
  snapshotState(): Promise<BackendState>;
  saveBranch(id: string, state: BackendState): Promise<void>;
  loadBranch(id: string): Promise<BackendState>;
  saveMeta(meta: CapsuleMeta): Promise<void>;
  getMeta(id: string): Promise<CapsuleMeta>;
  listMeta(): Promise<CapsuleMeta[]>;
}

export interface RowChange {
  key: string;
  changedFields: string[];
  before: Row;
  after: Row;
}

export interface TableDiff {
  added: Row[];
  removed: Row[];
  changed: RowChange[];
}

export interface StateDiff {
  schemaDrift: boolean;
  schemaVersionA: string;
  schemaVersionB: string;
  addedTables: string[];
  removedTables: string[];
  tables: Record<string, TableDiff>;
}

/** A backend with no data yet. Used when live state is missing — never crash. */
export function emptyState(): BackendState {
  return { schemaVersion: '0', tables: {} };
}
