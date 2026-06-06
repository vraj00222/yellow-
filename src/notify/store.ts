import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import type { Severity } from '../triage';

/**
 * Notifier state, persisted under `.capsule/notify.json` (atomic writes).
 * The API process is the only writer; the demo app reads approvals over HTTP.
 * A single in-memory `cache` is the source of truth within the process, so the
 * watcher and poller loops never race on the file.
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'investigating';

export interface Approval {
  status: ApprovalStatus;
  at: string;
  category?: string;
  severity?: Severity;
  /** Healthy baseline capsule id to restore live state to on approval. */
  restoreTo?: string;
  note?: string;
}

export interface NotifyState {
  chatId?: number;
  chatName?: string;
  offset: number;
  seen: string[];
  approvals: Record<string, Approval>;
  messageIds: Record<string, number>;
}

const FILE = resolve(process.cwd(), '.capsule', 'notify.json');
const EMPTY: NotifyState = { offset: 0, seen: [], approvals: {}, messageIds: {} };

let cache: NotifyState | null = null;

export async function loadNotify(): Promise<NotifyState> {
  if (cache) return cache;
  try {
    cache = { ...EMPTY, ...(JSON.parse(await readFile(FILE, 'utf8')) as Partial<NotifyState>) };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

export async function saveNotify(state: NotifyState): Promise<void> {
  cache = state;
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = join(dirname(FILE), `notify.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, FILE);
}
