---
phase: 05-extension-api-migration-hardening
plan: "04"
subsystem: sdk/advisory
tags:
  - fsm-rollback
  - fsm-migration
  - append-only
  - tdd
  - typescript
dependency_graph:
  requires:
    - sdk/src/advisory/fsm-state.ts (acquireFsmLock, releaseFsmLock, writeFsmState, fsmStatePath, parseFsmRunState, CURRENT_FSM_STATE_SCHEMA_VERSION)
    - sdk/src/advisory/control-events.ts (RollbackBlockedEvent, ResumeBlockedEvent, AdvisoryControlEvent)
  provides:
    - rollbackFsmState() — append-only FSM rollback to last checkpoint
    - migrateFsmState() — FSM schema version migration with entryId backfill
    - FsmRollbackResult, FsmMigrateResult, FsmAlreadyCurrentResult types
  affects:
    - Any caller that needs to restore FSM state to a prior checkpoint
    - Any caller that reads old-version FSM state files and needs to upgrade them
tech_stack:
  added:
    - node:crypto randomUUID (for rollback entry entryId generation and entryId backfill)
  patterns:
    - lock-acquire/read/produce-immutable-state/write/release (identical to advanceFsmState)
    - append-only history mutation (never delete or reorder transitionHistory entries)
    - raw JSON parse for migration path (bypasses parseFsmRunState version gate)
    - discriminated union result type (no throws for expected failure modes)
key_files:
  created:
    - sdk/src/advisory/fsm-rollback.ts
    - sdk/src/advisory/fsm-rollback.test.ts
  modified: []
decisions:
  - "rollbackFsmState returns RollbackBlockedEvent (not throws) when no checkpoint entry found in history — consistent with control-event discriminated union pattern"
  - "migrateFsmState reads raw JSON via readFile + JSON.parse directly; does NOT call parseFsmRunState which would throw on old schema versions (T-05-04-04)"
  - "Both functions use { heldLockPath: lockPath } on every writeFsmState call — prevents double-lock deadlock (T-05-04-02)"
  - "checkStateInitialized helper replicates assertFsmStateInitialized logic from fsm-state.ts — necessary since assertFsmStateInitialized is file-private"
  - "migrateFsmState returns FsmAlreadyCurrentResult { kind: 'already-current' } for v1 state and does not write the file — idempotent no-op"
  - "rolledBackEntryIds computed as all entry IDs after the checkpoint index (chronological entries after checkpoint are the rolled-back ones)"
metrics:
  duration: "7 min"
  completed: "2026-04-29T01:22:00Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 5 Plan 04: Append-only FSM Rollback and Schema Migration Summary

Implemented `rollbackFsmState()` and `migrateFsmState()` as a new `fsm-rollback.ts` module using the exact lock-acquire/read/produce-immutable-state/write/release pattern from `advanceFsmState()`; rollback is strictly append-only (MIGR-04) and migration preserves all history entries in order (MIGR-03).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED (T1) | Failing tests for rollbackFsmState and migrateFsmState (module not found) | 7e07db1c | fsm-rollback.test.ts |
| GREEN (T2) | Implement fsm-rollback.ts — 11/11 tests pass | a9212eaf | fsm-rollback.ts |

## Deliverables

### `sdk/src/advisory/fsm-rollback.ts` (new)

**Exports:**
- `FsmRollbackResult` — `{ rollbackToEntryId: string; rolledBackEntryIds: string[] }`
- `FsmMigrateResult` — `{ sourceVersion: number; targetVersion: number; entriesBackfilled: number }`
- `FsmAlreadyCurrentResult` — `{ kind: 'already-current' }`
- `rollbackFsmState(input)` — acquires lock, reverse-scans history for last `checkpoint: true` entry, appends rollback entry (never deletes), releases lock
- `migrateFsmState(input)` — acquires lock, reads raw JSON (not via parseFsmRunState), backfills entryId on all history entries lacking one, writes with stateSchemaVersion: 1

**Lock pattern:** Identical to `advanceFsmState` in `fsm-state.ts` — `let lockPath: string | null = null; try { lockPath = await acquireFsmLock(...); ... await writeFsmState(..., { heldLockPath: lockPath }); } finally { if (lockPath !== null) await releaseFsmLock(lockPath); }`

**checkStateInitialized helper:** Mirrors `assertFsmStateInitialized` from `fsm-state.ts` (which is file-private) — calls `stat(dirname(statePath))` and throws `FsmStateError('init-required', ...)` on ENOENT.

### `sdk/src/advisory/fsm-rollback.test.ts` (new, 11 tests)

**rollbackFsmState (6 tests):**
- Restores `currentState` to checkpoint's `toState` and appends rollback entry
- Returns `RollbackBlockedEvent` when no checkpoint entry exists
- Returns `RollbackBlockedEvent` when history is empty
- Appends rollback entry with correct `entryId` (new UUID); prior entries intact
- Uses last checkpoint when multiple checkpoint entries exist
- History only grows — never deletes entries

**migrateFsmState (5 tests):**
- Backfills `entryId` on v0 history entries; sets `stateSchemaVersion: 1`
- Returns `{ kind: 'already-current' }` for v1 state; file unchanged
- Returns `ResumeBlockedEvent` for `stateSchemaVersion > 1`
- Preserves all history entries in order during migration (MIGR-03)
- Migrates state with missing `stateSchemaVersion` field (detectedVersion -1)

## Verification Results

| Gate | Result |
|------|--------|
| RED phase (module not found — Cannot find module './fsm-rollback.js') | PASS |
| GREEN phase (11/11 fsm-rollback tests pass) | PASS |
| TypeScript compile (`tsc --noEmit`) | PASS — zero errors |
| `grep "heldLockPath" sdk/src/advisory/fsm-rollback.ts` — 2 matches | PASS |
| Phase 4 parity gate (`node scripts/phase4-parity.cjs`) | PASS — All Phase 4 parity gates PASSED |
| Full SDK suite regression | PASS — 2405 pass / 5 pre-existing failures (unchanged from Plan 03 baseline) |

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- RED: `7e07db1c` — test suite failed with `Cannot find module './fsm-rollback.js'` — VERIFIED before implementation
- GREEN: `a9212eaf` — 11/11 fsm-rollback tests pass

## Threat Model Coverage

All T-05-04-xx mitigations implemented:

| Threat ID | Mitigation | Location |
|-----------|-----------|---------|
| T-05-04-01 | rollbackFsmState uses `transitionHistory: [...state.transitionHistory, rollbackEntry]` — append only, no deletions | `fsm-rollback.ts` rollbackFsmState |
| T-05-04-02 | Lock acquired before read; writeFsmState called with `{ heldLockPath: lockPath }` both times; finally block always releases | `fsm-rollback.ts` both functions |
| T-05-04-03 | migrateFsmState maps history array preserving order; only backfills missing entryId; no sort or reorder | `fsm-rollback.ts` migrateFsmState |
| T-05-04-04 | migrateFsmState calls `JSON.parse(raw)` directly; parseFsmRunState is NOT called on old-version state | `fsm-rollback.ts` migrateFsmState |
| T-05-04-05 | `checkStateInitialized()` runs before `acquireFsmLock()`; missing `.planning/` directory throws `FsmStateError('init-required')` | `fsm-rollback.ts` checkStateInitialized |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries beyond those already in the threat model.

## Self-Check: PASSED

- `sdk/src/advisory/fsm-rollback.ts` created and exists: VERIFIED (`a9212eaf`)
- `sdk/src/advisory/fsm-rollback.test.ts` created and exists: VERIFIED (`7e07db1c`)
- RED commit `7e07db1c` exists: VERIFIED
- GREEN commit `a9212eaf` exists: VERIFIED
- `grep "heldLockPath" sdk/src/advisory/fsm-rollback.ts` returns 2 matches: VERIFIED
- `grep "heldLockPath" sdk/src/advisory/fsm-rollback.ts` — no writeFsmState call without it: VERIFIED
- 11/11 fsm-rollback tests GREEN: VERIFIED
- TypeScript zero errors: VERIFIED
- Phase 4 parity gate: VERIFIED PASS
- Full SDK suite: 5 pre-existing failures only (init-runner, decomposed-handlers, init-e2e, golden x2) — unchanged from Plan 03 baseline
