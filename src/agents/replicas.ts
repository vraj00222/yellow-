import type { CapsuleMeta, StateDiff } from '../core/types';

/** A coding agent that proposes a fix from a captured capsule and its diff. */
export interface AgentRunner {
  /** `extra` is an optional follow-up instruction from the developer (e.g. "look at the logs"). */
  proposeFix(
    capsule: CapsuleMeta,
    diff: StateDiff,
    extra?: string,
  ): Promise<{ explanation: string; patch?: string }>;
  /** Rewrite a source file to fix a runtime error — returns the COMPLETE corrected file. */
  proposeCodeFix(filePath: string, fileContent: string, errorMessage: string): Promise<string>;
}

/**
 * Replicas agent — NOT WIRED YET (intentional stub).
 *
 * Replicas is an autonomous coding agent (a hackathon sponsor). Once credits
 * land, the flow is:
 *   1. restore a crash capsule's exact backend state,
 *   2. hand that state + the healthy→crash diff to a Replicas agent,
 *   3. surface its proposed explanation/patch in the dashboard.
 * The dashboard's disabled "Ask agent to fix" button targets this method.
 */
export class ReplicasAgent implements AgentRunner {
  async proposeFix(
    _capsule: CapsuleMeta,
    _diff: StateDiff,
    _extra?: string,
  ): Promise<{ explanation: string; patch?: string }> {
    throw new Error('ReplicasAgent not wired yet — Replicas credits pending.');
  }

  async proposeCodeFix(_filePath: string, _fileContent: string, _errorMessage: string): Promise<string> {
    throw new Error('ReplicasAgent not wired yet — Replicas credits pending.');
  }
}
