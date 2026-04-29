---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
plan: 02
subsystem: compile/slim-eligibility
tags: [tdd, slim-eligibility, compiler, cli, parity-coverage, fail-closed]
dependency_graph:
  requires:
    - "06-01: OutlierPostureRecord type and outlierPostureRecord on ClassificationEntry"
  provides:
    - evaluateSlimEligibility in sdk/src/compile/slim-eligibility.ts
    - SlimEligibilityGate type in sdk/src/compile/types.ts
    - SlimEligibilityGateResult type in sdk/src/compile/types.ts
    - SlimEligibilityVerdict type in sdk/src/compile/types.ts
    - --check-slim-eligibility CLI flag in sdk/src/compile/cli.ts
  affects:
    - sdk/src/compile/types.ts (three new types appended)
    - sdk/src/compile/cli.ts (new flag, dispatch branch, usage docs)
tech_stack:
  added: []
  patterns:
    - Fail-closed gate evaluator (indeterminate on missing evidence, not pass)
    - Optional parityIndexPath override parameter for test isolation (avoids global fs mocking)
    - Dynamic import dispatch branch after full CompileReport is built (billing boundary safe)
    - Hard-outlier short-circuit using compiler-manifest ClassificationEntry (T-06-02-02 mitigation)
key_files:
  created:
    - sdk/src/compile/slim-eligibility.ts
    - sdk/src/compile/slim-eligibility.test.ts
  modified:
    - sdk/src/compile/types.ts
    - sdk/src/compile/cli.ts
decisions:
  - "parityIndexPath optional parameter avoids global fs mocking in unit tests; production default is hardcoded absolute path (T-06-02-04 accepted threat)"
  - "typed-transitions and packet-sequencing gates always return indeterminate per fail-closed D-02 — no durable non-prose transition evidence surface exists yet"
  - "provider-routing gate passes when agentTypes is empty (no route required), indeterminate when agentTypes non-empty but no mandatoryProviders found"
  - "eligible is always derived from gates array, never set independently (T-06-02-01 mitigation)"
  - "hard-outlier short-circuit uses ClassificationEntry.isHardOutlier from compiler manifest, not caller-supplied metadata (T-06-02-02 mitigation)"
  - "parity-workflow-index.json read errors produce SLIM-01 fail verdict rather than unhandled exceptions (T-06-02-05 mitigation)"
  - "parity index field is parityTier (not tier) — matched actual generated parity-workflow-index.json structure"
metrics:
  duration: 5 minutes
  completed: 2026-04-29
  tasks_completed: 2
  files_changed: 4
requirements-completed: [SLIM-01]
---

# Phase 6 Plan 02: Slim Eligibility Evaluator Summary

**One-liner:** Fail-closed slim eligibility evaluator with four independent gates (typed-transitions, packet-sequencing, provider-routing, parity-coverage), OUTL-01/SLIM-01 diagnostics, and `--check-slim-eligibility` CLI flag with non-zero exit for fail/indeterminate verdicts.

## What Was Built

This plan implements the sole authority for deciding whether a workflow may be slimmed. Without a passing verdict from `evaluateSlimEligibility`, no Markdown file may be archived or replaced by a thin launcher. The evaluator is fail-closed: any gate without evidence yields indeterminate, not pass.

### Files Created

- **`sdk/src/compile/slim-eligibility.ts`** — `evaluateSlimEligibility(workflowId, report, parityIndexPath?)` function implementing all four gates. Hard-outlier workflows short-circuit with OUTL-01 diagnostic referencing the posture record. Unknown workflows short-circuit with SLIM-01. The four gates are evaluated independently and reported in `verdict.gates[]`. The optional `parityIndexPath` parameter enables test isolation without global fs mocking.
- **`sdk/src/compile/slim-eligibility.test.ts`** — 11 unit tests covering: unknown workflow SLIM-01, hard-outlier OUTL-01 with and without posture record path, all four gates present, typed-transitions indeterminate, packet-sequencing indeterminate, eligible false when any gate is indeterminate, parity-coverage pass/fail/unreadable, parity tier hard-outlier fails.

### Files Modified

- **`sdk/src/compile/types.ts`** — Added `SlimEligibilityGate`, `SlimEligibilityGateResult`, `SlimEligibilityVerdict` types at the end of the file.
- **`sdk/src/compile/cli.ts`** — Added `checkSlimEligibility?: string` to `ParsedCompileArgs`; added `'check-slim-eligibility': { type: 'string' }` to `parseArgs` options; added flag documentation to `COMPILE_USAGE`; added dispatch branch after `runCompiler()` call that evaluates eligibility, emits JSON, and exits non-zero for non-pass verdicts.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| slim-eligibility.test.ts | 11 | GREEN |
| cli.test.ts | 13 | GREEN |
| `gsd-sdk compile --check-slim-eligibility /workflows/fast` | exits 1, isHardOutlier:true | PASS |
| `gsd-sdk compile --check-slim-eligibility /workflows/nonexistent` | exits 1, status:fail | PASS |
| `gsd-sdk compile` | exits 0 | PASS |
| `gsd-sdk compile --check` | exits 0, baselines unchanged | PASS |

**Total: 24 tests passing, 0 failing.**

## TDD Gate Compliance

- `test(06-02)` commit `fd7585e9` — RED gate (import error on missing slim-eligibility module, CLI flag unknown) ✓
- `feat(06-02)` commit `7b58c8f1` — GREEN gate (all 24 tests pass, CLI verified) ✓
- No REFACTOR gate needed (code is clean as written).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] WorkflowEntry shape updated by concurrent work**
- **Found during:** Task 2, implementing makeWorkflowEntry in test file
- **Issue:** types.ts had been modified by concurrent work in the worktree to add `isLauncher: boolean` and `LauncherMetadata` type to `WorkflowEntry`. The test factory was missing this required field.
- **Fix:** Added `isLauncher: false` to `makeWorkflowEntry()` factory in slim-eligibility.test.ts
- **Files modified:** `sdk/src/compile/slim-eligibility.test.ts`

**2. [Rule 1 - Bug] parity index field name is parityTier, not tier**
- **Found during:** Task 1 test authoring (reading actual generated file)
- **Issue:** The plan's interfaces block references `tier` in the gate policy prose, but the actual `parity-workflow-index.json` uses `parityTier` as the field name, consistent with `ParityWorkflowEntry.parityTier` in `generate-fixtures.ts`
- **Fix:** Used `parityTier` (the actual field name) throughout `slim-eligibility.ts` and test assertions
- **Files modified:** `sdk/src/compile/slim-eligibility.ts`, `sdk/src/compile/slim-eligibility.test.ts`

**3. [Rule 3 - Blocking Issue] cli.ts parseArgs already split by concurrent work — extra blank line introduced**
- **Found during:** Task 2, after edit that added blank line between help branch and findProjectRoot import
- **Issue:** An accidental extra blank line was added during an intermediate edit step
- **Fix:** Cleaned up in the subsequent edit that added the dispatch branch, restoring correct spacing

### Design Notes

- `typed-transitions` and `packet-sequencing` gates are intentionally indeterminate for all workflows per fail-closed policy D-02 and RESEARCH.md. These gates will become functional when durable non-prose transition evidence surfaces and explicit packet definitions are collected by the compiler respectively.
- The `makeMinimalProject()` helper referenced in the plan does not exist in cli.test.ts — the integration test uses the same inline `mkdir` pattern already present in the file.

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| evaluateSlimEligibility returns fail for hard outliers | PASS |
| evaluateSlimEligibility returns fail for unknown workflows | PASS |
| All four gates independently report evidence and status | PASS |
| Missing evidence yields indeterminate (fail-closed) | PASS |
| CLI exits non-zero for fail and indeterminate verdicts | PASS |
| CLI exits zero only when all four gates pass (N/A — typed-transitions/packet-sequencing currently always indeterminate) | N/A |
| No workflow Markdown files modified | PASS |
| SDK does NOT call scripts/phase4-parity.cjs | PASS |
| slim-eligibility.ts imports only compile-layer and Node built-in modules | PASS |
| OUTL-01 diagnostic contains 'posture record' | PASS |
| gsd-sdk compile exits zero | PASS |
| gsd-sdk compile --check exits zero | PASS |

## Threat Surface Scan

No new network endpoints, auth paths, or file-write surfaces. `evaluateSlimEligibility` reads only `parity-workflow-index.json` (a local generated artifact) and `CompileReport` data. All STRIDE mitigations applied per threat register:
- T-06-02-01: eligible derived exclusively from gates array ✓
- T-06-02-02: hard-outlier check uses ClassificationEntry from compiler manifest ✓
- T-06-02-03: accepted (generated file path, no sensitive data) ✓
- T-06-02-04: accepted (parityIndexPath override is test-only) ✓
- T-06-02-05: unreadable parity index produces SLIM-01 fail verdict, no unhandled exception ✓

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| sdk/src/compile/slim-eligibility.ts exists | FOUND |
| sdk/src/compile/slim-eligibility.test.ts exists | FOUND |
| SlimEligibilityGate type in sdk/src/compile/types.ts | FOUND |
| SlimEligibilityVerdict type in sdk/src/compile/types.ts | FOUND |
| RED commit fd7585e9 exists | FOUND |
| GREEN commit 7b58c8f1 exists | FOUND |
