/**
 * The seam between Vraj's orchestrator engine (the brain — freeze, snapshot,
 * agent teams, investigate, build, push) and the Telegram channel (the nervous
 * system — alerts, approvals, conversation).
 *
 * This file is the WHOLE contract. The engine emits {@link EngineEvent}s; the
 * channel sends {@link Command}s back. Nothing else crosses the boundary. Vraj
 * builds against these shapes, Carlo builds against these shapes, and the two
 * halves meet here — over HTTP/JSON in production, in-process for the mock.
 *
 * The engine is the source of truth for an incident's lifecycle. The Telegram
 * side only renders events and collects decisions; it never decides phase.
 */

/** Correlates every message about one incident. (May equal the capsuleId.) */
export type IncidentId = string;

// ── Events: engine → channel ────────────────────────────────────────────────
// A discriminated union on `type`. The channel renders each as a Telegram card.

/** A crash was caught and the backend state frozen. → alert ping. */
export interface IncidentFrozen {
  type: 'incident.frozen';
  incidentId: IncidentId;
  capsuleId: string;
  /** Short headline, e.g. "Crash in checkout — TypeError". */
  title: string;
  /** One or two lines of human context. */
  summary: string;
  /** Human-readable row changes, e.g. "products: REMOVED id=p2". */
  affected: string[];
  /** Deep link into the Capsule dashboard for this capsule, if available. */
  dashboardUrl?: string;
}

/** The agents named a root cause and a proposed fix. → Gate 1 ping. */
export interface ProposalReady {
  type: 'proposal.ready';
  incidentId: IncidentId;
  rootCause: string;
  proposedFix: string;
  /** 1 on the first proposal; increments each time the dev denies with feedback. */
  attempt: number;
}

/** Optional "agents are working…" status between approval and the built fix. */
export interface BuildStarted {
  type: 'build.started';
  incidentId: IncidentId;
}

/**
 * The fix is built and validated against the frozen crash state. → Gate 2 ping.
 * `diff` MUST be the real unified diff — the dev approves the merge based on it,
 * so it is never a prose summary.
 */
export interface BuildComplete {
  type: 'build.complete';
  incidentId: IncidentId;
  diff: string;
  filesChanged: string[];
  branch: string;
  validation: {
    ranAgainstFrozenState: boolean;
    crashGone: boolean;
    testsPassed: boolean;
  };
}

/** The approved fix was pushed/merged. → final ping. */
export interface MergeComplete {
  type: 'merge.complete';
  incidentId: IncidentId;
  mergedTo: string;
  prUrl?: string;
  commitSha?: string;
}

/** The answer to a free-text `ask`. → reply in the incident thread. */
export interface AnswerReady {
  type: 'answer.ready';
  incidentId: IncidentId;
  question: string;
  answer: string;
}

/** Something failed in a stage; surface it instead of going silent. */
export interface EngineError {
  type: 'error';
  incidentId: IncidentId;
  stage: string;
  message: string;
}

export type EngineEvent =
  | IncidentFrozen
  | ProposalReady
  | BuildStarted
  | BuildComplete
  | MergeComplete
  | AnswerReady
  | EngineError;

// ── Commands: channel → engine ───────────────────────────────────────────────

export type Command =
  | { type: 'approvePlan'; incidentId: IncidentId }
  | { type: 'denyPlan'; incidentId: IncidentId; feedback: string }
  | { type: 'approveCode'; incidentId: IncidentId }
  | { type: 'denyCode'; incidentId: IncidentId; feedback: string }
  | { type: 'ask'; incidentId: IncidentId; question: string }
  | { type: 'takeover'; incidentId: IncidentId };

export type CommandType = Command['type'];

/**
 * The contract the channel programs against. The mock implements it in-process;
 * the HTTP transport implements it as a `POST /commands` client plus a
 * `POST /events` inbox that fans out to the registered handlers. Either way the
 * Telegram code only ever sees this interface — never Vraj's internals.
 */
export interface OrchestratorEngine {
  /** Register a handler for events the engine emits. */
  onEvent(handler: (event: EngineEvent) => void): void;
  /** Forward a dev decision to the engine. */
  send(command: Command): Promise<void>;
}
