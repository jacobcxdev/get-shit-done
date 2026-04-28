---
phase: 03-advisory-runner-query-integration
plan: 03-08-provider-fallback-confidence
subsystem: advisory-runner
tags: [typescript, vitest, provider-fallback, fsm, query-registry]

requires:
  - phase: 03-advisory-runner-query-integration
    provides: FSM transition events, query aliases, WorkflowRunner core, PhaseRunner/InitRunner advisory defaults
provides:
  - Provider availability and stable confidence derivation helpers
  - Atomic provider confidence metadata on FSM transition history
  - `fsm.confidence` derived from durable history
  - WorkflowRunner reduced-confidence and mandatory-provider dispatch semantics
affects: [phase-03-advisory-runner, provider-fallback, fsm-state, query-registry, workflow-runner]

tech-stack:
  added: []
  patterns:
    - Provider status checks use injected `ProviderStatusSource` only
    - `fsm.confidence` derives confidence from transition history without live provider checks
    - WorkflowRunner packet results preserve provider metadata for runtime transition reporting

key-files:
  created:
    - sdk/src/advisory/provider-availability.ts
    - .planning/phases/03-advisory-runner-query-integration/03-08-SUMMARY.md
  modified:
    - sdk/src/advisory/provider-confidence.test.ts
    - sdk/src/advisory/workflow-runner.test.ts
    - sdk/src/advisory/workflow-runner.ts
    - sdk/src/advisory/fsm-state.ts
    - sdk/src/query/fsm-state.test.ts
    - sdk/src/query/fsm-state.ts
    - sdk/src/query/index.ts
    - sdk/src/types.ts
    - sdk/src/phase-runner.ts
    - sdk/src/init-runner.ts
    - sdk/src/index.ts
    - sdk/src/cli.ts

key-decisions:
  - "Provider confidence strings remain `full`, `reduced:<providers>`, or `blocked:<providers>` with provider lists normalized as claude, codex, gemini."
  - "The default provider availability path exports no production status source in this phase; tests inject ProviderStatusSource."
  - "FSM provider metadata is persisted on the same transition history entry as the state transition."

patterns-established:
  - "Provider fallback metadata is typed as `providerConfidence` plus `missingProviders`, with legacy `missingProvider` retained."
  - "Reduced-confidence dispatch returns a packet plus provider metadata; mandatory provider loss returns a typed dispatch error."

requirements-completed: [RNNR-10, PROV-01, PROV-02, PROV-03, PROV-04, LOGG-02]

duration: 11 min
completed: 2026-04-28T02:39:16Z
---

# Phase 3 Plan 03-08: Provider Fallback Confidence Summary

**Provider exhaustion now records typed reduced-confidence FSM history and exposes durable run confidence without live provider probes**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-28T02:27:27Z
- **Completed:** 2026-04-28T02:39:16Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added provider availability helpers for stable provider ordering, injected status checks, and history-derived confidence strings.
- Extended FSM transitions so reduced/blocked provider metadata is written atomically with transition history.
- Updated `fsm.confidence` to derive confidence from durable history only.
- Added WorkflowRunner semantics for reduced-confidence packet dispatch and mandatory-provider blocking.
- Preserved provider metadata on PhaseRunner and InitRunner step results for runtime transition reporting.

## Task Commits

1. **Task 1 RED: Confirm provider confidence tests fail** - `69c5251` (test)
2. **Task 2 GREEN: Implement provider availability and atomic confidence metadata** - `5e6eb08` (feat)
3. **Task 3 REFACTOR: Build and prove provider fallback has no live model calls** - `faea676` (test)

## RED / GREEN / REFACTOR

- **RED:** Added missing coverage for atomic reduced provider metadata on `fsm.transition` and WorkflowRunner optional/mandatory provider paths. Focused tests failed on missing provider module and missing fallback semantics.
- **GREEN:** Implemented `provider-availability.ts`, transition metadata persistence, `fsm.confidence`, runner provider metadata, and public step-result preservation.
- **REFACTOR:** Documented that no production provider source is exported in this phase and added a test locking the injected-source boundary.

## Files Created/Modified

- `sdk/src/advisory/provider-availability.ts` - Provider names, availability checks, confidence rendering, and history derivation.
- `sdk/src/advisory/provider-confidence.test.ts` - Provider confidence and injection-boundary tests.
- `sdk/src/advisory/workflow-runner.ts` - Optional provider loss produces reduced metadata; mandatory loss returns typed dispatch error.
- `sdk/src/advisory/workflow-runner.test.ts` - Runner provider fallback tests.
- `sdk/src/advisory/fsm-state.ts` - Atomic provider confidence metadata on transition entries.
- `sdk/src/query/fsm-state.ts` - Provider metadata parsing and `fsm.confidence` history derivation.
- `sdk/src/query/fsm-state.test.ts` - Atomic transition metadata and confidence query coverage.
- `sdk/src/query/index.ts` - Transition events include provider confidence when present.
- `sdk/src/types.ts` - Step result and FSM event provider metadata typing.
- `sdk/src/phase-runner.ts`, `sdk/src/init-runner.ts`, `sdk/src/index.ts`, `sdk/src/cli.ts` - Provider metadata preservation and public surfacing.

## Verification

- `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk exec -- vitest run --project unit src/advisory/provider-confidence.test.ts src/query/fsm-state.test.ts src/advisory/workflow-runner.test.ts` - PASSED, 3 files / 33 tests.
- `npm --prefix sdk run build` - PASSED.
- Acceptance greps for provider helper exports, FSM metadata fields, runner metadata propagation, `fsm.confidence` aliases, and provider source exclusions - PASSED.

## Decisions Made

- Kept production provider probing out of Phase 3; the provider availability abstraction is injectable and does not import Agent SDK or call model APIs.
- Preserved legacy `missingProvider` while adding ordered `missingProviders` and `providerConfidence`.
- Used JSON metadata as the public `fsm.transition` provider metadata argument so query dispatch remains string-argv compatible.

## Deviations from Plan

None - plan scope executed as written. The implementation followed the "no production source" branch from Task 3.

## Issues Encountered

- The exact bare command `npm --prefix sdk exec -- vitest ...` still fails before test collection because root `vitest.config.ts` cannot resolve `vitest/config` without `NODE_PATH=$PWD/sdk/node_modules`. This matches earlier Phase 3 summaries; the focused suite passes with the established environment workaround.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `03-09-PLAN.md`. Provider fallback and confidence semantics are now typed, durable, and query-visible for the remaining Phase 3 runtime contract work.

## Self-Check: PASSED

- Confirmed task commits exist: `69c5251`, `5e6eb08`, `faea676`.
- Confirmed focused provider/FSM/runner tests pass.
- Confirmed SDK build passes.
- Confirmed provider availability module contains no Agent SDK import or `query(` call.
- Confirmed `.planning/phases/03-advisory-runner-query-integration/03-08-SUMMARY.md` exists.

---
*Phase: 03-advisory-runner-query-integration*
*Completed: 2026-04-28*
