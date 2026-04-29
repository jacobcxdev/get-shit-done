---
phase: 05-extension-api-migration-hardening
plan: "03"
subsystem: sdk/advisory
tags:
  - fsm-state
  - migration-hardening
  - history-entry
  - tdd
  - typescript
dependency_graph:
  requires:
    - sdk/src/advisory/control-events.ts (Plan 02)
    - sdk/src/advisory/fsm-state.ts (existing)
  provides:
    - FsmTransitionHistoryEntry with entryId + checkpoint + extensionIds + rollbackEntry
    - parseFsmRunStateOrControlEvent wrapper
    - entryId generation in advanceFsmState
  affects:
    - sdk/src/advisory/fsm-rollback.ts (Plan 04 — depends on entryId + checkpoint fields)
    - Any caller constructing FsmTransitionHistoryEntry literals (none found beyond advanceFsmState)
tech_stack:
  added:
    - node:crypto randomUUID (for UUID generation in advanceFsmState)
  patterns:
    - wrapper-over-base-function pattern (parseFsmRunStateOrControlEvent wraps parseFsmRunState without modifying it)
    - discriminated union control event early-return pattern
    - immutable spread for history entry construction in advanceFsmState
key_files:
  created: []
  modified:
    - sdk/src/advisory/fsm-state.ts
    - sdk/src/advisory/control-events.test.ts
    - sdk/src/advisory/fsm-state.test.ts
decisions:
  - "parseFsmRunStateOrControlEvent is a wrapper over parseFsmRunState — the base function signature is unchanged so existing callers in query/fsm-state.ts require no change"
  - "entryId is generated internally in advanceFsmState via randomUUID(); FsmTransitionInput does not accept entryId (T-05-03-01 threat mitigation)"
  - "detectedVersion defaults to -1 when stateSchemaVersion field is absent or non-numeric, triggering migration-required path"
  - "checkpoint is omitted from history entry when FsmTransitionInput.checkpoint is falsy — no automatic checkpoint policy beyond explicit caller opt-in"
  - "migrationSteps description includes both detectedVersion and targetVersion numbers for human-readable upgrade path"
metrics:
  duration: "8 min"
  completed: "2026-04-29T00:15:00Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 3
---

# Phase 5 Plan 03: FSM History Hardening + parseFsmRunStateOrControlEvent Summary

FsmTransitionHistoryEntry extended with stable entryId (required), checkpoint, extensionIds, and rollbackEntry fields; parseFsmRunStateOrControlEvent wrapper added that surfaces schema-version mismatches as typed MigrationRequiredEvent or ResumeBlockedEvent instead of thrown exceptions.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED (T1) | Failing tests for entryId/checkpoint fields on FsmTransitionHistoryEntry | db529043 | fsm-state.test.ts |
| GREEN (T1) | Extend FsmTransitionHistoryEntry, add entryId generation in advanceFsmState | db529043 | fsm-state.ts, fsm-state.test.ts |
| RED (T2) | Failing tests for parseFsmRunStateOrControlEvent (import error — not yet exported) | be16ae24 | control-events.test.ts |
| GREEN (T2) | Implement parseFsmRunStateOrControlEvent wrapper; 6 new tests GREEN | be16ae24 | fsm-state.ts, control-events.test.ts |

## Deliverables

### `sdk/src/advisory/fsm-state.ts` (modified)

**FsmTransitionHistoryEntry changes:**
- `entryId: string` — new required first field; stable UUID per entry
- `checkpoint?: boolean` — new optional; true for checkpoint-eligible transitions
- `extensionIds?: string[]` — new optional; extensions that affected this transition
- `rollbackEntry?: { rollbackToEntryId: string; rolledBackEntryIds: string[] }` — new optional; only on rollback entries
- All existing optional provider confidence fields unchanged and in same position

**FsmTransitionInput changes:**
- `checkpoint?: boolean` — new optional; when true, propagated to history entry

**advanceFsmState() changes:**
- Imports `randomUUID` from `node:crypto`
- History entry construction adds `entryId: randomUUID()` as first field
- Propagates `checkpoint: true` from input when explicitly set; omits otherwise

**parseFsmRunStateOrControlEvent (new export):**
- Signature: `(raw: string, statePath: string): FsmRunState | AdvisoryControlEvent`
- `detectedVersion < 1` → returns `MigrationRequiredEvent` with description string
- `detectedVersion > 1` → returns `ResumeBlockedEvent`
- `detectedVersion === 1` → delegates to `parseFsmRunState(raw)` (unchanged)
- Malformed JSON → throws `FsmStateError('read-failed', ...)`
- Imports `AdvisoryControlEvent` as type-only (no runtime circular dependency)

**parseFsmRunState() — unchanged.** Existing callers in `query/fsm-state.ts` compile with zero errors.

### `sdk/src/advisory/control-events.test.ts` (modified)

6 new tests in `describe('parseFsmRunStateOrControlEvent')`:
- version 0 JSON → `MigrationRequiredEvent` with `event='migration-required'`
- missing stateSchemaVersion field (detectedVersion -1) → `MigrationRequiredEvent`
- version 2 JSON → `ResumeBlockedEvent` with `event='resume-blocked'`
- version 1 valid JSON → valid `FsmRunState` (MIGR-05 round-trip, no control event)
- malformed JSON → throws `FsmStateError` with `code='read-failed'`
- migrationSteps description includes detected version number and target version

### `sdk/src/advisory/fsm-state.test.ts` (modified)

4 new tests in `describe('FsmTransitionHistoryEntry entryId and checkpoint fields')`:
- `entryId` is a non-empty UUID-format string on every history entry
- `entryId` is unique across multiple transitions
- `checkpoint: true` propagated when input has `checkpoint: true`
- `checkpoint` is `undefined` when input omits it

## Verification Results

| Gate | Result |
|------|--------|
| RED phase T1 (3 tests fail — entryId/checkpoint undefined) | PASS |
| GREEN phase T1 (12/12 fsm-state tests pass) | PASS |
| TypeScript compile (`tsc --noEmit`) after T1 | PASS — zero errors |
| RED phase T2 (import error — parseFsmRunStateOrControlEvent not exported) | PASS |
| GREEN phase T2 (27/27 control-events tests pass) | PASS |
| TypeScript compile (`tsc --noEmit`) after T2 | PASS — zero errors |
| All advisory tests (157/157) | PASS |
| phase4-parity gate (`node scripts/phase4-parity.cjs`) | PASS — All Phase 4 parity gates PASSED |
| Full SDK suite regression | PASS — 2388 pass / 5 pre-existing failures (unchanged from Plan 02 baseline) |

## Deviations from Plan

None — plan executed exactly as written.

**Note:** Task 1 and Task 2 RED/GREEN are combined into single commits per task (RED tests were added to the same commit as GREEN implementation after the RED run was verified to fail). This matches the single-file nature of the changes — the RED commit hash is the same as GREEN for each task since the test file and implementation file are committed together after the GREEN phase.

## TDD Gate Compliance

- Task 1 RED: 3 tests failed (entryId undefined, unique check, checkpoint undefined) — VERIFIED before implementation
- Task 1 GREEN: `db529043` — 12/12 fsm-state tests pass
- Task 2 RED: 6 tests failed (parseFsmRunStateOrControlEvent not found in module) — VERIFIED before implementation
- Task 2 GREEN: `be16ae24` — 27/27 control-events tests pass

## Threat Model Coverage

All T-05-03-xx mitigations implemented:

| Threat ID | Mitigation | Location |
|-----------|-----------|---------|
| T-05-03-01 | entryId generated by `randomUUID()` inside `advanceFsmState()`; `FsmTransitionInput` has no `entryId` field | `fsm-state.ts` advanceFsmState |
| T-05-03-02 | Version check runs before `parseFsmRunState()` is called; mismatched version always returns typed control event, never partial `FsmRunState` | `parseFsmRunStateOrControlEvent` |
| T-05-03-03 | `migrationSteps` type is `Array<{ description: string }>` — no callable fields; TypeScript enforces at construction | `control-events.ts` MigrationRequiredEvent type |
| T-05-03-04 | `parseFsmRunStateOrControlEvent` wraps `JSON.parse` in try/catch; throws `FsmStateError('read-failed')` rather than unhandled exception | `parseFsmRunStateOrControlEvent` |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those already in the threat model.

## Self-Check: PASSED

- `sdk/src/advisory/fsm-state.ts` modified and exists: VERIFIED
- `sdk/src/advisory/control-events.test.ts` modified and exists: VERIFIED
- `sdk/src/advisory/fsm-state.test.ts` modified and exists: VERIFIED
- Task 1 commit `db529043` exists: VERIFIED (`git log --oneline -5`)
- Task 2 commit `be16ae24` exists: VERIFIED (`git log --oneline -5`)
- `grep "entryId" sdk/src/advisory/fsm-state.ts` returns 2+ matches: VERIFIED
- `grep "parseFsmRunStateOrControlEvent" sdk/src/advisory/fsm-state.ts` returns 1 match (line 229): VERIFIED
- `grep "export function parseFsmRunState" sdk/src/advisory/fsm-state.ts` returns 2 matches (parseFsmRunState + parseFsmRunStateOrControlEvent): VERIFIED
- 27/27 control-events tests GREEN: VERIFIED
- 12/12 fsm-state tests GREEN: VERIFIED
- 157/157 advisory suite GREEN: VERIFIED
- TypeScript zero errors: VERIFIED
- phase4-parity gate: VERIFIED PASS
