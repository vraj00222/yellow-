import type { BackendState } from './core/types';

/**
 * Planned maintenance hooks — INTERFACE ONLY, not implemented yet.
 *
 * The signatures are fixed now so call sites can be designed against them
 * before the bodies land (2–3 days out). Do not add implementations here
 * without also wiring real call sites.
 */
export interface MaintenanceHooks {
  /** TODO: strip/scramble PII so a snapshot can safely seed a staging mirror. */
  anonymize(state: BackendState): BackendState;

  /** TODO: delete capsules older than N days (retention / cost control). */
  gc(olderThanDays: number): Promise<number>;

  /** TODO: assert backend invariants; surface violations as proactive alerts. */
  checkInvariants(state: BackendState): string[];
}
