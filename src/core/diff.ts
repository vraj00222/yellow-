import { createHash } from 'node:crypto';
import type { BackendState, Row, RowChange, StateDiff, TableDiff } from './types';

/**
 * Canonical JSON: object keys sorted recursively, arrays order-preserving.
 * `undefined` is distinct from `null` so a missing field never reads as null.
 * Used for value equality and for content-hashing rows that lack an id.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value)!;
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Rows are identified by `id` when present, otherwise by a hash of their content. */
function rowKey(row: Row): string {
  if (row.id !== undefined && row.id !== null) return `id:${stableStringify(row.id)}`;
  return `hash:${createHash('sha1').update(stableStringify(row)).digest('hex')}`;
}

function changedFields(before: Row, after: Row): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (stableStringify(before[k]) !== stableStringify(after[k])) changed.push(k);
  }
  return changed.sort();
}

function diffTable(a: Row[], b: Row[]): TableDiff {
  const aByKey = new Map<string, Row>();
  const bByKey = new Map<string, Row>();
  for (const row of a) aByKey.set(rowKey(row), row);
  for (const row of b) bByKey.set(rowKey(row), row);

  const removed: Array<[string, Row]> = [];
  const added: Array<[string, Row]> = [];
  const changed: RowChange[] = [];

  for (const [key, before] of aByKey) {
    const after = bByKey.get(key);
    if (after === undefined) {
      removed.push([key, before]);
    } else {
      const fields = changedFields(before, after);
      if (fields.length > 0) changed.push({ key, changedFields: fields, before, after });
    }
  }
  for (const [key, after] of bByKey) {
    if (!aByKey.has(key)) added.push([key, after]);
  }

  const byKey = (x: [string, Row], y: [string, Row]) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  removed.sort(byKey);
  added.sort(byKey);
  changed.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  return {
    added: added.map(([, row]) => row),
    removed: removed.map(([, row]) => row),
    changed,
  };
}

/**
 * Diff two backend snapshots. Overlapping tables are diffed row-by-row even
 * when schemaVersion differs; the version mismatch surfaces as `schemaDrift`
 * plus the table-level added/removed lists. Output is fully deterministic.
 */
export function diffStates(a: BackendState, b: BackendState): StateDiff {
  const tablesA = a.tables ?? {};
  const tablesB = b.tables ?? {};
  const names = new Set([...Object.keys(tablesA), ...Object.keys(tablesB)]);

  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const tables: Record<string, TableDiff> = {};

  for (const name of [...names].sort()) {
    const inA = Object.prototype.hasOwnProperty.call(tablesA, name);
    const inB = Object.prototype.hasOwnProperty.call(tablesB, name);
    if (inA && !inB) removedTables.push(name);
    else if (!inA && inB) addedTables.push(name);
    tables[name] = diffTable(tablesA[name] ?? [], tablesB[name] ?? []);
  }

  return {
    schemaDrift: a.schemaVersion !== b.schemaVersion,
    schemaVersionA: a.schemaVersion,
    schemaVersionB: b.schemaVersion,
    addedTables,
    removedTables,
    tables,
  };
}
