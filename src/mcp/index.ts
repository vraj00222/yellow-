import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getAdapter } from '../config';
import { CapsuleStore } from '../core/store';
import { CAPSULE_VERSION } from '../version';

const store = new CapsuleStore(getAdapter());

export const TOOL_NAMES = [
  'capsule_freeze',
  'capsule_restore',
  'capsule_diff',
  'capsule_list',
] as const;

/** Run a store operation and serialize the result as MCP text content. */
async function asText(fn: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

/** Build the MCP server (not connected) — also used by tests. */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'capsule', version: CAPSULE_VERSION });

  server.registerTool(
    'capsule_freeze',
    {
      description: 'Snapshot the current backend state as a capsule.',
      inputSchema: { label: z.string().optional() },
    },
    ({ label }) => asText(() => store.freeze(label ?? 'manual')),
  );

  server.registerTool(
    'capsule_restore',
    {
      description: 'Load the exact backend state captured in a capsule.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => asText(() => store.restore(id)),
  );

  server.registerTool(
    'capsule_diff',
    {
      description: 'Show what rows changed between two capsules.',
      inputSchema: { a: z.string(), b: z.string() },
    },
    ({ a, b }) => asText(() => store.diff(a, b)),
  );

  server.registerTool(
    'capsule_list',
    { description: 'List capsules, newest first.' },
    () => asText(() => store.list()),
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // stdout is reserved for the MCP protocol; all logging goes to stderr.
  console.error('[capsule] MCP server ready on stdio');
}

// Only start the server when run directly, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[capsule] MCP server failed to start:', err);
    process.exitCode = 1;
  });
}
