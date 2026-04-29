/**
 * Public advisory API surface for the GSD SDK.
 *
 * Re-exports all Phase 5 public types and functions from the advisory subsystem.
 * Only named exports are used here — no wildcard re-exports — to keep the public
 * API surface explicit and prevent accidental exposure of internals.
 *
 * Trust boundary note (T-05-05-01): wildcard re-exports are intentionally avoided.
 */

// ─── Extension registry (EXT-01, EXT-02, EXT-06, EXT-07) ────────────────────

export {
  ExtensionRegistry,
  ExtensionRegistryError,
  SealedExtensionGraph,
} from './extension-registry.js';

export type {
  ExtensionRegistryErrorCode,
  ExtensionSlot,
  GateRegistration,
  GateStepMeta,
  InsertStepRegistration,
  LifecycleHookRegistration,
  ProviderCheckRegistration,
  ReplaceInstructionRegistration,
} from './extension-registry.js';

// ─── Advisory control events (EXT-03, EXT-04, EXT-05, MIGR-01, MIGR-02) ─────

export { validateAdvisoryControlEvent } from './control-events.js';

export type {
  AdvisoryControlEvent,
  AdvisoryControlEventValidationIssue,
  GateFailedEvent,
  MigrationRequiredEvent,
  ResumeBlockedEvent,
  RollbackBlockedEvent,
} from './control-events.js';

// ─── FSM rollback and migration (MIGR-03, MIGR-04) ──────────────────────────

export { migrateFsmState, rollbackFsmState } from './fsm-rollback.js';

export type {
  FsmAlreadyCurrentResult,
  FsmMigrateResult,
  FsmRollbackResult,
} from './fsm-rollback.js';

// ─── FSM state parsing with control event wrapping (MIGR-05) ─────────────────

export { parseFsmRunStateOrControlEvent } from './fsm-state.js';
