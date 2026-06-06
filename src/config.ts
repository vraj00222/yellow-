import type { BackendAdapter } from './core/types';
import { InMemoryBackend } from './adapters/memory';
import { MockBackend } from './adapters/mock';
import { InsForgeBackend } from './adapters/insforge';

// Load ./.env (if present) so CAPSULE_ADAPTER and INSFORGE_* can live in a file.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — that's fine */
}

/** Selects the backend adapter from CAPSULE_ADAPTER (default "mock"). */
export function getAdapter(name: string = process.env.CAPSULE_ADAPTER ?? 'mock'): BackendAdapter {
  switch (name) {
    case 'mock':
      return new MockBackend();
    case 'memory':
      return new InMemoryBackend();
    case 'insforge':
      return new InsForgeBackend();
    default:
      throw new Error(`Unknown CAPSULE_ADAPTER "${name}" (expected: mock | memory | insforge)`);
  }
}
