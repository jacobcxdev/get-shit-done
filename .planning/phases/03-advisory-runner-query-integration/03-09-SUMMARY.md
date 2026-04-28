---
phase: 03-advisory-runner-query-integration
plan: 03-09-runtime-contract-events
subsystem: advisory-runner
tags: [typescript, vitest, runtime-contracts, workflow-runner, agent-contracts]

requires:
  - phase: 03-advisory-runner-query-integration
    provides: 03-02 FSM transition events and typed query mutation event patterns
  - phase: 03-advisory-runner-query-integration
    provides: 03-04 WorkflowRunner deterministic packet dispatch core
  - phase: 03-advisory-runner-query-integration
    provides: 03-08 provider fallback dispatch metadata and runner confidence semantics
provides:
  - Typed `worktree_required`, `completion_marker_missing`, and `completion_marker_absent` runtime contract events
  - Runtime execution report schema for agent marker and artifact postconditions
  - Pre-emit and post-report validators driven by packet agents and AgentEntry metadata
  - WorkflowRunner pre-emit gate that blocks unsafe packet emission before runtime execution
affects: [phase-03-advisory-runner, phase-04-parity, workflow-runner, runtime-contracts, agent-contracts]

tech-stack:
  added: []
  patterns:
    - Runtime contract validation is pure SDK advisory logic with no runtime execution calls
    - AgentEntry metadata drives worktree, completion marker, and artifact obligations
    - WorkflowRunner dispatch fails closed with the first typed runtime contract event type

key-files:
  created:
    - sdk/src/advisory/runtime-contracts.ts
    - .planning/phases/03-advisory-runner-query-integration/03-09-SUMMARY.md
  modified:
    - sdk/src/types.ts
    - sdk/src/advisory/runtime-contracts.test.ts
    - sdk/src/advisory/workflow-runner.ts
    - sdk/src/advisory/workflow-runner.test.ts
    - sdk/src/advisory/packet.test.ts

key-decisions:
  - "Completion marker failures are split into pre-emit `completion_marker_missing` and post-success `completion_marker_absent` events."
  - "`worktree_required` blocks packet emission before runtime execution when an active worktree is missing."
  - "Missing runtime artifacts reuse `completion_marker_absent` with missing artifact names in `expectedMarkers` and `blocksTransition: true`."

patterns-established:
  - "Runtime report validation only checks successful reports; non-success outcomes do not emit postcondition absence events."
  - "WorkflowRunner packets now carry command classification `agentTypes` so packet-agent contract validation has concrete targets."

requirements-completed: [AGNT-03, AGNT-04, ERRT-02]

duration: 6min
completed: 2026-04-28T02:52:53Z
---

# Phase 3 Plan 03-09: Runtime Contract Events Summary

**Agent worktree and completion-marker obligations are now typed runtime contract events with pre-emit and post-report validation gates**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T02:46:50Z
- **Completed:** 2026-04-28T02:52:53Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added typed `GSDEventType` members and event interfaces for worktree-required, completion-marker-missing, and completion-marker-absent failures.
- Added `RuntimeExecutionReport`, `RuntimeWorktreeContext`, `validatePreEmitRuntimeContract()`, and `validateRuntimeReportContract()`.
- Integrated WorkflowRunner pre-emit validation so unsafe packets return a typed dispatch error before runtime execution can proceed.
- Tightened packet diagnostics coverage for missing `agents` so malformed packet issues retain `field`, `workflowId`, and `stepId`.

## Task Commits

1. **Task 1 RED: Confirm runtime contract tests fail** - `ca3f747` (test)
2. **Task 2 GREEN: Implement runtime contract validators and event types** - `e274696` (feat)
3. **Task 3 REFACTOR: Build and tighten packet validation diagnostics** - `ee898e3` (test)

## RED / GREEN / REFACTOR

- **RED:** Updated runtime contract and WorkflowRunner tests to assert workflow/step context, blocking flags, expected marker payloads, artifact absence handling, and pre-emit dispatch blocking. The focused suite failed on missing `runtime-contracts.ts`, missing event enum values, and absent runner integration.
- **GREEN:** Implemented event types, pure validators, command-agent packet population, and WorkflowRunner pre-emit blocking. Focused runtime/packet/runner tests passed.
- **REFACTOR:** Added the explicit missing-`agents` packet diagnostic regression and confirmed the SDK build passes.

## Files Created/Modified

- `sdk/src/advisory/runtime-contracts.ts` - Runtime report schema plus pre-emit and post-report contract validators.
- `sdk/src/types.ts` - Runtime contract event enum values, typed event interfaces, and `GSDEvent` union entries.
- `sdk/src/advisory/workflow-runner.ts` - Dispatch input accepts agent contracts/worktree context and blocks unsafe packets before emission.
- `sdk/src/advisory/runtime-contracts.test.ts` - Worktree, pre-emit marker, post-success marker, and artifact absence tests.
- `sdk/src/advisory/workflow-runner.test.ts` - Pre-emit runtime contract dispatch blocking test.
- `sdk/src/advisory/packet.test.ts` - Missing `agents` diagnostic context regression.

## Verification

- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/advisory/runtime-contracts.test.ts src/advisory/packet.test.ts src/advisory/workflow-runner.test.ts` - PASSED, 3 files / 43 tests.
- `npm --prefix sdk run build` - PASSED.
- Acceptance greps for event enum values, runtime validator exports, WorkflowRunner integration keys, and missing-`agents` diagnostic context - PASSED.

## Decisions Made

- Kept runtime contract validators pure and synchronous because they only compare packet/report/agent metadata.
- Used `sessionId: runId` on generated runtime contract events to preserve existing `GSDEventBase` requirements without adding a separate runtime session concept.
- Populated WorkflowRunner packet `agents` from command classification `agentTypes`; otherwise the AgentEntry-driven validator would have no packet-agent targets.

## Deviations from Plan

None - plan scope executed as written. The packet `agents` population was required for the planned pre-emit validation to observe worktree and completion-marker obligations.

## Issues Encountered

- The bare command `npm --prefix sdk exec -- vitest run --project unit src/advisory/runtime-contracts.test.ts src/advisory/packet.test.ts src/advisory/workflow-runner.test.ts` still fails before test collection because the root `vitest.config.ts` cannot resolve `vitest/config` without `NODE_PATH`. This matches prior Phase 3 summaries; the established `NODE_PATH=$PWD/sdk/node_modules` invocation passes.
- `gsd-sdk query init.execute-phase` is unavailable in this checkout's current CLI command surface, so workflow metadata updates use the documented file-system fallback path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 3 runtime contract obligations are in place for Phase 4 parity: unsafe worktree packet emission is observable before execution, and missing marker/artifact postconditions block successful runtime reports from advancing.

## Self-Check: PASSED

- Confirmed task commits exist: `ca3f747`, `e274696`, `ee898e3`.
- Confirmed focused runtime contract, packet, and WorkflowRunner tests pass with the established environment workaround.
- Confirmed `npm --prefix sdk run build` passes.
- Confirmed `.planning/phases/03-advisory-runner-query-integration/03-09-SUMMARY.md` exists.

---
*Phase: 03-advisory-runner-query-integration*
*Completed: 2026-04-28*
