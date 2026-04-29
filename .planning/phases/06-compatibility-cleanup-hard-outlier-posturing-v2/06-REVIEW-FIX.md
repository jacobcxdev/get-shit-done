---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
fixed_at: 2026-04-29T03:39:30Z
review_path: .planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/06-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-04-29T03:39:30Z
**Source review:** .planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: `EXPECTED_HARD_OUTLIERS` in parity test asserts non-null `workflowId` for command-only outliers

**Files modified:** `sdk/src/parity/hard-outlier-posture.test.ts`
**Commits:** `34dfccf6`, `4b519ffd`
**Applied fix:**
- Changed `EXPECTED_HARD_OUTLIERS` type from `Array<{ commandId: string; workflowId: string }>` to `Array<{ commandId: string; workflowId: string | null }>`.
- Set `workflowId: null` for `/gsd-graphify` and `/gsd-from-gsd2` (command-only outliers with no workflow-backed runner, matching the canonical posture YAMLs and generated `command-classification.json`).
- Changed dispatch call from `workflowId: outlier.workflowId` to `workflowId: outlier.workflowId ?? undefined` so null passes through as undefined, allowing the runner to use `command.workflowId` (also null) rather than a sentinel string.
- Updated the `workflowId` assertion to branch: workflow-backed outliers assert `toBe(outlier.workflowId)`; command-only outliers assert `toBeUndefined()` (the runner omits `workflowId` from `WorkflowPostureRecord` when no workflow backs the command).
- The third `it` block already correctly validates `outlierPostureRecord.workflowId` is `null` in the classification baseline — no change needed there.
- All 7 tests in `hard-outlier-posture.test.ts` pass after the fix.

**Note:** requires human verification — the workflowId assertion logic change is semantic (branching on null vs non-null outlier.workflowId); Tier 1/2 verification confirmed tests pass but human review of the dispatch/assertion semantics is recommended.

---

### WR-02: `process.exitCode = 1` set inside library function `runCompiler`

**Files modified:** `sdk/src/compile/compiler.ts`
**Commit:** `8a08e8e1`
**Applied fix:** Removed the three-line block `if (report.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) { process.exitCode = 1; }` from `runCompiler`. The CLI layer (`cli.ts` line 126) already sets `process.exitCode = 1` based on `errorCount > 0`; the in-library assignment was redundant and hazardous to programmatic callers. Compile check (`node ./bin/gsd-sdk.js compile --check`) passes after the change.

---

### WR-03: `process.argv[idx + 1]` unguarded when `--step` is the last argument

**Files modified:** `scripts/phase4-parity.cjs`
**Commit:** `251a81f6`
**Applied fix:** Replaced the inline ternary `return idx !== -1 ? process.argv[idx + 1] : null` with an IIFE that:
1. Returns `null` immediately when `--step` is absent.
2. Reads `process.argv[idx + 1]` into `value`.
3. If `value` is falsy or starts with `--`, writes `[PRTY-08] Error: --step requires a step name argument` to stderr and calls `process.exit(1)`.
4. Otherwise returns the value.
Syntax check (`node -c`) passes.

---

### WR-04: `validateLauncherMetadata` receives absolute `absPath` — leaks host paths in diagnostics

**Files modified:** `sdk/src/compile/inventory/workflows.ts`
**Commit:** `f0492105`
**Applied fix:** In the `isLauncher` branch inside `collectWorkflows`, computed `repoRelPath = toRepoRelative(projectDir, absPath)` and passed `repoRelPath` instead of `absPath` to `validateLauncherMetadata`. The `toRepoRelative` helper was already imported and used at line 205 for `WorkflowEntry.path`; this change makes diagnostics consistent with all other compiler diagnostics and removes host path leakage (T-06-03-02 mitigation). Compile check passes after the change.

---

### WR-05: `slim-eligibility.ts` casts `JSON.parse` result without array validation

**Files modified:** `sdk/src/compile/slim-eligibility.ts`
**Commit:** `79b3da86`
**Applied fix:** Inside the parity-coverage gate try/catch, changed:
```typescript
parityEntries = JSON.parse(raw) as ParityWorkflowEntry[];
```
to:
```typescript
const parsed = JSON.parse(raw) as unknown;
if (!Array.isArray(parsed)) throw new Error('parity index must be a JSON array');
parityEntries = parsed as ParityWorkflowEntry[];
```
The thrown `Error` is caught by the existing `catch` block, setting `parityReadError = true` and routing to the fail-closed SLIM-01 diagnostic path. All 11 tests in `slim-eligibility.test.ts` pass after the change.

---

_Fixed: 2026-04-29T03:39:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
