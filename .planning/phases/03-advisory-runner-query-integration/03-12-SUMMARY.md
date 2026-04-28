---
phase: 03-advisory-runner-query-integration
plan: 03-12-cli-output-contract
subsystem: sdk-cli-query
tags: [typescript, vitest, cli, query-registry, fsm, compile]

requires:
  - phase: 03-advisory-runner-query-integration
    provides: 03-11 schema-checked FSM reads and typed runtime event payloads
  - phase: 03-advisory-runner-query-integration
    provides: 03-UI-SPEC terminal output contract
provides:
  - Pure deterministic query output formatter for Phase 3 UI-SPEC stdout/stderr shapes
  - Native CLI query routing through scalar, JSON, OK, WARN, and ERROR format families
  - Exact compile success count block including hard outlier counts
  - Operator documentation for Phase 3 query output shapes
affects: [phase-03-advisory-runner, phase-04-parity, query-registry, cli-output, compile-output]

tech-stack:
  added: []
  patterns:
    - Query terminal output is formatted by a pure command-family formatter before CLI writes stdout or stderr
    - UI-contracted query commands use typed JSON envelopes and stderr status lines instead of generic JSON serialization
    - Compile report generation stays side-effect-free; CLI code owns human-readable count output

key-files:
  created:
    - sdk/src/query/output.ts
    - sdk/src/query/cli-output.test.ts
    - .planning/phases/03-advisory-runner-query-integration/03-12-SUMMARY.md
  modified:
    - sdk/src/cli.ts
    - sdk/src/compile/cli.ts
    - sdk/src/compile/cli.test.ts
    - sdk/src/compile/compiler.ts
    - sdk/src/compile/compiler.test.ts
    - sdk/src/query/QUERY-HANDLERS.md
    - sdk/src/query/fsm-state.ts
    - sdk/src/query/fsm-state.test.ts
    - sdk/src/query/thread.ts

key-decisions:
  - "Phase 3 query terminal output is centralized in pure formatQueryOutput() instead of per-handler console writes or generic JSON.stringify."
  - "The native query CLI path no longer shells out through the legacy CJS fallback for UI-contracted command handling, keeping Phase 3 output deterministic and subprocess-free."
  - "Compile summary text is emitted by the compile CLI layer, while runCompiler returns reports without logging human-readable counts."

patterns-established:
  - "Dotted and spaced aliases normalize to the same UI output family."
  - "Mutation warnings and success notices are stderr status lines; machine-readable results remain stdout JSON."
  - "Formatter errors map FsmStateError, GSDError, and runtime event-shaped failures into typed UI-SPEC JSON envelopes."

requirements-completed: [AGNT-03, AGNT-04, ERRT-01, ERRT-02, ERRT-03, ERRT-04, LOGG-01, LOGG-02, LOGG-03, PROV-03, PROV-04, QREG-01, QREG-02, QREG-03, QREG-04, QREG-05, QREG-06, QREG-07]

duration: 18 min
completed: 2026-04-28T16:01:28Z
---

# Phase 3 Plan 03-12: CLI Output Contract Summary

**Phase 3 query and compile commands now emit deterministic UI-SPEC terminal output instead of generic JSON serialization**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-28T15:43:27Z
- **Completed:** 2026-04-28T16:01:28Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added RED tests for scalar query output, structured JSON output, mutation OK/WARN stderr lines, typed ERROR envelopes, and compile count formatting.
- Added `formatQueryOutput()` and routed native query CLI responses through UI-SPEC output families for FSM, thread, transition, phase edit, and runtime event errors.
- Updated compile output so successful non-JSON runs print the exact `Compile complete.` count block with commands, workflows, agents, hooks, and outliers.
- Documented Phase 3 query output shapes in `QUERY-HANDLERS.md` and proved the formatter path stays model-free and subprocess-free.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add CLI output contract tests from UI-SPEC** - `08348174` (test)
2. **Task 2 GREEN: Route native query and compile output through deterministic UI formatter** - `25f64c4d` (feat)
3. **Task 3 REFACTOR: Document output shapes and prove no model or live provider calls were introduced** - `fabda5bd` (docs)

**Plan metadata:** recorded in the final docs commit for this summary/state update.

## RED / GREEN / REFACTOR

- **RED:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/compile/cli.test.ts` failed as expected with 9 output-contract failures against generic JSON output and the previous compile count format.
- **GREEN:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/query/fsm-state.test.ts src/query/registry.test.ts src/compile/cli.test.ts` passed: 4 files / 71 tests.
- **REFACTOR:** `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/compile/cli.test.ts src/compile/billing-boundary.test.ts` passed, forbidden model/session/subprocess scans passed, and `npm --prefix sdk run build` passed.

## Files Created/Modified

- `sdk/src/query/output.ts` - Pure formatter for scalar, JSON, OK, WARN, and ERROR query output families.
- `sdk/src/query/cli-output.test.ts` - UI-SPEC terminal output regression tests.
- `sdk/src/cli.ts` - Routes native query registry results and errors through the formatter.
- `sdk/src/compile/cli.ts` - Emits the exact compile count block for non-JSON success output.
- `sdk/src/compile/compiler.ts` - Leaves count logging to the CLI wrapper so reports remain side-effect-free.
- `sdk/src/compile/cli.test.ts` - Pins compile output copy and count alignment.
- `sdk/src/compile/compiler.test.ts` - Adjusts compile tests for side-effect-free report generation.
- `sdk/src/query/fsm-state.ts` - Returns phase edit metadata needed by UI-SPEC success envelopes.
- `sdk/src/query/fsm-state.test.ts` - Covers the updated query mutation contract.
- `sdk/src/query/thread.ts` - Provides thread session fields used by structured CLI output.
- `sdk/src/query/QUERY-HANDLERS.md` - Documents Phase 3 terminal output shapes and billing-boundary constraints.

## Verification

- `npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/compile/cli.test.ts` - expected checkout startup failure: root `vitest.config.ts` cannot resolve `vitest/config` without `NODE_PATH`.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/query/fsm-state.test.ts src/query/registry.test.ts src/compile/cli.test.ts` - PASSED, 4 files / 71 tests.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/compile/cli.test.ts src/compile/billing-boundary.test.ts` - PASSED, 3 files / 30 tests.
- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/query/cli-output.test.ts src/query/fsm-state.test.ts src/query/registry.test.ts src/compile/cli.test.ts src/compile/billing-boundary.test.ts` - PASSED, 5 files / 82 tests.
- `npm --prefix sdk run build` - PASSED.
- Acceptance greps for UI-SPEC test markers, formatter symbols, compile count output, docs output families, and forbidden `[EVENT]`/model/session/subprocess references - PASSED.

## Decisions Made

- Centralized terminal output in `formatQueryOutput()` so handlers remain data producers and CLI code owns stdout/stderr routing.
- Removed the query CLI subprocess fallback from the native output path because Phase 3 contracted output must be deterministic and Task 3 explicitly forbids subprocess helpers in `sdk/src/cli.ts` and `sdk/src/query/output.ts`.
- Moved compile count printing out of `runCompiler()` so direct compiler callers can receive reports without terminal side effects.

## Deviations from Plan

None - plan scope executed as written.

## Issues Encountered

- The bare Vitest command specified in the plan fails before test collection in this checkout because root `vitest.config.ts` cannot resolve `vitest/config`. This matches prior Phase 3 summaries; all focused suites pass with the established `NODE_PATH=$PWD/sdk/node_modules` invocation.
- The working tree contained unrelated pre-existing modified and untracked files before this plan. Task commits staged only 03-12 changes; the pre-existing `sdk/src/compile/compiler.test.ts` hunk remains unstaged.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

Ready for 03-13 runtime report handoff work. Phase 3 terminal surfaces now have stable stdout/stderr contracts for parity tests and operator scripts.

## TDD Gate Compliance

PASS. RED commit `08348174` precedes GREEN commit `25f64c4d`; REFACTOR/docs commit `fabda5bd` follows passing guardrails.

## Self-Check: PASSED

- Confirmed `.planning/phases/03-advisory-runner-query-integration/03-12-SUMMARY.md` exists.
- Confirmed task commits exist: `08348174`, `25f64c4d`, `fabda5bd`.
- Confirmed focused query/compile tests, billing-boundary guardrail test, forbidden-import scans, and SDK build pass.
- Confirmed STATE.md and ROADMAP.md now point to 03-13 as the remaining Phase 3 gap-closure plan.

---
*Phase: 03-advisory-runner-query-integration*
*Completed: 2026-04-28*
