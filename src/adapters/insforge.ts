import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAdminClient } from '@insforge/sdk';
import type { InsForgeClient } from '@insforge/sdk';
import type { BackendAdapter, BackendState, CapsuleMeta, Row } from '../core/types';
import { CapsuleNotFoundError } from '../core/errors';

/**
 * InsForge adapter — snapshots the live database and persists each capsule as a
 * JSON object in an InsForge Storage bucket.
 *
 * Why not "one InsForge branch per capsule": branches are CLI-only, heavyweight
 * (a full instance each), and capped at 2 active per parent — they are built for
 * preview environments, not for storing many snapshots. So capsules live in
 * Storage; the branch primitive is reserved for the future "one-click reproduce"
 * feature (restore a capsule into a real preview branch).
 *
 * Credentials (either source):
 *   - env INSFORGE_URL + INSFORGE_API_KEY, or
 *   - `.insforge/project.json` written by `npx @insforge/cli link` (oss_host + api_key)
 * Other config:
 *   CAPSULE_TABLES          tables to snapshot (optional — auto-discovered via
 *                           GET /api/database/tables when unset)
 *   CAPSULE_BUCKET          storage bucket for capsules (default "capsule")
 *   CAPSULE_SCHEMA_VERSION  schema tag, bump on migrations (default "1")
 *
 * Bucket layout (every object is written ONCE under a unique key — InsForge
 * Storage auto-renames duplicate keys instead of overwriting, so we never
 * rewrite an object):
 *   branches/<id>.json   frozen BackendState per capsule
 *   meta/<id>.json       one CapsuleMeta per file (enumerated via storage.list)
 */

export class InsForgeBackend implements BackendAdapter {
  private readonly client: InsForgeClient;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly bucket: string;
  private readonly tables: string[];
  private readonly schemaVersion: string;

  constructor() {
    const { baseUrl, apiKey } = loadCredentials();
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.client = createAdminClient({ baseUrl, apiKey });
    this.bucket = process.env.CAPSULE_BUCKET ?? 'capsule';
    this.tables = (process.env.CAPSULE_TABLES ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    this.schemaVersion = process.env.CAPSULE_SCHEMA_VERSION ?? '1';
  }

  async snapshotState(): Promise<BackendState> {
    const tableNames = this.tables.length > 0 ? this.tables : await this.discoverTables();
    if (tableNames.length === 0) {
      throw new Error('InsForgeBackend: no tables to snapshot (set CAPSULE_TABLES)');
    }
    const tables: Record<string, Row[]> = {};
    for (const name of tableNames) {
      const { data, error } = await this.client.database.from(name).select();
      if (error) throw new Error(`InsForge: select "${name}" failed — ${error.message}`);
      tables[name] = (data as Row[] | null) ?? [];
    }
    return { schemaVersion: this.schemaVersion, tables };
  }

  /** Auto-discover user tables when CAPSULE_TABLES is unset. */
  private async discoverTables(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/database/tables`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`InsForge: GET /api/database/tables failed — ${res.status} ${res.statusText}`);
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      throw new Error('InsForge: unexpected /api/database/tables response (expected string[])');
    }
    return body.filter((n): n is string => typeof n === 'string');
  }

  async saveBranch(id: string, state: BackendState): Promise<void> {
    await this.putJson(`branches/${id}.json`, state);
  }

  async loadBranch(id: string): Promise<BackendState> {
    const state = await this.getJson<BackendState>(`branches/${id}.json`);
    if (!state) throw new CapsuleNotFoundError(id);
    return state;
  }

  async saveMeta(meta: CapsuleMeta): Promise<void> {
    await this.putJson(`meta/${meta.id}.json`, meta);
  }

  async getMeta(id: string): Promise<CapsuleMeta> {
    const meta = await this.getJson<CapsuleMeta>(`meta/${id}.json`);
    if (!meta) throw new CapsuleNotFoundError(id);
    return meta;
  }

  async listMeta(): Promise<CapsuleMeta[]> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list({ prefix: 'meta/', limit: 1000 });
    if (error) throw new Error(`InsForge: list meta failed — ${error.message}`);
    const metas: CapsuleMeta[] = [];
    for (const key of listKeys(data)) {
      if (!key.endsWith('.json')) continue;
      const meta = await this.getJson<CapsuleMeta>(key);
      if (meta && typeof meta.id === 'string' && typeof meta.label === 'string') metas.push(meta);
    }
    return metas;
  }

  /** Read-only connectivity check used by `capsule connect`. */
  async preflight(): Promise<{ baseUrl: string; bucket: string; tables: string[]; bucketReady: boolean }> {
    const tables = this.tables.length > 0 ? this.tables : await this.discoverTables();
    const { error } = await this.client.storage.from(this.bucket).list({ limit: 1 });
    return { baseUrl: this.baseUrl, bucket: this.bucket, tables, bucketReady: !error };
  }

  private async putJson(path: string, value: unknown): Promise<void> {
    const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
    const { error } = await this.client.storage.from(this.bucket).upload(path, blob);
    if (error) throw new Error(`InsForge: upload "${path}" failed — ${error.message}`);
  }

  private async getJson<T>(path: string): Promise<T | undefined> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) return undefined;
    return JSON.parse(await data.text()) as T;
  }
}

interface CliProjectLink {
  project_id?: string;
  api_key?: string;
  oss_host?: string;
}

/**
 * Credentials from env (INSFORGE_URL / INSFORGE_API_KEY), falling back to the
 * `.insforge/project.json` file that `npx @insforge/cli link` writes (gitignored).
 */
export function loadCredentials(): { baseUrl: string; apiKey: string } {
  let baseUrl = process.env.INSFORGE_URL;
  let apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    const file = resolve(process.cwd(), '.insforge', 'project.json');
    if (existsSync(file)) {
      const link = JSON.parse(readFileSync(file, 'utf8')) as CliProjectLink;
      baseUrl ??= link.oss_host ? withScheme(link.oss_host) : undefined;
      apiKey ??= link.api_key;
    }
  }
  if (!baseUrl || !apiKey) {
    throw new Error(
      'InsForgeBackend: no credentials — run `npx @insforge/cli link` (writes .insforge/project.json), ' +
        'or set INSFORGE_URL and INSFORGE_API_KEY.',
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

function withScheme(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

/** Extract object keys from an InsForge `list()` payload (`{ data: [{ key }], pagination }`). */
function listKeys(payload: unknown): string[] {
  return listArray(payload)
    .map((o) => (o && typeof o === 'object' ? (o as { key?: unknown }).key : o))
    .filter((k): k is string => typeof k === 'string');
}

function listArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.objects)) return o.objects;
  }
  return [];
}
