import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter } from '../src/config';
import { InMemoryBackend } from '../src/adapters/memory';

describe('getAdapter', () => {
  it('returns the in-memory adapter for "memory"', () => {
    expect(getAdapter('memory')).toBeInstanceOf(InMemoryBackend);
  });

  it('requires InsForge credentials when none are available', () => {
    const url = process.env.INSFORGE_URL;
    const key = process.env.INSFORGE_API_KEY;
    const cwd = process.cwd();
    delete process.env.INSFORGE_URL;
    delete process.env.INSFORGE_API_KEY;
    // Run from an empty dir so no `.insforge/project.json` is picked up.
    const tmp = mkdtempSync(join(tmpdir(), 'capsule-cfg-'));
    process.chdir(tmp);
    try {
      expect(() => getAdapter('insforge')).toThrow(/INSFORGE_URL|insforge link/i);
    } finally {
      process.chdir(cwd);
      rmSync(tmp, { recursive: true, force: true });
      if (url !== undefined) process.env.INSFORGE_URL = url;
      if (key !== undefined) process.env.INSFORGE_API_KEY = key;
    }
  });

  it('rejects unknown adapter names', () => {
    expect(() => getAdapter('bogus')).toThrow(/Unknown CAPSULE_ADAPTER/);
  });
});
