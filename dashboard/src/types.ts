// Mirrors the backend's wire types (kept local so the browser bundle stays
// decoupled from the Node source tree).

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

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Triage {
  category: string;
  severity: Severity;
}

export interface CapsuleMeta {
  id: string;
  label: string;
  createdAt: string;
  schemaVersion: string;
  context: CapsuleContext;
  /** Category + severity, computed server-side. Absent on healthy snapshots. */
  triage?: Triage | null;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'investigating';

export interface Approval {
  status: ApprovalStatus;
  at: string;
  category?: string;
  severity?: Severity;
  restoreTo?: string;
  note?: string;
}

export interface NotifySettings {
  enabled: boolean;
  connected: boolean;
  chatName?: string;
  dashboardUrl: string;
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

export interface CapsuleDetail {
  meta: CapsuleMeta;
  summary: { schemaVersion: string; tables: Record<string, number> };
  /** The actual rows we froze at capture time — the backend state itself. */
  state: BackendState;
  /** The healthy snapshot this one regressed from (for "rows affected"), if any. */
  baseline: { id: string; label: string } | null;
  /** baseline → this diff: the rows that moved. Null when there is no baseline. */
  affected: StateDiff | null;
  /** Telegram approval state for this capsule, if any. */
  approval?: Approval | null;
}

export interface RestoreResult {
  id: string;
  state: BackendState;
}

export interface Health {
  adapter: string;
  version: string;
}

export interface DiagnoseResult {
  explanation: string;
  patch?: string;
}
