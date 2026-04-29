---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
plan: 01
subsystem: compile/outlier-postures
tags: [tdd, outlier-posture, compiler, classification, yaml-loader]
dependency_graph:
  requires: []
  provides:
    - OutlierPostureRecord type in sdk/src/compile/types.ts
    - loadOutlierPostureRecords in sdk/src/compile/outlier-postures.ts
    - validatePostureRecord in sdk/src/compile/outlier-postures.ts
    - parsePostureYaml in sdk/src/compile/outlier-postures.ts
    - classifyCommands postureRecords parameter in sdk/src/compile/classification.ts
    - Five posture YAML files in sdk/src/advisory/outlier-postures/
    - outlierPostureRecord field in command-classification.json baseline
  affects:
    - sdk/src/compile/compiler.ts (pipeline wired)
    - sdk/src/parity/hard-outlier-posture.test.ts (posture record parity assertion)
tech_stack:
  added: []
  patterns:
    - Flat YAML parser (no external dependency, handles '>' block scalar)
    - Loader+validator pattern (same as billing-boundary.ts)
    - Repo-relative path normalization for generated baselines (D-07 compliance)
    - loadOutlierPostureRecords before classifyCommands, passed as Map parameter
key_files:
  created:
    - sdk/src/compile/outlier-postures.ts
    - sdk/src/compile/outlier-postures.test.ts
    - sdk/src/advisory/outlier-postures/gsd-graphify.yaml
    - sdk/src/advisory/outlier-postures/gsd-from-gsd2.yaml
    - sdk/src/advisory/outlier-postures/gsd-ultraplan-phase.yaml
    - sdk/src/advisory/outlier-postures/gsd-review.yaml
    - sdk/src/advisory/outlier-postures/gsd-fast.yaml
  modified:
    - sdk/src/compile/types.ts
    - sdk/src/compile/classification.ts
    - sdk/src/compile/compiler.ts
    - sdk/src/compile/classification.test.ts
    - sdk/src/parity/hard-outlier-posture.test.ts
    - sdk/src/generated/compile/command-classification.json
decisions:
  - "posturePath stored as repo-relative string (e.g. sdk/src/advisory/outlier-postures/gsd-fast.yaml) to satisfy D-07 no-absolute-path constraint in generated baselines"
  - "loadOutlierPostureRecords derives sdkSrcDir from projectDir (repo root + sdk/src) rather than import.meta.dirname because the compiler runs from sdk/dist/ where YAML source files are absent"
  - "loadOutlierPostureRecords accepts optional projectDir parameter for repo-relative path computation; tests pass temp dirs without projectDir and receive absolute paths"
  - "classifyCommands OUTL-01 emission is gated on postureRecords !== undefined to avoid false diagnostics when called without posture records (e.g. direct test calls)"
  - "loader emits OUTL-01 per missing seed in the seed-check loop after processing files AND in the catch block when the directory is absent (consistent behavior both paths)"
metrics:
  duration: 8 minutes
  completed: 2026-04-29
  tasks_completed: 2
  files_changed: 12
---

# Phase 6 Plan 01: Hard-Outlier Posture Records Summary

**One-liner:** YAML-backed OutlierPostureRecord loader with OUTL-01/OUTL-02 diagnostics, flat parser, compiler pipeline wiring, and five seed posture files for /gsd-graphify, /gsd-from-gsd2, /gsd-ultraplan-phase, /gsd-review, and /gsd-fast.

## What Was Built

This plan implements the foundational OUTL-01/OUTL-02 machinery required before slim eligibility checks (Plan 02) or thin launcher work (Plan 03) can reference outlier posture in gate decisions.

### Files Created

- **`sdk/src/compile/outlier-postures.ts`** — flat YAML parser (`parsePostureYaml`), record validator (`validatePostureRecord`), and async loader (`loadOutlierPostureRecords`). The loader reads from `sdk/src/advisory/outlier-postures/`, validates each file against the `SEED_HARD_OUTLIERS` set, emits `OUTL-01` for missing seeds, and `OUTL-02` for non-seed files.
- **`sdk/src/compile/outlier-postures.test.ts`** — 9 unit tests covering validatePostureRecord acceptance, rejection of bad fields/non-false emitsPacket/wrong classifiedAs/non-seed commandId, and loadOutlierPostureRecords with full/missing/partial/non-seed directories.
- **Five YAML posture files** under `sdk/src/advisory/outlier-postures/` — one per seed hard outlier with all required fields (`commandId`, `classifiedAs`, `migrationDisposition`, `rationale`, `emitsPacket`, `reviewedAt`, `owner`, `workflowId`).

### Files Extended

- **`sdk/src/compile/types.ts`** — added `'slim' | 'outlier'` to `DiagnosticKind`, added `OutlierPostureRecord` type, added `outlierPostureRecord?: OutlierPostureRecord` to `ClassificationEntry`.
- **`sdk/src/compile/classification.ts`** — extended `classifyCommands` with optional `postureRecords?: Map<string, OutlierPostureRecord>` parameter; wires `outlierPostureRecord` into each entry; emits `OUTL-01` when a seed outlier is missing from the map.
- **`sdk/src/compile/compiler.ts`** — calls `loadOutlierPostureRecords(sdkSrcDir, diagnostics, projectDir)` before `classifyCommands`, passes `postureRecords` as the fourth argument.
- **`sdk/src/parity/hard-outlier-posture.test.ts`** — added `outlierPostureRecord` shape assertion reading `command-classification.json`; also reconciles `workflowId: null` for the two command-only outliers (graphify, from-gsd2).

### Baseline Updated

`sdk/src/generated/compile/command-classification.json` regenerated with `outlierPostureRecord` populated for all 5 seed hard outliers. `posturePath` is stored as a repo-relative POSIX string (e.g. `sdk/src/advisory/outlier-postures/gsd-fast.yaml`).

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| outlier-postures.test.ts | 9 | GREEN |
| classification.test.ts | 14 | GREEN |
| hard-outlier-posture.test.ts | 7 | GREEN |
| `gsd-sdk compile --check` | baseline | PASS |
| OUTL-01 missing-seed test | compile exits 1 | PASS |

**Total: 30 tests passing, 0 failing.**

## TDD Gate Compliance

- `test(06-01)` commit `14938ace` — RED gate (import error on missing module) ✓
- `feat(06-01)` commit `62493d93` — GREEN gate (all 30 tests pass) ✓
- No REFACTOR gate needed (code is clean as written).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Repo-relative posturePath in generated baseline**
- **Found during:** Task 2, after regenerating command-classification.json
- **Issue:** `posturePath` initially stored as absolute filesystem path (`/Users/jacob/...`) in the generated JSON — would fail `--check` on any other machine
- **Fix:** Added `projectDir` parameter to `loadOutlierPostureRecords`; compute posturePath as `relative(projectDir, absPath)` when projectDir is provided; tests (which use temp dirs without projectDir) receive absolute paths, which is correct for test isolation
- **Files modified:** `sdk/src/compile/outlier-postures.ts`, `sdk/src/compile/compiler.ts`

**2. [Rule 3 - Blocking Issue] sdkSrcDir resolution via import.meta.dirname**
- **Found during:** Task 2, baseline regeneration — posture records showed no `outlierPostureRecord` in first pass
- **Issue:** `join(import.meta.dirname, '..')` resolves to `sdk/dist/` at runtime (compiler runs from compiled dist), not `sdk/src/` where YAML files live
- **Fix:** Changed `sdkSrcDir = join(import.meta.dirname, '..')` to `sdkSrcDir = join(projectDir, 'sdk', 'src')` since `projectDir` is the repo root always available to the compiler
- **Files modified:** `sdk/src/compile/compiler.ts`

**3. [Rule 2 - Missing Critical Functionality] OUTL-01 gated on postureRecords !== undefined**
- **Found during:** Task 2, classification.test.ts Wave-0 case review
- **Issue:** If `classifyCommands` emitted OUTL-01 whenever postureRecord was missing regardless of whether postureRecords was supplied, all existing tests that call classifyCommands without a Map would emit spurious diagnostics
- **Fix:** Gated OUTL-01 emission in classifyCommands on `postureRecords !== undefined` — only when the caller explicitly supplies a Map does missing-record become an error; loader always checks seeds after loading

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| loadOutlierPostureRecords returns Map of size 5 for live repo | PASS |
| classifyCommands attaches outlierPostureRecord to all 5 seed outlier entries | PASS |
| gsd-sdk compile exits non-zero when any seed YAML is missing | PASS |
| gsd-sdk compile exits zero with all five YAML files present | PASS |
| gsd-sdk compile --check exits zero (baselines current) | PASS |
| hard-outlier-posture.test.ts asserts outlierPostureRecord shape | PASS |
| No new parity test failures introduced | PASS |
| SDK does NOT call scripts/phase4-parity.cjs | PASS |

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced. The YAML loader reads from the source tree only. The flat parser rejects unparseable lines silently (T-06-01-05 mitigation applied). Non-seed commandIds are rejected with OUTL-02 (T-06-01-01 and T-06-01-04 mitigations applied). `posturePath` is in generated artifacts but is a repo-relative developer tool path (T-06-01-03 accepted per plan threat register).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| sdk/src/compile/outlier-postures.ts exists | FOUND |
| sdk/src/compile/outlier-postures.test.ts exists | FOUND |
| sdk/src/advisory/outlier-postures/gsd-graphify.yaml exists | FOUND |
| sdk/src/advisory/outlier-postures/gsd-from-gsd2.yaml exists | FOUND |
| sdk/src/advisory/outlier-postures/gsd-ultraplan-phase.yaml exists | FOUND |
| sdk/src/advisory/outlier-postures/gsd-review.yaml exists | FOUND |
| sdk/src/advisory/outlier-postures/gsd-fast.yaml exists | FOUND |
| RED commit 14938ace exists | FOUND |
| GREEN commit 62493d93 exists | FOUND |
