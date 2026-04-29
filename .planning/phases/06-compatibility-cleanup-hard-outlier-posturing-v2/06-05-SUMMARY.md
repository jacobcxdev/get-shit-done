---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
plan: "05"
subsystem: slim-eligibility
tags: [slim-eligibility, pilot, BLOCKED, SLIM-01, SLIM-02, SLIM-03]
dependency_graph:
  requires:
    - phase: "06-04"
      provides: "conditional slim-eligibility CI gate in phase4-parity.cjs"
    - phase: "06-02"
      provides: "evaluateSlimEligibility evaluator and --check-slim-eligibility CLI flag"
    - phase: "06-01"
      provides: "hard-outlier posture records and OUTL-01 diagnostic"
  provides:
    - "Eligibility prefilter scan results for all 10 deterministic non-outlier candidates"
    - "BLOCKED pilot outcome recorded — no workflow .md files modified"
    - "sdk/package.json build fix: parity/ JSON files now copied to dist/"
  affects: ["future-slimming-phase"]
tech-stack:
  added: []
  patterns: ["fail-closed eligibility: indeterminate !== pass", "build script copy both compile/ and parity/ generated JSON"]
key-files:
  created: []
  modified:
    - sdk/package.json
key-decisions:
  - "Pilot is BLOCKED — all 10 deterministic non-outlier candidates return status:indeterminate; typed-transitions and packet-sequencing gates have no durable non-Markdown evidence sources"
  - "sdk/package.json copy:generated fixed to also copy parity/ JSON to dist/ — parity-coverage gate was failing with unreadable path before fix"
  - "Pre-existing SDK test failures (6 tests) are out of scope — confirmed pre-existing by stash comparison; not caused by this plan"
requirements-completed: [SLIM-01, SLIM-02, SLIM-03, OUTL-01, OUTL-02]
duration: 9min
completed: 2026-04-29
---

# Phase 6 Plan 05: Slim Eligibility Pilot Scan — BLOCKED Summary

**Eligibility prefilter scan ran against 10 deterministic non-outlier candidates; all returned status:indeterminate on typed-transitions and packet-sequencing gates — pilot BLOCKED, no workflow files modified, Phase 6 machinery complete**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-29T02:15:02Z
- **Completed:** 2026-04-29T02:24:00Z
- **Tasks:** 2 (Task 1 + Task 3 BLOCKED path)
- **Files modified:** 1 (sdk/package.json)

## Accomplishments

- Ran `gsd-sdk compile --check-slim-eligibility` for 10 top deterministic non-outlier candidates — all return `status: indeterminate`
- Confirmed hard-outlier `/workflows/fast` correctly rejected with `OUTL-01` diagnostic (posture path referenced)
- Fixed `sdk/package.json` `copy:generated` script to also copy `parity/` JSON files to `dist/` — this was blocking the parity-coverage gate at runtime
- Verified `node bin/gsd-sdk.js compile` exits 0, `node scripts/phase4-parity.cjs` exits 0 (all 10 steps pass)
- Verified `tests/workflow-compat.test.cjs`, `tests/commands-doc-parity.test.cjs`, `tests/workflow-size-budget.test.cjs` all pass (190 tests)
- No workflow `.md` files modified — `git diff get-shit-done/workflows/` is clean

## Eligibility Verdict Table

| workflowId | commandId | status | eligible | typed-transitions | packet-sequencing | provider-routing | parity-coverage |
|------------|-----------|--------|----------|-------------------|-------------------|-----------------|-----------------|
| /workflows/add-phase | /gsd-add-phase | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/pr-branch | /gsd-pr-branch | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/edit-phase | /gsd-edit-phase | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/insert-phase | /gsd-insert-phase | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/analyze-dependencies | /gsd-analyze-dependencies | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/audit-uat | /gsd-audit-uat | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/milestone-summary | /gsd-milestone-summary | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/plan-milestone-gaps | /gsd-plan-milestone-gaps | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/spike-wrap-up | /gsd-spike-wrap-up | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/extract_learnings | /gsd-extract_learnings | indeterminate | false | indeterminate | indeterminate | pass | pass |
| /workflows/fast (hard-outlier check) | /gsd-fast | fail | false | — | — | — | — |

**Gate legend:**
- `typed-transitions: indeterminate` — workflow semantic families are regex-inferred from Markdown prose; no durable structured transition source exists
- `packet-sequencing: indeterminate` — live compile has no packet sequence inventory; `WorkflowRunner.packetFor()` emits a generic packet, not a per-workflow step sequence
- `provider-routing: pass` — no `agentTypes` declared means "no provider-specific route required" is an explicit pass condition
- `parity-coverage: pass` — parity index has a `deterministic` tier entry for each candidate

## Pilot Outcome

**BLOCKED** — fail-closed policy per D-02: `indeterminate !== pass`. No workflow files were modified. No archive files were created.

The Phase 6 machinery is complete:
- Plans 01–02: Hard-outlier posture records (5 YAML files), slim eligibility evaluator, `--check-slim-eligibility` CLI flag, OUTL-01/SLIM-01 diagnostics
- Plan 03: Thin launcher validator (`validateLauncherMetadata`), `extractLauncherBlock` parser
- Plan 04: Conditional `slim-eligibility` step in `scripts/phase4-parity.cjs`
- Plan 05: Eligibility scan executed and recorded; pilot BLOCKED

**Path forward to unblock slimming:**

Slimming requires durable non-Markdown evidence for two gates:

1. **typed-transitions** — Needs a compiler-owned structured transition source (e.g., per-workflow FSM transition registry) that survives the removal of workflow prose. Currently only available as regex inference from Markdown body.

2. **packet-sequencing** — Needs a per-workflow packet sequence inventory collected during compile. Currently `collectPacketDefinitionCandidates()` receives no explicit candidates from the live compile path, so no sequence can be verified.

These are architectural additions, not quick fixes. They belong in a dedicated future phase that designs the durable evidence format, extends the compiler to collect it, and then re-runs eligibility.

## Task Commits

1. **Tasks 1 + 3 (BLOCKED path)** — `7b0022a3` (docs): Eligibility scan run, BLOCKED outcome recorded, sdk/package.json parity copy fix

## Files Created/Modified

- `sdk/package.json` — Fixed `copy:generated` to copy both `src/generated/compile/` and `src/generated/parity/` JSON files to `dist/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] sdk/package.json build script did not copy parity/ generated JSON to dist/**
- **Found during:** Task 1 (eligibility scan)
- **Issue:** `evaluateSlimEligibility` looks for `parity-workflow-index.json` at `sdk/dist/generated/parity/` at runtime, but the build script only copied `compile/` JSON files. The parity-coverage gate was returning `fail` with "parity-workflow-index.json is unreadable" before the fix.
- **Fix:** Extended `copy:generated` script to also call `copyDir` for `src/generated/parity/` → `dist/generated/parity/`
- **Files modified:** `sdk/package.json`
- **Verification:** Rebuilt SDK, confirmed `node -e` shows both `disposition-manifest.json` and `parity-workflow-index.json` in `dist/generated/parity/`. All eligibility runs then returned proper `indeterminate` (not `fail`) for parity-coverage.
- **Committed in:** `7b0022a3`

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking build issue)
**Impact on plan:** Required for correct eligibility gate evaluation. The parity-coverage gate would have reported spurious `fail` instead of the correct `pass` without this fix. No scope creep.

## Issues Encountered

- `ls` output for directories containing tracked git files appeared empty (RTK filtering behavior in worktree). All file existence was verified via `node -e` and `git ls-files` instead.

## Known Stubs

None — this plan produces no user-facing output (pilot is BLOCKED).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The `sdk/package.json` change only affects the build copy script.

## Deferred Items

Pre-existing SDK test failures (6 tests — not caused by this plan):
- `src/compile/compiler.test.ts` — OUTL-01 diagnostics emitted for empty corpus (pre-existing assertion gap)
- `src/init-runner.test.ts` — init step sequencing drift
- `src/query/decomposed-handlers.test.ts` — agentSkills query result
- `src/init-e2e.integration.test.ts` — InitRunner bootstrap
- `src/golden/read-only-parity.integration.test.ts` — audit-open golden parity
- `src/golden/golden.integration.test.ts` — golden file test

These were confirmed pre-existing by running the test suite before and after reverting the `sdk/package.json` change (git stash comparison). They are tracked for a future cleanup phase.

## Self-Check: PASSED

- [x] Eligibility scan executed for 10 candidates — all `indeterminate`
- [x] Hard-outlier `/workflows/fast` returns `fail` with OUTL-01 (exit code 1)
- [x] `node bin/gsd-sdk.js compile` exits 0 (86 commands, 84 workflows, 33 agents, 11 hooks, 5 outliers)
- [x] `node scripts/phase4-parity.cjs` exits 0 — all 10 gate steps pass
- [x] `node --test tests/workflow-compat.test.cjs tests/commands-doc-parity.test.cjs tests/workflow-size-budget.test.cjs` exits 0 (190 tests pass)
- [x] `git diff get-shit-done/workflows/` is clean — no workflow .md files modified
- [x] 5 posture YAML files confirmed via `git ls-files sdk/src/advisory/outlier-postures/`
- [x] Task commit `7b0022a3` exists in git log
- [x] No unexpected deletions in commit

## Next Phase Readiness

Phase 6 is complete. All machinery (Plans 01–05) delivered:
- Hard-outlier posture records registered and compiler-visible
- Slim eligibility evaluator with fail-closed gate logic
- Thin launcher validator
- Conditional CI gate in phase4-parity.cjs
- Eligibility scan documented with BLOCKED outcome

Slimming is blocked until a future phase adds durable non-Markdown evidence for `typed-transitions` and `packet-sequencing` gates.

---
*Phase: 06-compatibility-cleanup-hard-outlier-posturing-v2*
*Completed: 2026-04-29*
