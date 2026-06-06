import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { Command } from 'commander';
import { getAdapter } from '../config';
import { CapsuleStore, normalizeId } from '../core/store';
import { CapsuleNotFoundError } from '../core/errors';
import { CAPSULE_VERSION } from '../version';
import { mintToken, newSessionId } from '../sessions/token';
import type { Row, StateDiff } from '../core/types';

const store = new CapsuleStore(getAdapter());

const program = new Command();
program
  .name('capsule')
  .description('Version control for a running backend — freeze, restore, diff.')
  .version(CAPSULE_VERSION);

program
  .command('freeze')
  .description('Snapshot the current backend state as a capsule')
  .option('-l, --label <label>', 'capsule label', 'manual')
  .action(async (opts: { label: string }) => {
    const meta = await store.freeze(opts.label);
    console.log(`Frozen ${meta.id}  (${store.shareUrl(meta.id)})`);
  });

program
  .command('list')
  .description('List capsules, newest first')
  .action(async () => {
    const metas = await store.list();
    if (metas.length === 0) {
      console.log('No capsules yet.');
      return;
    }
    for (const m of metas) {
      const dot = m.context.error ? color.red('●') : ' ';
      console.log(`${dot} ${m.id.padEnd(22)} ${m.label.padEnd(16)} ${relativeTime(m.createdAt)}`);
    }
  });

program
  .command('restore')
  .argument('<id>', 'capsule id (with or without capsule:// prefix)')
  .description('Load the exact state captured in a capsule')
  .action(async (id: string) => {
    const state = await store.restore(id);
    console.log(`Restored ${normalizeId(id)} — schemaVersion ${state.schemaVersion}`);
    for (const [table, rows] of Object.entries(state.tables)) {
      console.log(`  ${table}: ${rows.length} rows`);
    }
  });

program
  .command('diff')
  .argument('<a>', 'first capsule id')
  .argument('<b>', 'second capsule id')
  .description('Show what rows changed between two capsules')
  .action(async (a: string, b: string) => {
    printDiff(await store.diff(a, b));
  });

program
  .command('share')
  .argument('<id>', 'capsule id')
  .description('Print shareable links for a capsule (handle + dashboard URL)')
  .action((id: string) => {
    const dashboard = process.env.CAPSULE_DASHBOARD_URL ?? 'http://localhost:4000';
    console.log(store.shareUrl(id));
    console.log(`${dashboard}/?capsule=${encodeURIComponent(normalizeId(id))}`);
  });

program
  .command('connect')
  .description('Connect Capsule to your linked InsForge project (one-time setup)')
  .action(async () => {
    const { InsForgeBackend } = await import('../adapters/insforge');
    let backend: InstanceType<typeof InsForgeBackend>;
    try {
      backend = new InsForgeBackend();
    } catch (e) {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
      return;
    }
    const pre = await backend.preflight();
    console.log(`✓ linked → ${pre.baseUrl}`);
    console.log(
      pre.tables.length
        ? `✓ ${pre.tables.length} table(s) discovered: ${pre.tables.join(', ')}`
        : '✓ connected, but no tables yet — create some, then freeze',
    );
    if (pre.bucketReady) {
      console.log(`✓ bucket "${pre.bucket}" ready`);
    } else {
      console.log(`• creating private bucket "${pre.bucket}"…`);
      try {
        await execFileAsync('npx', ['-y', '@insforge/cli', 'storage', 'create-bucket', pre.bucket, '--private']);
        console.log(`✓ bucket "${pre.bucket}" created`);
      } catch {
        console.log(`! auto-create failed — run: npx @insforge/cli storage create-bucket ${pre.bucket} --private`);
      }
    }
    setEnvVar('CAPSULE_ADAPTER', 'insforge');
    console.log('✓ wrote .env (CAPSULE_ADAPTER=insforge)');
    if (ensureEnvVar('CAPSULE_SESSION_SECRET', () => randomBytes(24).toString('base64url'))) {
      console.log('✓ generated CAPSULE_SESSION_SECRET (signs share-session links)');
    }
    console.log('\nConnected. Next:  npm run api  →  http://localhost:4000  (your InsForge capsules, live)');
  });

program
  .command('session')
  .argument('<id>', 'capsule id to open a session for')
  .option('-r, --role <role>', 'view | edit', 'view')
  .description('Mint a shareable live-session link (view or edit)')
  .action((id: string, opts: { role: string }) => {
    const role = opts.role === 'edit' ? 'edit' : 'view';
    const dashboard = process.env.CAPSULE_DASHBOARD_URL ?? 'http://localhost:4000';
    const sid = newSessionId();
    const token = mintToken(sid, role);
    console.log(
      `${dashboard}/?session=${sid}&capsule=${encodeURIComponent(normalizeId(id))}&role=${role}&t=${token}`,
    );
  });

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  if (!(err instanceof CapsuleNotFoundError) && err instanceof Error && err.stack) {
    // unexpected failure — surface the stack to aid debugging
    console.error(err.stack);
  }
  process.exitCode = 1;
});

// ---- presentation helpers ----

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const color = { red: paint(31), green: paint(32), yellow: paint(33), dim: paint(2) };

function printDiff(d: StateDiff): void {
  let printed = false;
  if (d.schemaDrift) {
    console.log(color.yellow(`! schema drift: ${d.schemaVersionA} -> ${d.schemaVersionB}`));
    printed = true;
  }
  if (d.addedTables.length) {
    console.log(color.green(`+ tables: ${d.addedTables.join(', ')}`));
    printed = true;
  }
  if (d.removedTables.length) {
    console.log(color.red(`- tables: ${d.removedTables.join(', ')}`));
    printed = true;
  }

  for (const [table, td] of Object.entries(d.tables)) {
    if (!td.added.length && !td.removed.length && !td.changed.length) continue;
    printed = true;
    console.log(`\n${table}`);
    for (const row of td.removed) console.log(color.red(`  - ${oneLine(row)}`));
    for (const row of td.added) console.log(color.green(`  + ${oneLine(row)}`));
    for (const ch of td.changed) {
      console.log(color.yellow(`  ~ ${rowLabel(ch.before)} ${color.dim(`[${ch.changedFields.join(', ')}]`)}`));
      for (const f of ch.changedFields) {
        console.log(color.red(`      - ${f}: ${fmt(ch.before[f])}`));
        console.log(color.green(`      + ${f}: ${fmt(ch.after[f])}`));
      }
    }
  }

  if (!printed) console.log('No differences.');
}

function rowLabel(row: Row): string {
  return row.id !== undefined && row.id !== null ? String(row.id) : oneLine(row);
}

function oneLine(row: Row): string {
  const s = JSON.stringify(row);
  return s.length > 100 ? `${s.slice(0, 99)}…` : s;
}

function fmt(v: unknown): string {
  return v === undefined ? '(absent)' : JSON.stringify(v);
}

function relativeTime(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const execFileAsync = promisify(execFile);

/** Set or replace a KEY=value line in ./.env (created if absent). */
function setEnvVar(key: string, value: string): void {
  const file = resolve(process.cwd(), '.env');
  const line = `${key}=${value}`;
  const content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(content)
    ? content.replace(re, line)
    : `${content && !content.endsWith('\n') ? `${content}\n` : content}${line}\n`;
  writeFileSync(file, next);
}

/** Set KEY in ./.env only if it isn't already present. Returns true if it set it. */
function ensureEnvVar(key: string, makeValue: () => string): boolean {
  const file = resolve(process.cwd(), '.env');
  const content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (new RegExp(`^${key}=`, 'm').test(content)) return false;
  setEnvVar(key, makeValue());
  return true;
}
