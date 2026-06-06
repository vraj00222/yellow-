import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { emptyState, type BackendAdapter, type BackendState, type CapsuleMeta } from '../core/types';
import { CapsuleNotFoundError } from '../core/errors';

/**
 * File-backed adapter under `.capsule/`. Survives across processes and uses
 * temp-file + atomic rename for every write, so a concurrent or interrupted
 * write can never leave a reader with a torn file.
 *
 *   <root>/live.json            current backend state (snapshot source)
 *   <root>/branches/<id>.json   frozen state per capsule
 *   <root>/meta/<id>.json       capsule metadata
 */
export class MockBackend implements BackendAdapter {
  private readonly liveFile: string;
  private readonly branchesDir: string;
  private readonly metaDir: string;

  constructor(root: string = resolve(process.cwd(), '.capsule')) {
    this.liveFile = join(root, 'live.json');
    this.branchesDir = join(root, 'branches');
    this.metaDir = join(root, 'meta');
  }

  async snapshotState(): Promise<BackendState> {
    return (await readJson<BackendState>(this.liveFile)) ?? emptyState();
  }

  async saveBranch(id: string, state: BackendState): Promise<void> {
    await writeJsonAtomic(join(this.branchesDir, `${id}.json`), state);
  }

  async loadBranch(id: string): Promise<BackendState> {
    const state = await readJson<BackendState>(join(this.branchesDir, `${id}.json`));
    if (!state) throw new CapsuleNotFoundError(id);
    return state;
  }

  async saveMeta(meta: CapsuleMeta): Promise<void> {
    await writeJsonAtomic(join(this.metaDir, `${meta.id}.json`), meta);
  }

  async getMeta(id: string): Promise<CapsuleMeta> {
    const meta = await readJson<CapsuleMeta>(join(this.metaDir, `${id}.json`));
    if (!meta) throw new CapsuleNotFoundError(id);
    return meta;
  }

  async listMeta(): Promise<CapsuleMeta[]> {
    let files: string[];
    try {
      files = await readdir(this.metaDir);
    } catch {
      return [];
    }
    const metas: CapsuleMeta[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const meta = await readJson<CapsuleMeta>(join(this.metaDir, file));
      if (meta) metas.push(meta);
    }
    return metas;
  }

  /**
   * Test/demo only: simulate the production backend mutating its OWN data.
   * Capsule never calls this — it only reads live state via snapshotState().
   */
  async writeLiveState(state: BackendState): Promise<void> {
    await writeJsonAtomic(this.liveFile, state);
  }
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file); // atomic on the same filesystem — readers never see a partial write
}
