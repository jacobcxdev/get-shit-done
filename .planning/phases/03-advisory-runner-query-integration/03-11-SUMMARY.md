---
phase: 03-advisory-runner-query-integration
plan: 03-11-state-runtime-contract-hardening
subsystem: sdk-query-state
tags: [typescript, vitest, fsm, runtime-contracts, query-registry]

requires:
  - phase: 03-advisory-runner-query-integration
    provides: 03-02 FSM transition events and lock-protected writes
  - phase: 03-advisory-runner-query-integration
    provides: 03-03 phase.edit and thread query aliases
  - phase: 03-advisory-runner-query-integration
    provides: 03-09 runtime contract event validators
provides:
  - Schema-version-checked FSM reads for fsm.*, phase.edit, and thread.* query handlers
  - Immutable FSM update objects for advanceFsmState, fsm.auto-mode.set, and phase.edit writes
  - Runtime contract events with UI-SPEC code, message, recoveryHint, markerId, and artifactPaths fields
  - Stale-lock inspection errors that preserve their root cause instead of being swallowed
affects: [phase-03-advisory-runner, phase-04-parity, query-registry, runtime-contracts, fsm-state]

tech-stack:
  added: []
  patterns:
    - Query-layer FSM file reads use the shared parseFsmRunState schema guard
    - FSM write paths construct const updatedState objects before atomic writeFsmState calls
    - CompletionMarkerAbsent distinguishes marker failures from artifact failures through markerId and artifactPaths

key-files:
  created:
    - .planning/phases/03-advisory-runner-query-integration/03-11-SUMMARY.md
  modified:
    - sdk/src/advisory/fsm-state.ts
    - sdk/src/advisory/runtime-contracts.ts
    - sdk/src/advisory/runtime-contracts.test.ts
    - sdk/src/query/fsm-state.ts
    - sdk/src/query/fsm-state.test.ts
    - sdk/src/query/registry.test.ts
    - sdk/src/query/thread.ts
    - sdk/src/types.ts

key-decisions:
  - "FSM query reads reject unsupported stateSchemaVersion through parseFsmRunState before returning data or writing phase edits."
  - "CompletionMarkerAbsent remains the blocking post-runtime event type, but marker failures use markerId/expectedMarkers while artifact failures use artifactPaths and an empty expectedMarkers array."
  - "Stale-lock inspection failures are rethrown directly so callers see the original lock-stale or read-failed cause."

patterns-established:
  - "State writes use immutable updatedState objects with nested spreads for resume and autoMode updates."
  - "Runtime contract events carry lower-case SDK type values plus UPPER_SNAKE_CASE UI codes."

requirements-completed: [AGNT-03, AGNT-04, ERRT-01, ERRT-02, ERRT-03, ERRT-04, LOGG-01, LOGG-02, PROV-01, PROV-02, PROV-04, QREG-01, QREG-03, QREG-04, QREG-05, QREG-06]

duration: 8min
completed: 2026-04-28T15:39:00Z
---

# Phase 3 Plan 03-11: State Runtime Contract Hardening Summary

**FSM query reads now fail closed on schema drift, write paths update immutable state objects, and runtime contract events expose stable UI error payload fields**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-28T15:30:49Z
- **Completed:** 2026-04-28T15:39:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added RED coverage for unsupported FSM schema versions across `fsm.state`, `fsm.history`, `fsm.confidence`, `phase.edit`, and `thread.*`.
- Added regression coverage proving `phase.edit` does not dirty the parsed state object before a failed write.
- Added typed runtime event assertions for `WORKTREE_REQUIRED`, `COMPLETION_MARKER_MISSING`, and `COMPLETION_MARKER_ABSENT`.
- Implemented shared FSM schema parsing in query reads, immutable update objects for FSM writes, stale-lock rethrowing, and distinct marker/artifact absence payloads.
- Confirmed the targeted runtime/query/billing guardrails and TypeScript build remain green.

## Task Commits

Each task was handled atomically:

1. **Task 1 RED: Add guardrail regression tests** - `cbe120ee` (test)
2. **Task 2 GREEN: Implement state/runtime hardening** - `d94a1e38` (feat)
3. **Task 3 REFACTOR: Run guardrail build checks** - verification-only; no source diff after checks passed

**Plan metadata:** recorded in the final docs commit for this summary/state update.

## RED / GREEN / REFACTOR

- **RED:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/fsm-state.test.ts src/query/registry.test.ts src/advisory/runtime-contracts.test.ts` failed as expected: 7 failures covering missing query schema guards, in-place `phase.edit` mutation, missing runtime event fields, and artifact paths being reported as expected markers.
- **GREEN:** The same focused suite passed after implementation: 3 files / 56 tests.
- **REFACTOR:** Guardrail suite with `src/compile/billing-boundary.test.ts` passed, forbidden model/session import scan returned no matches, and `npm --prefix sdk run build` passed.

## Files Created/Modified

- `sdk/src/advisory/fsm-state.ts` - Added `parseFsmRunState`, immutable transition writes, and direct stale-lock error rethrow.
- `sdk/src/query/fsm-state.ts` - Reused schema guard for FSM reads and built immutable auto-mode/phase-edit state updates.
- `sdk/src/query/thread.ts` - Reused schema guard for thread metadata reads without subprocess fallback.
- `sdk/src/advisory/runtime-contracts.ts` - Added UI-SPEC codes, messages, recovery hints, marker IDs, and artifact path payloads.
- `sdk/src/types.ts` - Extended runtime contract event interfaces with typed payload fields.
- `sdk/src/query/fsm-state.test.ts` - Added schema mismatch and phase-edit immutability regressions.
- `sdk/src/query/registry.test.ts` - Added thread schema mismatch and subprocess-ban coverage.
- `sdk/src/advisory/runtime-contracts.test.ts` - Added typed runtime event field and artifact-path assertions.

## Verification

- `npm --prefix sdk exec -- vitest run --project unit src/query/fsm-state.test.ts src/query/registry.test.ts src/advisory/runtime-contracts.test.ts` - expected checkout startup failure: root `vitest.config.ts` cannot resolve `vitest/config` without `NODE_PATH`.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/fsm-state.test.ts src/query/registry.test.ts src/advisory/runtime-contracts.test.ts` - PASSED, 3 files / 56 tests.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/fsm-state.test.ts src/query/registry.test.ts src/advisory/runtime-contracts.test.ts src/compile/billing-boundary.test.ts` - PASSED, 4 files / 67 tests.
- `npm --prefix sdk run build` - PASSED.
- Acceptance greps for schema guards, immutable `updatedState`, runtime codes, artifact fields, stale-lock rethrow, and forbidden imports - PASSED.

## Decisions Made

- Used a shared parser instead of duplicating schema-version parsing across query files.
- Kept artifact absence on `CompletionMarkerAbsent` to preserve blocking semantics while separating artifact paths from completion marker IDs.
- Preserved the existing `NODE_PATH=$PWD/sdk/node_modules` test workaround rather than changing repo dependency layout in this plan.

## Deviations from Plan

None - plan scope executed as written.

## Issues Encountered

- The bare Vitest command specified in the plan fails before test collection in this checkout because root `vitest.config.ts` cannot resolve `vitest/config`. This matches prior Phase 3 summaries; all focused suites pass with the established `NODE_PATH=$PWD/sdk/node_modules` invocation.
- The working tree contained unrelated pre-existing modified and untracked files before this plan. Task commits staged only 03-11 files.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Stub scan only matched legitimate empty arrays/objects in test fixtures and local accumulator variables.

## Next Phase Readiness

Ready for 03-12 gap-closure work. Query handlers now reject schema drift before reads/writes, and Phase 4 parity can distinguish missing markers from missing artifacts through typed runtime event payloads.

## TDD Gate Compliance

PASS. RED commit `cbe120ee` precedes GREEN commit `d94a1e38`; Task 3 guardrails passed without additional source changes.

## Self-Check: PASSED

- Confirmed `.planning/phases/03-advisory-runner-query-integration/03-11-SUMMARY.md` exists.
- Confirmed task commits exist: `cbe120ee`, `d94a1e38`.
- Confirmed focused query/runtime tests, billing-boundary guardrail test, forbidden-import scan, and SDK build pass.
- Confirmed STATE.md and ROADMAP.md now point to 03-12 as the next Phase 3 gap-closure plan.

---
*Phase: 03-advisory-runner-query-integration*
*Completed: 2026-04-28*
