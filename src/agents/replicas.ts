import type { CapsuleMeta, StateDiff } from '../core/types';
import { retrieveContext } from '../rag/retrieve';
import { execSync } from 'child_process';

export interface AgentRunner {
  proposeFix(
    capsule: CapsuleMeta,
    diff: StateDiff,
    extra?: string,
  ): Promise<{ explanation: string; patch?: string }>;
}

export class ReplicasAgent implements AgentRunner {
  async proposeFix(
    capsule: CapsuleMeta,
    diff: StateDiff,
    extra?: string,
  ): Promise<{ explanation: string; patch?: string }> {

    const diffText = JSON.stringify(diff, null, 2);

    const context = await retrieveContext(diffText);
    const contextText = context.length > 0
      ? `\n\nRelevant docs:\n${context.join('\n---\n')}`
      : '';

    const message = `
You are a senior backend engineer debugging a production crash.

Crash error: ${capsule.context.error?.message ?? 'unknown'}

What changed between healthy and broken state:
${diffText}
${contextText}
${extra ? `\nAdditional context: ${extra}` : ''}

Provide:
1. Root cause in one sentence
2. Exact fix with code
3. How to prevent this next time
`.trim();

    const agentId = process.env.REPLICAS_AGENT_ID ?? '4712b33a-ed76-49cb-b57f-db807ee09292';

    try {
      // Send message via CLI
      execSync(`replicas send ${agentId} -m ${JSON.stringify(message)}`, {
        env: { ...process.env, PATH: process.env.PATH + ':/Users/aditiadgaonkar/.bun/bin' },
      });

      // Wait for response
      await new Promise(r => setTimeout(r, 15000));

      // Read the response
      const output = execSync(`replicas read ${agentId}`, {
        env: { ...process.env, PATH: process.env.PATH + ':/Users/aditiadgaonkar/.bun/bin' },
      }).toString();

      return {
        explanation: output.slice(-2000),
        patch: undefined,
      };
    } catch (e) {
      return {
        explanation: `Agent error: ${(e as Error).message}`,
        patch: undefined,
      };
    }
  }
}