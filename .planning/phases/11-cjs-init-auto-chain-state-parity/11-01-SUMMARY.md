---
phase: 11-cjs-init-auto-chain-state-parity
plan: "01"
subsystem: testing
tags: [cjs, init, fsm, auto-chain, workstream, state-parity]

requires:
  - phase: 02-packet-schema-state-contracts
    provides: FSM run-state schema with autoMode.active/source fields
  - phase: 08-fsm-migration-control-event-read-path
    provides: FSM state write path and check-auto-mode SDK predicate

provides:
  - readFsmAutoChainActiveSync helper in CJS init that mirrors SDK check.auto-mode predicate
  - FSM-sourced auto_chain_active field in init plan-phase output (closes STAT-04 gap)
  - 8-case regression suite covering D-10, D-06, D-07/D-08, and D-11 static guard

affects: [phase-11, gsd-execute-phase, gsd-plan-phase, workflows]

tech-stack:
  added: []
  patterns:
    - "Fail-closed FSM reads: missing file returns false, malformed JSON returns false with stderr warning"
    - "planningDir(cwd) auto-resolves GSD_WORKSTREAM — no explicit workstream threading needed"
    - "Static D-11 guard: scan non-comment lines for both literal and join-reconstruction patterns"

key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/init.cjs
    - tests/init.test.cjs
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Use planningDir(cwd) with no explicit workstream arg — it reads GSD_WORKSTREAM automatically, matching the same mechanism gsd-tools.cjs sets before dispatch"
  - "Fail closed on malformed FSM JSON with stderr warning rather than silently returning false with no signal"
  - "Remove the entire rawConfig block rather than leaving a dead read; no residual config.json read of workflow.* in cmdInitPlanPhase"

patterns-established:
  - "D-11 static guard: filter comment lines, check both literal key and whitespace-collapsed join pattern — catches computed reconstructions the SDK scan misses"

requirements-completed: [STAT-03, STAT-04, RNNR-02]

duration: 12min
completed: "2026-04-30"
---

# Phase 11 Plan 01: CJS Init Auto-Chain State Parity Summary

**FSM-sourced `auto_chain_active` in CJS init plan-phase: legacy `rawConfig`/`legacyAutoChainKey` block removed and replaced with `readFsmAutoChainActiveSync()` that reads `.planning/fsm-state.json` (or workstream-scoped path) via `planningDir(cwd)`, mirroring the SDK `check.auto-mode` predicate exactly**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-30T02:22:00Z
- **Completed:** 2026-04-30T02:34:13Z
- **Tasks:** 2
- **Files modified:** 2 (plus REQUIREMENTS.md)

## Accomplishments
- Added `readFsmAutoChainActiveSync(cwd)` helper immediately before `cmdInitPlanPhase`; uses `planningDir(cwd)` which auto-resolves `GSD_WORKSTREAM` for workstream-scoped reads without any signature change to `cmdInitPlanPhase`
- Removed the 4-line legacy rawConfig block (`rawConfigPath`, `rawConfig`, try/catch read, `legacyAutoChainKey` join construction) and replaced the `auto_chain_active` assignment with a single `readFsmAutoChainActiveSync(cwd)` call
- Replaced the single legacy-positive test (line 1477) with 8 STAT-04 regression cases nested in `#STAT-04 gap closure` sub-describe; all 94 init tests and 5686 total npm test suite tests pass

## Task Commits

1. **Task 1 + Task 2: FSM derivation + regression suite** - `baa16268` (feat)

## Files Created/Modified
- `get-shit-done/bin/lib/init.cjs` — added `readFsmAutoChainActiveSync`, removed legacy rawConfig block, updated `auto_chain_active` assignment
- `tests/init.test.cjs` — replaced legacy-positive test with 8-case STAT-04 regression suite
- `.planning/REQUIREMENTS.md` — marked STAT-04 checkbox `[x]` and traceability row as Complete

## Decisions Made
- `planningDir(cwd)` is called with no explicit workstream argument: it reads `GSD_WORKSTREAM` from `process.env` automatically (core.cjs:882–883), which `gsd-tools.cjs` sets at lines 292–293 before dispatching to `cmdInitPlanPhase`. No signature change needed.
- Fail closed on malformed FSM: `process.stderr.write` warning emitted so operators have a signal; returning false without a warning would make silent data corruption harder to detect (T-11-05: path info only, no secrets).
- The entire rawConfig block is deleted (not just the `legacyAutoChainKey` line) so no dead `config.json` read of `workflow.*` remains in `cmdInitPlanPhase`.

## Deviations from Plan

None - plan executed exactly as written. Both tasks were committed together as one atomic commit since they form a single logical change (production fix + proof tests must move together).

## Issues Encountered

None. The BSD `grep -c` exit code 1 when count is 0 required running each gate individually rather than chained with `&&`, but this was a shell compatibility issue in verification only — no code changes required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 11 is complete. STAT-04 is the last open v1.0 requirement:
- `auto_chain_active` in `init plan-phase` now derives exclusively from FSM state
- The D-11 static guard is persistent — future edits to `init.cjs` that reintroduce the legacy pattern will be caught immediately by `npm test`
- The SDK `check-auto-mode.test.ts` guard also continues to scan `get-shit-done/bin/lib/` for the literal key, providing a second layer

---
*Phase: 11-cjs-init-auto-chain-state-parity*
*Completed: 2026-04-30*

## Self-Check: PASSED

- `get-shit-done/bin/lib/init.cjs` exists and contains `readFsmAutoChainActiveSync` (2 occurrences)
- `tests/init.test.cjs` contains `STAT-04 gap closure` (1 occurrence)
- Commit `baa16268` exists in git log
- `legacyAutoChainKey` count in non-comment init.cjs lines: 0
- `rawConfig` count in non-comment init.cjs lines: 0
- npm test: 5686 pass, 0 fail
