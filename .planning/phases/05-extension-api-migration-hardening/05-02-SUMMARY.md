---
phase: 05-extension-api-migration-hardening
plan: "02"
subsystem: sdk/advisory
tags:
  - control-events
  - extension-graph
  - billing-boundary
  - lifecycle-hooks
  - tdd
  - typescript
dependency_graph:
  requires:
    - sdk/src/advisory/extension-registry.ts (Plan 01)
    - sdk/src/advisory/packet.ts
    - sdk/src/advisory/fsm-state.ts
    - sdk/src/compile/billing-boundary.ts
    - sdk/src/phase-runner.ts
    - sdk/src/advisory/workflow-runner.ts
  provides:
    - sdk/src/advisory/control-events.ts
  affects:
    - sdk/src/advisory/workflow-runner.ts (control variant, sealedGraph, instruction replacement)
    - sdk/src/phase-runner.ts (gate pre-check, lifecycle hooks)
    - sdk/src/compile/billing-boundary.ts (extensionEntryFiles param)
    - sdk/src/init-runner.ts (TypeScript narrowing fix for control variant)
tech_stack:
  added: []
  patterns:
    - discriminated union validator pattern (modeled on packet.ts validateAdvisoryPacket)
    - isRecord/hasOwn/isStringArray helpers copied from packet.ts (unexported there)
    - per-variant REQUIRED_FIELDS pattern for validateAdvisoryControlEvent
    - optional third constructor param for backward-compatible SealedExtensionGraph wiring
    - gate pre-check reads FSM state snapshot via fsmStatePath+parseFsmRunState before handler()
    - lifecycle hooks iterate sealedGraph.lifecycleHooks() at pre/post transition points
    - extensionEntryFiles spread into entrypointFiles before existsSync filter
key_files:
  created:
    - sdk/src/advisory/control-events.ts
    - sdk/src/advisory/control-events.test.ts
  modified:
    - sdk/src/advisory/workflow-runner.ts
    - sdk/src/phase-runner.ts
    - sdk/src/compile/billing-boundary.ts
    - sdk/src/compile/billing-boundary.test.ts
    - sdk/src/init-runner.ts
decisions:
  - "gate pre-check lives in PhaseRunner.resolveAdvisoryPacketResult() not WorkflowRunner.dispatch() because dispatch input lacks a full FsmRunState"
  - "gate-failed PhaseStepResult uses error='gate-failed' with data.controlEvent carrying the typed event rather than a new PhaseStepResult variant"
  - "lifecycle pre/post hooks silently skip when FSM state is unavailable (no init); no throw on missing FSM for hook path"
  - "TypeScript narrowing for callers of WorkflowRunnerResult extended with ternary control branch: control:${event.event} as error string"
  - "init-runner.ts required same narrowing fix as phase-runner.ts for posture/error/control ternaries"
metrics:
  duration: "11 min"
  completed: "2026-04-29T00:02:10Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 5
---

# Phase 5 Plan 02: Advisory Control Events + Extension Graph Wiring Summary

AdvisoryControlEvent discriminated union with validator wired into WorkflowRunnerResult; gate pre-check and lifecycle hooks integrated in PhaseRunner; billing boundary extended to walk extension entry files.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED (T1) | Failing tests for validateAdvisoryControlEvent all four variants | 5c6cb90c | control-events.test.ts |
| GREEN (T1) | Implement control-events.ts with union types and validator | c1b5e75f | control-events.ts |
| feat (T2) | Wire SealedExtensionGraph into WorkflowRunner and PhaseRunner | 5db0bf36 | workflow-runner.ts, phase-runner.ts, init-runner.ts |
| RED (T3) | Failing tests for extension entrypoint billing boundary | 816e7f29 | billing-boundary.test.ts |
| GREEN (T3) | Implement extensionEntryFiles param + lifecycle hook wiring | 28c4ec1f | billing-boundary.ts, phase-runner.ts |

## Deliverables

### `sdk/src/advisory/control-events.ts` (new)

**Exports:**
- `GateFailedEvent` — `{ kind: 'control', event: 'gate-failed', extensionId, targetStepId, workflowId, runId }`
- `MigrationRequiredEvent` — `{ kind: 'control', event: 'migration-required', statePath, detectedVersion, currentVersion, supportedRange, migrationSteps }`
- `ResumeBlockedEvent` — `{ kind: 'control', event: 'resume-blocked', statePath, detectedVersion, currentVersion }`
- `RollbackBlockedEvent` — `{ kind: 'control', event: 'rollback-blocked', statePath, reason: 'no-checkpoint' }`
- `AdvisoryControlEvent` union
- `AdvisoryControlEventValidationIssue` type
- `validateAdvisoryControlEvent(value: unknown): AdvisoryControlEventValidationIssue[]`

Zero external imports. Per-variant required-field checks. migrationSteps[N].description validation. Unknown event discriminant rejection.

### `sdk/src/advisory/control-events.test.ts` (new)

21 tests covering all four variants, missing-field cases, wrong kind, and unknown event discriminant. All GREEN.

### `sdk/src/advisory/workflow-runner.ts` (modified)

- `WorkflowRunnerResult` extended with `| { kind: 'control'; event: AdvisoryControlEvent }`
- Constructor gains optional third `sealedGraph?: SealedExtensionGraph` param
- `packetFor()` applies `instructionReplacementFor(stepId)` and updates `extensionIds` when sealedGraph present
- Gate evaluation NOT performed in `dispatch()` (no full FsmRunState available there)

### `sdk/src/phase-runner.ts` (modified)

- `PhaseRunnerDeps` gains `sealedGraph?: SealedExtensionGraph`
- `resolveAdvisoryPacketResult()` reads FSM snapshot and calls `evaluateGates(stepId, Readonly<FsmRunState>)` before handler
- Gate failure returns `PhaseStepResult { success: false, error: 'gate-failed', data: { controlEvent } }` without calling handler or advanceFsmState
- `onBeforeTransition` hooks called before `handler()`; veto returns step failure with `hook-veto:{reason}` error
- `onAfterTransition` hooks called after `advanceFsmState()` completes with updated FSM snapshot
- Three ternary narrowing fixes for `runnerResult.kind === 'control'` branch

### `sdk/src/compile/billing-boundary.ts` (modified)

- `checkBillingBoundary(projectDir, diagnostics, extensionEntryFiles?: string[])` — optional third param
- Extension entry files spread into `entrypointFiles` before `existsSync` filter
- Existing two-arg callers unchanged

### `sdk/src/compile/billing-boundary.test.ts` (modified)

Two new tests in `describe('extension entrypoint billing boundary')`:
- Extension importing forbidden module → `report.clean = false`, BILL-01 diagnostic present
- Clean extension entry → `report.clean = true`

### `sdk/src/init-runner.ts` (modified)

TypeScript narrowing fix: `runnerResult.kind === 'control'` branch in posture/error/control ternary (same pattern as phase-runner.ts fixes).

## Verification Results

| Gate | Result |
|------|--------|
| RED phase T1 (Cannot find module) | PASS — 1 suite failed as expected |
| GREEN phase T1 (21 tests) | PASS — 21/21 |
| workflow-runner + phase-runner regression | PASS — 119/119 |
| TypeScript compile (`tsc --noEmit`) | PASS — zero errors |
| RED phase T3 (billing boundary extension) | PASS — 1 test failed as expected |
| GREEN phase T3 (billing boundary 13 tests) | PASS — 13/13 |
| control-events + billing-boundary combined | PASS — 34/34 |
| phase4-parity gate | PASS — All Phase 4 parity gates PASSED |
| Full SDK unit suite | PASS — 2384/2389 (5 pre-existing failures unchanged) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript narrowing errors in WorkflowRunnerResult consumers**
- **Found during:** Task 2 TypeScript compile check
- **Issue:** Adding `{ kind: 'control' }` to `WorkflowRunnerResult` union caused TS2339 errors in phase-runner.ts (3 locations) and init-runner.ts (1 location) where ternaries assumed only `posture | error` variants
- **Fix:** Added `runnerResult.kind === 'control' ? \`control:\${runnerResult.event.event}\` : ...` branch in all four ternaries
- **Files modified:** sdk/src/phase-runner.ts, sdk/src/init-runner.ts
- **Commit:** 5db0bf36

**2. [Rule 2 - Missing critical] Gate pre-check reads FSM state directly via fsmStatePath+readFile+parseFsmRunState**
- **Found during:** Task 2 implementation
- **Issue:** `readExistingFsmState` in fsm-state.ts is not exported; no exported `readFsmState` function exists
- **Fix:** Gate pre-check reads FSM state using the exported `fsmStatePath` + `readFile` + `parseFsmRunState` combination; silently skips on read error (FSM not initialized)
- **Files modified:** sdk/src/phase-runner.ts (import of fsmStatePath, parseFsmRunState, FsmRunState added)
- **Commit:** 5db0bf36

## TDD Gate Compliance

- RED commit T1: `5c6cb90c` (test file only, suite failed with "Cannot find module")
- GREEN commit T1: `c1b5e75f` (21/21 pass)
- RED commit T3: `816e7f29` (1 test fails — billing boundary extension not yet wired)
- GREEN commit T3: `28c4ec1f` (13/13 pass)
- Task 2 is a pure wiring task (no new test file added per plan); tested through existing workflow-runner and phase-runner suites

## Threat Model Coverage

All T-05-02-xx mitigations implemented:

| Threat ID | Mitigation | Location |
|-----------|-----------|---------|
| T-05-02-01 | checkBillingBoundary() walks extension entry files for forbidden imports | billing-boundary.ts extensionEntryFiles param |
| T-05-02-02 | evaluateGates() passes Readonly<FsmRunState>; TypeScript prevents writes | extension-registry.ts evaluateGates signature |
| T-05-02-03 | Hooks receive Readonly<FsmRunState>; veto result is a typed return | phase-runner.ts onBeforeTransition call |
| T-05-02-04 | ProviderCheckRegistration.check() return type is ProviderAvailabilityResult | extension-registry.ts (Plan 01) |
| T-05-02-05 | validateAdvisoryControlEvent() rejects missing fields and unknown discriminants | control-events.ts |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced beyond the threat model entries already catalogued.

## Self-Check: PASSED

- `sdk/src/advisory/control-events.ts` exists: FOUND
- `sdk/src/advisory/control-events.test.ts` exists: FOUND
- RED commit `5c6cb90c` exists: FOUND
- GREEN commit `c1b5e75f` exists: FOUND
- RED commit `816e7f29` exists: FOUND
- GREEN commit `28c4ec1f` exists: FOUND
- 21 control-events tests pass GREEN: VERIFIED
- 13 billing-boundary tests pass GREEN: VERIFIED
- TypeScript zero errors: VERIFIED
- phase4-parity gate: VERIFIED PASS
- `grep "from '" sdk/src/advisory/control-events.ts` returns empty: VERIFIED (zero external imports)
- `grep "kind: 'control'" sdk/src/advisory/workflow-runner.ts`: FOUND
- `grep "sealedGraph" sdk/src/advisory/workflow-runner.ts`: FOUND
- `grep "evaluateGates" sdk/src/phase-runner.ts`: FOUND
- `grep "instructionReplacementFor" sdk/src/advisory/workflow-runner.ts`: FOUND
- `grep "extensionEntryFiles" sdk/src/compile/billing-boundary.ts`: FOUND
- `grep "onBeforeTransition\|onAfterTransition" sdk/src/phase-runner.ts`: FOUND (4 matches)
