---
phase: 04-parity-suite-gsd-post-update-retirement
plan: 04-06
subsystem: testing
tags: [parity, workflow-runner, hitl, fsm-lock, vitest]

requires:
  - phase: 04-05-generated-parity-fixtures
    provides: committed parity workflow index with branchIds and suspensionPoints
provides:
  - Shared typed parity mock factories
  - Deterministic, dynamic-branch, hard-outlier, HITL, and FSM lock parity tests
  - WorkflowRunner HITL suspension input seam for deterministic runner tests
affects: [phase-04, parity-suite, workflow-runner, fsm-state]

tech-stack:
  added: []
  patterns:
    - Generated parity index drives full-loop parity tests
    - WorkflowRunner accepts injectable HITL suspension input provider
    - Real FSM lock tests use temp .planning directories

key-files:
  created:
    - sdk/src/parity/mock-factories.ts
    - sdk/src/parity/deterministic-workflows.test.ts
    - sdk/src/parity/dynamic-branch-workflows.test.ts
    - sdk/src/parity/hard-outlier-posture.test.ts
    - sdk/src/parity/hitl-workflows.test.ts
    - sdk/src/parity/state-lock.test.ts
  modified:
    - sdk/src/advisory/workflow-runner.ts

key-decisions:
  - "Define SuspensionInputProvider in WorkflowRunner and re-export it from parity factories to keep production code independent of test-only helpers."
  - "Limit deterministic packet round-trip tests to dispatchable deterministic index entries because the 04-05 index includes command-only/composite records that do not emit packets."
  - "Treat canonical hard outliers as entries with category hard-outlier because the 04-05 index also contains dynamic-branch records in the hard-outlier parity tier."

patterns-established:
  - "Parity tests load the committed generated parity index as the source of truth for workflow coverage."
  - "HITL parity is tested by driving createGeneratedWorkflowRunner with an injected SuspensionInputProvider, not by testing the seam in isolation."
  - "STATE.md lock protection is tested through both mock seam behavior and the real acquireFsmLock/releaseFsmLock path."

requirements-completed:
  - PRTY-01
  - PRTY-02
  - PRTY-03
  - PRTY-04
  - PRTY-05
  - PRTY-07
  - PRTY-08
  - UPDT-02

duration: 7 min
completed: 2026-04-28
---

# Phase 4 Plan 04-06: Wave 2 Parity Suite Core Summary

**Offline parity coverage for generated workflow tiers with typed HITL injection and real FSM lock-conflict protection**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-28T21:33:05Z
- **Completed:** 2026-04-28T21:40:06Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added shared typed parity factories for advisory packets, agent contracts, provider availability, HITL suspension input, and lock behavior.
- Added parity tests for deterministic packet fields, all generated dynamic branches and invalid branch cases, exact canonical hard-outlier posture records, HITL suspend/resume outcomes, and real FSM lock conflicts.
- Extended WorkflowRunner with an optional SuspensionInputProvider dependency so HITL parity tests exercise runner dispatch paths deterministically.

## Task Commits

Each task was committed atomically:

1. **Task 1: Parity mock factories and HITL seam** - `ac54ee0c` (test)
2. **Task 2: Deterministic, dynamic-branch, and hard-outlier parity tests** - `d3553e95` (test)
3. **Task 3: HITL runner dispatch and STATE.md lock-conflict tests** - `625c30a4` (test)

## Files Created/Modified

- `sdk/src/parity/mock-factories.ts` - Shared typed factories for parity tests.
- `sdk/src/advisory/workflow-runner.ts` - Adds optional SuspensionInputProvider dependency and HITL posture handling.
- `sdk/src/parity/deterministic-workflows.test.ts` - Covers dispatchable deterministic parity index entries and required packet fields.
- `sdk/src/parity/dynamic-branch-workflows.test.ts` - Covers every generated dynamic branch and invalid/empty/absent branch cases.
- `sdk/src/parity/hard-outlier-posture.test.ts` - Asserts exact hard-outlier posture records for the canonical five outliers.
- `sdk/src/parity/hitl-workflows.test.ts` - Drives generated HITL workflows through runner dispatch for suspend, resume-success, and resume-failure paths.
- `sdk/src/parity/state-lock.test.ts` - Covers mock lock behavior and real FSM lock-conflict handling.

## Decisions Made

- Defined `SuspensionInputProvider` in `workflow-runner.ts` and re-exported the type from parity factories. This avoids a production import from `sdk/src/parity/`.
- Deterministic packet tests use dispatchable deterministic index entries only. The committed 04-05 index includes `/gsd-add-backlog` with no workflowId and `/gsd-audit-fix` as a composite-review runner posture, so those entries cannot satisfy packet round-trip assertions without changing 04-05 fixtures.
- Hard-outlier posture count uses `category === 'hard-outlier'` in addition to `parityTier === 'hard-outlier'` because the 04-05 index includes two dynamic-branch records in that parity tier.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Constrained parity assertions around inconsistent 04-05 fixture taxonomy**
- **Found during:** Task 2 (core parity workflow tests)
- **Issue:** The generated parity index from 04-05 marks non-packet-dispatchable records inside packet/posture groups: `/gsd-add-backlog` has no workflowId, `/gsd-audit-fix` is classified by WorkflowRunner as `composite-review`, and two dynamic-branch commands appear in the `hard-outlier` parity tier.
- **Fix:** Kept tests driven by the committed index but constrained deterministic packet round trips to dispatchable non-composite workflow entries and canonical hard-outlier count assertions to entries whose category is `hard-outlier`.
- **Files modified:** `sdk/src/parity/deterministic-workflows.test.ts`, `sdk/src/parity/hard-outlier-posture.test.ts`
- **Verification:** `cd sdk && npx vitest run src/parity/` passed with 537 tests.
- **Committed in:** `d3553e95`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The parity suite is executable and tied to the 04-05 generated index. The fixture taxonomy mismatch is isolated in test filters and should be revisited if a later phase normalizes the generated parity index.

## Issues Encountered

- The local `gsd-sdk query state.load` path is unavailable in this checkout's CLI build; execution continued using the already-read `.planning/STATE.md` and plan files.
- Existing unrelated working-tree changes were present before execution and were not staged or modified as part of task commits.

## User Setup Required

None - no external service configuration required.

## Verification

- `cd sdk && npx tsc --noEmit` - passed.
- `cd sdk && npx vitest run src/parity/` - passed, 5 files / 537 tests.
- `grep -rn 'test\.skip\|test\.todo\|it\.skip\|it\.todo' sdk/src/parity/` - returned 0 matches.

## Next Phase Readiness

Plan 04-06 is complete and ready for 04-07 gate-script work. The parity suite now has executable coverage for generated branch IDs, HITL suspension paths, hard-outlier posture, and real FSM lock conflicts.

## Self-Check: PASSED

- Created files exist on disk.
- Task commits exist: `ac54ee0c`, `d3553e95`, `625c30a4`.
- Plan-level verification passed.

---
*Phase: 04-parity-suite-gsd-post-update-retirement*
*Completed: 2026-04-28*
