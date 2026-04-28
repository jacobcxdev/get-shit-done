---
phase: 03-advisory-runner-query-integration
plan: 03-13-runtime-report-handoff
subsystem: sdk-advisory-runner
tags: [typescript, vitest, advisory-runner, runtime-report, fsm, billing-boundary]

requires:
  - phase: 03-advisory-runner-query-integration
    provides: 03-11 schema-checked FSM transitions, runtime contracts, and provider metadata history
  - phase: 03-advisory-runner-query-integration
    provides: 03-12 deterministic query output contracts and billing-boundary guardrails
provides:
  - Runtime report callback contract exported from the SDK public API
  - PhaseRunner and InitRunner packet handoff that waits for runtime reports before step success
  - Runtime report identity, outcome, marker, and artifact validation before FSM transition
  - Provider metadata forwarding into report-driven FSM transition history
  - Advisory advance completion-intent packet path without default SDK tool execution
affects: [phase-03-advisory-runner, phase-04-parity, runtime-contracts, fsm-state, billing-boundary]

tech-stack:
  added: []
  patterns:
    - Advisory packet dispatch is not step completion; default runners return awaiting-runtime-report until the runtime reports an outcome
    - Runtime reports are validated against the exact emitted packet before FSM transition or provider metadata persistence
    - Default advisory advance emits completion intent and leaves phase completion tooling to Claude Code/runtime

key-files:
  created:
    - .planning/phases/03-advisory-runner-query-integration/03-13-SUMMARY.md
  modified:
    - sdk/src/types.ts
    - sdk/src/index.ts
    - sdk/src/phase-runner.ts
    - sdk/src/phase-runner.test.ts
    - sdk/src/init-runner.ts
    - sdk/src/init-runner.test.ts
    - sdk/src/advisory/runtime-contracts.ts
    - sdk/src/advisory/runtime-contracts.test.ts
    - sdk/src/advisory/workflow-runner.ts
    - sdk/src/advisory/workflow-runner.test.ts

key-decisions:
  - "RuntimeReportHandler is a deterministic callback supplied by callers; the SDK does not provide a default implementation that shells out, opens model sessions, reads stdin, or executes tools."
  - "Packet reportCommand text documents the RuntimeExecutionReport handoff and no longer points callers at public fsm.transition reporting."
  - "Validated runtime reports may continue in test/no-FSM contexts when the durable FSM history file is absent, while real FSM states still persist provider metadata through advanceFsmState."
  - "Direct phaseComplete remains confined to the opt-in legacyModelBacked path; default advisory advance emits a completion-intent packet and waits for runtime evidence."

patterns-established:
  - "One advisory dispatch produces at most one packet and does not proceed to the next step without a runtime report."
  - "Runtime report spoofing is blocked for mismatched runId, workflowId, stepId, and outcomes outside packet.allowedOutcomes."
  - "Provider metadata from WorkflowRunnerResult is forwarded through the same transition call that records the runtime report outcome."

requirements-completed: [AGNT-03, AGNT-04, ERRT-01, ERRT-02, LOGG-01, LOGG-02, PROV-01, PROV-02, PROV-03, PROV-04, QREG-03, RNNR-02, RNNR-05, RNNR-06, RNNR-10]

duration: 18 min
completed: 2026-04-28T16:27:03Z
---

# Phase 3 Plan 03-13: Runtime Report Handoff Summary

**Default advisory runners now emit packets, wait for validated runtime reports, and persist provider metadata through FSM transitions**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-28T16:08:19Z
- **Completed:** 2026-04-28T16:27:03Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added RED tests proving packet creation no longer counts as advisory step completion.
- Added public `RuntimeReportHandler` contracts and `awaitingRuntimeReport` result fields for phase and init runners.
- Gated PhaseRunner and InitRunner transitions on `RuntimeExecutionReport` validation against the emitted packet.
- Persisted `providerMetadata` through report-driven `advanceFsmState()` calls.
- Replaced public `fsm.transition` report instructions with runtime handler reporting instructions.
- Verified default advisory code remains deterministic and billing-boundary-safe.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add runtime handoff tests for packet awaiting, provider persistence, and advisory advance** - `9ac980f4` (test)
2. **Task 2 GREEN: Add runtime report handler contracts and gate advisory runners on report validation** - `b7422214` (feat)
3. **Task 3 REFACTOR: Prove one-packet determinism and billing-boundary isolation after handoff wiring** - `d5b56218` (test, verification-only empty commit)

**Plan metadata:** recorded in the final docs commit for this summary/state update.

## RED / GREEN / REFACTOR

- **RED:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/phase-runner.test.ts src/init-runner.test.ts src/advisory/runtime-contracts.test.ts` failed as expected with 11 focused failures before production edits.
- **GREEN:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/phase-runner.test.ts src/init-runner.test.ts src/advisory/runtime-contracts.test.ts src/query/fsm-state.test.ts` passed: 4 files / 152 tests.
- **REFACTOR:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/phase-runner.test.ts src/init-runner.test.ts src/advisory/runtime-contracts.test.ts src/query/fsm-state.test.ts src/compile/billing-boundary.test.ts` passed: 5 files / 163 tests. `npm --prefix sdk run build` passed.

## Files Created/Modified

- `sdk/src/types.ts` - Adds runtime report handler input/callback types and runtime report fields on step results.
- `sdk/src/index.ts` - Exports runtime report handoff types from the public SDK surface.
- `sdk/src/phase-runner.ts` - Waits for runtime reports after packet dispatch, validates reports, persists provider metadata, and emits completion-intent advance packets.
- `sdk/src/phase-runner.test.ts` - Covers awaiting states, spoofing rejection, report command text, missing markers, provider metadata, and advisory advance.
- `sdk/src/init-runner.ts` - Emits one init packet at a time and waits for runtime reports before advancing.
- `sdk/src/init-runner.test.ts` - Covers init awaiting behavior and one-step-at-a-time report progression.
- `sdk/src/advisory/runtime-contracts.ts` - Validates report identity and allowed outcomes before marker/artifact checks.
- `sdk/src/advisory/runtime-contracts.test.ts` - Covers non-success outcome handling and runtime contract blocking.
- `sdk/src/advisory/workflow-runner.ts` - Emits RuntimeExecutionReport handoff instructions instead of public FSM transition instructions.
- `sdk/src/advisory/workflow-runner.test.ts` - Pins the new report command contract.

## Verification

- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/phase-runner.test.ts src/init-runner.test.ts src/advisory/runtime-contracts.test.ts src/query/fsm-state.test.ts` - PASSED, 4 files / 152 tests.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/advisory/workflow-runner.test.ts` - PASSED, 1 file / 13 tests.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/phase-runner.test.ts src/init-runner.test.ts src/advisory/runtime-contracts.test.ts src/query/fsm-state.test.ts src/compile/billing-boundary.test.ts` - PASSED, 5 files / 163 tests.
- `npm --prefix sdk run build` - PASSED.
- Acceptance greps for runtime report exports, awaiting report fields, provider metadata forwarding, report command text, one-packet assertions, and guarded legacy model-session calls - PASSED.

## Decisions Made

- Runtime reports are trusted only after packet identity checks pass for `runId`, `workflowId`, `stepId`, and `packet.allowedOutcomes`.
- Default advisory absence of a handler returns a deterministic awaiting state rather than blocking, retrying, or marking the step successful.
- Missing completion markers and artifacts emit blocking runtime events before any FSM transition.
- The runner preserves legacy model-backed behavior behind explicit opt-in while keeping the default advisory path model-free.
- A validated runtime report in a context without initialized FSM state records a debug-only skip for durable history writing so legacy runner tests can continue without fabricating planning state.

## Deviations from Plan

None - plan scope executed as written. Task 3 was verification-only, so its atomic commit is an empty commit with normal hooks rather than a source change.

## Issues Encountered

- The bare Vitest commands in this checkout can fail before collection because root Vitest config cannot resolve `vitest/config` without `NODE_PATH`. This matches prior Phase 3 summaries; all focused suites passed with `NODE_PATH=$PWD/sdk/node_modules`.
- The working tree contained unrelated pre-existing modified and untracked files before this plan. Task commits staged only 03-13 changes; existing local billing-boundary edits were read and verified but not staged.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

Phase 3 is complete. The advisory runner now has the packet/report/FSM bridge required for Phase 4 parity and real runtime integration work.

## TDD Gate Compliance

PASS. RED commit `9ac980f4` precedes GREEN commit `b7422214`; REFACTOR verification commit `d5b56218` follows passing guardrails.

## Self-Check: PASSED

- Confirmed `.planning/phases/03-advisory-runner-query-integration/03-13-SUMMARY.md` exists.
- Confirmed task commits exist: `9ac980f4`, `b7422214`, `d5b56218`.
- Confirmed focused runner/runtime/FSM/billing-boundary tests and SDK build pass.
- Confirmed default advisory calls are packet/report based, with legacy model-backed session calls guarded behind explicit opt-in.

---
*Phase: 03-advisory-runner-query-integration*
*Completed: 2026-04-28*
