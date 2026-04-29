---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
plan: 03
subsystem: compile/slim-launcher
tags: [tdd, slim-launcher, compiler, workflow-inventory, slim-02]
dependency_graph:
  requires:
    - "06-01 (parsePostureYaml from outlier-postures.ts)"
    - "06-01 (SEED_HARD_OUTLIERS from classification.ts)"
  provides:
    - extractLauncherBlock in sdk/src/compile/slim-launcher.ts
    - validateLauncherMetadata in sdk/src/compile/slim-launcher.ts
    - LauncherMetadata type in sdk/src/compile/types.ts
    - isLauncher:boolean field on WorkflowEntry (types.ts + inventory/workflows.ts)
    - workflow-coverage.json baseline updated with isLauncher:false for all 84 entries
  affects:
    - sdk/src/compile/inventory/workflows.ts (isLauncher wired into collectWorkflows)
    - sdk/src/generated/compile/workflow-coverage.json (isLauncher field added)
tech_stack:
  added: []
  patterns:
    - Anchored regex with lazy quantifier + interior-fence check for safe block extraction
    - Reuse of parsePostureYaml from outlier-postures.ts (no duplicate YAML parsing)
    - Additive WorkflowEntry field (isLauncher) — no existing fields changed
    - Validation-only side effect: SLIM-02 diagnostics emitted, isLauncher not gated on valid metadata
key_files:
  created:
    - sdk/src/compile/slim-launcher.ts
  modified:
    - sdk/src/compile/types.ts
    - sdk/src/compile/inventory/workflows.ts
    - sdk/src/generated/compile/workflow-coverage.json
decisions:
  - "extractLauncherBlock checks that the matched interior contains no ``` lines to reject two-block concatenated files — the lazy regex alone expands past the first closing fence when two blocks are present"
  - "validateLauncherMetadata returns null on first validation failure (field missing, hard-outlier, workflowId mismatch); isLauncher remains true in collectWorkflows even when metadata is invalid so the compiler can report SLIM-02 and still process the entry"
  - "parsePostureYaml reused from outlier-postures.ts via import — no duplicate YAML parsing code in slim-launcher.ts"
  - "SDK must be rebuilt (npm run build) before gsd-sdk compile picks up new TypeScript sources; workflow-coverage.json baseline regenerated after build"
metrics:
  duration: 6 minutes
  completed: 2026-04-29
  tasks_completed: 2
  files_changed: 4
---

# Phase 6 Plan 03: Thin Launcher Parser and isLauncher Workflow Flag Summary

**One-liner:** Anchored regex launcher block extractor and SLIM-02 metadata validator with `isLauncher:boolean` wired into `collectWorkflows`, covering all 84 live workflows (all `false`).

## What Was Built

This plan implements the SLIM-02 detection and validation surface: machinery to distinguish thin launcher files (a workflow file whose entire content is a single fenced `gsd-advisory` YAML block) from full prose workflows.

### Files Created

- **`sdk/src/compile/slim-launcher.ts`** — Two exported functions:
  - `extractLauncherBlock(content: string): string | null` — Anchored regex (`^```gsd-advisory\n...\n```$`) plus interior-fence rejection (`/^```/m` on the captured interior) to identify single-block launcher files. Any prose before/after, wrong fence info string, empty file, or multiple blocks returns null.
  - `validateLauncherMetadata(raw, filePath, diagnostics): LauncherMetadata | null` — Checks all five required fields (`schemaVersion`, `workflowId`, `commandId`, `runner`, `archivePath`), rejects `commandId` values in `SEED_HARD_OUTLIERS` (T-06-03-01), and verifies `workflowId` matches `/workflows/<stem>` derived from `filePath` (T-06-03-02). Emits `SLIM-02` on any failure.

### Files Modified

- **`sdk/src/compile/types.ts`** — Added `LauncherMetadata` type; added `isLauncher: boolean` to `WorkflowEntry`.
- **`sdk/src/compile/inventory/workflows.ts`** — Imports `extractLauncherBlock` and `validateLauncherMetadata` from `../slim-launcher.js`; calls them per workflow file in `collectWorkflows`; adds `isLauncher` to each returned `WorkflowEntry`.
- **`sdk/src/generated/compile/workflow-coverage.json`** — Baseline regenerated after SDK rebuild: all 84 live workflow entries now carry `"isLauncher": false`.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| slim-launcher.test.ts (RED commit `1eb37d44`) | 17 | RED (as expected) |
| slim-launcher.test.ts (GREEN commit `9c315940`) | 17 | GREEN |
| `gsd-sdk compile` | counts 86/84/33/11/5 | PASS |
| `gsd-sdk compile --check` | baseline | PASS |
| No workflow .md files modified | `git diff get-shit-done/workflows/` | PASS |

**Total: 17 tests passing, 0 failing.**

## TDD Gate Compliance

- `test(06-03)` commit `1eb37d44` — RED gate (import errors for missing slim-launcher.ts module + WorkflowEntry.isLauncher missing) ✓
- `feat(06-03)` commit `9c315940` — GREEN gate (all 17 tests pass) ✓
- No REFACTOR gate needed (code is clean as written).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two-fenced-block rejection required interior check beyond lazy regex**
- **Found during:** Task 2, first test run
- **Issue:** The lazy `[\s\S]+?` regex matched from the opening `\`\`\`gsd-advisory` fence to the *second* block's closing ` ``` `, treating two concatenated blocks as a single valid block. The `trimmed !== m[0]` equality check did not catch this because the full trimmed content was exactly two blocks joined, which equalled the entire match.
- **Fix:** Added `if (/^```/m.test(inner)) return null;` after extracting the interior — any line starting with ` ``` ` in the captured YAML body indicates a second fenced block and triggers null return.
- **Files modified:** `sdk/src/compile/slim-launcher.ts`
- **Commit:** `9c315940` (same GREEN commit — fix was inline before committing)

**2. [Rule 3 - Blocking Issue] SDK dist rebuild required before baseline generation**
- **Found during:** Task 2, baseline verification — `isLauncher` absent from `workflow-coverage.json` after `--write`
- **Issue:** `node bin/gsd-sdk.js` runs from `sdk/dist/`, which was compiled from the pre-Plan-03 sources. The new `slim-launcher.ts` and `isLauncher` field were not reflected until the SDK was rebuilt.
- **Fix:** Ran `cd sdk && npm run build` before `node bin/gsd-sdk.js compile --write`. After rebuild, all 84 entries had `isLauncher: false`.
- **Files modified:** `sdk/src/generated/compile/workflow-coverage.json` (regenerated)
- **Commit:** `9c315940`

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| extractLauncherBlock correctly identifies single fenced gsd-advisory blocks | PASS |
| extractLauncherBlock rejects prose before/after, wrong info string, empty, two blocks | PASS |
| validateLauncherMetadata rejects hard-outlier commandIds | PASS |
| validateLauncherMetadata rejects missing fields | PASS |
| validateLauncherMetadata rejects mismatched workflowIds | PASS |
| WorkflowEntry.isLauncher is false for all 84 live workflow files | PASS |
| gsd-sdk compile exits zero with unchanged counts | PASS |
| gsd-sdk compile --check exits zero | PASS |
| No workflow Markdown files modified | PASS |
| slim-launcher.ts reuses parsePostureYaml from outlier-postures.ts | PASS |

## Known Stubs

None. All detection and validation machinery is fully wired. No launcher files exist yet in the live repo (all `isLauncher: false`), which is the expected state — Plan 03 implements detection only, not archive/slimming.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced. The SLIM-02 diagnostics include `filePath` values (accepted per T-06-03-04 — local developer tool). All threat register mitigations applied:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-06-03-01: hard-outlier commandId in launcher | `SEED_HARD_OUTLIERS.has(commandId)` check in `validateLauncherMetadata` |
| T-06-03-02: workflowId mismatch | `basename(filePath, '.md')` → expected workflowId comparison |
| T-06-03-03: catastrophic regex backtrack | Anchored regex + interior-fence check; prose files with no `gsd-advisory` fail initial match quickly |
| T-06-03-05: fake isLauncher via block in prose file | `extractLauncherBlock` requires block to be entire trimmed file content |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| sdk/src/compile/slim-launcher.ts exists | FOUND |
| sdk/src/compile/types.ts has LauncherMetadata | FOUND |
| sdk/src/compile/types.ts has isLauncher on WorkflowEntry | FOUND |
| sdk/src/compile/inventory/workflows.ts imports slim-launcher.ts | FOUND |
| sdk/src/generated/compile/workflow-coverage.json has 84 isLauncher entries | FOUND (84 matches) |
| RED commit 1eb37d44 exists | FOUND |
| GREEN commit 9c315940 exists | FOUND |
| 17 tests passing GREEN | CONFIRMED |
| gsd-sdk compile --check passes | CONFIRMED |
| No workflow .md files modified | CONFIRMED |
