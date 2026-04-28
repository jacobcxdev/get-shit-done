---
phase: 05-extension-api-migration-hardening
plan: "01"
subsystem: sdk/advisory
tags:
  - extension-registry
  - tdd
  - typescript
dependency_graph:
  requires:
    - sdk/src/advisory/packet.ts
    - sdk/src/advisory/fsm-state.ts
    - sdk/src/advisory/provider-availability.ts
    - sdk/src/compile/types.ts
  provides:
    - sdk/src/advisory/extension-registry.ts
  affects:
    - sdk/src/advisory/workflow-runner.ts (Plan 02 consumer)
    - sdk/src/compile/billing-boundary.ts (Plan 02 entrypoint extension)
tech_stack:
  added: []
  patterns:
    - findCycle DFS copied from validators.ts (not exported there)
    - ExtensionRegistryError modeled on FsmStateError pattern
    - CompileDiagnostic shape used for co-anchor warnings
    - Topological sort with registration-order tie-break
key_files:
  created:
    - sdk/src/advisory/extension-registry.ts
    - sdk/src/advisory/extension-registry.test.ts
  modified: []
decisions:
  - "finalize() is an explicit public call on ExtensionRegistry returning SealedExtensionGraph; WorkflowRunner receives it as optional arg (Plan 02)"
  - "cycle-detected and unknown-dependency errors thrown from finalize() rather than returned as diagnostics, matching the hard-error semantic"
  - "co-anchor warnings use CompileDiagnostic shape with code EXT-01 stored on SealedExtensionGraph.warnings"
  - "topological sort uses Kahn's algorithm with registration order as tie-break for deterministic output"
  - "duplicate-id check is per extensionId+kind pair — same extension can register multiple slot kinds"
metrics:
  duration: "9 min"
  completed: "2026-04-28T23:47:38Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 0
---

# Phase 5 Plan 01: Extension Slot Registry Summary

Typed extension slot registry with local-invariant validation at `register()` and full dependency/cycle validation at `finalize()`. Implements EXT-01, EXT-02, EXT-06, EXT-07 declarative API surface and the `SealedExtensionGraph` consumed by WorkflowRunner in Plan 02.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED | Write failing tests for all registration and finalize paths | 2e3dcef4 | extension-registry.test.ts |
| GREEN | Implement ExtensionRegistry, SealedExtensionGraph, slot types | fc87ac39 | extension-registry.ts |
| REFACTOR | — (no refactor needed; implementation was clean) | — | — |

## Deliverables

### `sdk/src/advisory/extension-registry.ts`

**Exports:**
- `ExtensionRegistryError` — typed error class with codes: `invalid-namespace`, `duplicate-id`, `invalid-slot-shape`, `reserved-prefix`, `cycle-detected`, `unknown-dependency`
- `ExtensionRegistry` — mutable registry; `register()` validates eagerly, `finalize()` validates dependencies and returns `SealedExtensionGraph`
- `SealedExtensionGraph` — immutable sealed graph with `insertedStepsFor()`, `instructionReplacementFor()`, `evaluateGates()`, `lifecycleHooks()`, `providerChecks()`, and `warnings`
- `InsertStepRegistration`, `ReplaceInstructionRegistration`, `GateRegistration`, `LifecycleHookRegistration`, `ProviderCheckRegistration` — five slot types

### `sdk/src/advisory/extension-registry.test.ts`

35 tests covering all registration invariants, finalize validation paths, and SealedExtensionGraph surface methods. All pass GREEN.

## Verification Results

| Gate | Result |
|------|--------|
| RED phase (import failure) | PASS — 1 test suite failed as expected |
| GREEN phase (35 tests) | PASS — 35/35 |
| TypeScript compile (`tsc --noEmit`) | PASS — zero errors |
| Full SDK suite regression | PASS — pre-existing 4–5 failures unchanged |

## Deviations from Plan

### Auto-fixed Issues

None required — plan executed exactly as written.

**Minor adjustment:** CompileDiagnostic shape used directly for co-anchor warnings (no `mkWarning` import, as `extension-registry.ts` must remain pure with no compile-layer imports). The `CompileDiagnostic` type is imported from `../compile/types.js` (pure type — no runtime dependency).

## TDD Gate Compliance

- RED commit: `2e3dcef4` (test file only, suite failed with "Cannot find module")
- GREEN commit: `fc87ac39` (implementation, 35/35 pass)
- REFACTOR: not needed

## Threat Model Coverage

All T-05-01-xx mitigations implemented:

| Threat ID | Mitigation | Location |
|-----------|-----------|---------|
| T-05-01-01 | Namespace/slot/prefix validation at `register()` | `validateLocalInvariants()` |
| T-05-01-02 | `ReplaceInstructionRegistration` type has only `instruction` field | TypeScript type definition |
| T-05-01-03 | `evaluateGates()` passes `Readonly<FsmRunState>` | Method signature |
| T-05-01-04 | `findCycle()` at `finalize()` throws `cycle-detected` with full chain | `finalize()` |
| T-05-01-05 | `reserved-prefix` check for `gsd` and `core` prefixes | `isReservedPrefix()` |

## Known Stubs

None.

## Self-Check: PASSED

- `sdk/src/advisory/extension-registry.ts` exists: FOUND
- `sdk/src/advisory/extension-registry.test.ts` exists: FOUND
- RED commit `2e3dcef4` exists: FOUND
- GREEN commit `fc87ac39` exists: FOUND
- 35 tests pass GREEN: VERIFIED
- TypeScript zero errors: VERIFIED
