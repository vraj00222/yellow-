import type { CapsuleMeta, StateDiff } from '../core/types';

/** A coding agent that proposes a fix from a captured capsule and its diff. */
export interface AgentRunner {
  proposeFix(capsule: CapsuleMeta, diff: StateDiff): Promise<{ explanation: string; patch?: string }>;
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
  ): Promise<{ explanation: string; patch?: string }> {
    throw new Error('ReplicasAgent not wired yet — Replicas credits pending.');
  }
}
