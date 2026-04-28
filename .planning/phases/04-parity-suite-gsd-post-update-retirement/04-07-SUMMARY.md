---
phase: 04-parity-suite-gsd-post-update-retirement
plan: 04-07
title: "Wave 3 — Hermetic Phase 4 Gate Script and CI Integration"
status: COMPLETE
subsystem: testing
tags: [parity, ci, hermetic, network-blocking, retirement]

requires:
  - phase: 04-04
    provides: hook build and install regression coverage
  - phase: 04-06
    provides: Phase 4 parity suite with no skip/todo markers
provides:
  - Hermetic Node network blocker preload for Phase 4 parity commands
  - Canonical scripts/phase4-parity.cjs runner for all named Phase 4 gates
  - Root npm script and CI step for the Phase 4 parity gate
affects: [phase4-parity, ci, retirement-scan, offline-scan]

tech-stack:
  added: []
  patterns:
    - Node CommonJS gate scripts using execFileSync fail-fast diagnostics
    - Explicit-surface offline and retirement scanners

key-files:
  created:
    - scripts/block-network.cjs
    - scripts/phase4-parity.cjs
    - .planning/phases/04-parity-suite-gsd-post-update-retirement/04-07-SUMMARY.md
  modified:
    - package.json
    - .github/workflows/test.yml

key-decisions:
  - "Construct scanner sentinel strings from pieces inside phase4-parity.cjs so scripts/ self-scanning does not fail on the gate's own forbidden-string definitions."
  - "Use node scripts/phase4-parity.cjs directly in CI after build:sdk, matching the plan's unambiguous log-step requirement."

patterns-established:
  - "Phase 4 parity gates are runnable through one canonical script with named --step targets."
  - "The parity suite runs with NODE_OPTIONS preloading scripts/block-network.cjs for hermetic network blocking."

requirements-completed: [PRTY-06, PRTY-07, PRTY-08, HOOK-06, UPDT-05]

duration: 4 min
completed: 2026-04-28
---

# Phase 4 Plan 04-07: Wave 3 — Hermetic Phase 4 Gate Script and CI Integration Summary

**Status: COMPLETE — Phase 4 now has a canonical hermetic parity gate runner with CI integration.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-28T21:44:46Z
- **Completed:** 2026-04-28T21:48:06Z
- **Tasks:** 3 completed
- **Files modified:** 4 plan files plus this summary

## Accomplishments

- Created `scripts/block-network.cjs` to block Node core network primitives and global fetch with `[PRTY-07]` diagnostics.
- Created `scripts/phase4-parity.cjs` with all named Phase 4 gate steps: `wave0-hardening`, `hook-build`, `hook-install-tests`, `sdk-compile-check`, `staleness-gate`, `parity-suite`, `skip-ban`, `offline-scan`, and `retirement-scan`.
- Added `phase4:parity` to `package.json` and a `Phase 4 parity gate` CI step after `build:sdk`.

## Task Commits

Each task was committed atomically:

1. **T1: Create scripts/block-network.cjs** - `78f08b4e` (feat)
2. **T2: Create scripts/phase4-parity.cjs** - `6c6cf062` (feat)
3. **T3: Add npm script and CI gate step** - `31bcebc5` (feat)

## Files Created/Modified

- `scripts/block-network.cjs` - Node preload network blocker for Phase 4 parity commands.
- `scripts/phase4-parity.cjs` - Canonical named-step Phase 4 parity gate runner.
- `package.json` - Added `phase4:parity`.
- `.github/workflows/test.yml` - Added `Phase 4 parity gate` after SDK build.

## Verification Results

- `node scripts/phase4-parity.cjs --step skip-ban` - passed with `[PRTY-08] PASS: skip-ban`.
- `node scripts/phase4-parity.cjs --step offline-scan` - passed with `[PRTY-07] PASS: offline-scan`.
- `node scripts/phase4-parity.cjs --step retirement-scan` - passed with `[UPDT-05] PASS: retirement-scan`.

## Acceptance Criteria Status

- **04-07-T1:** PASS
- **04-07-T2:** PASS
- **04-07-T3:** PASS
- **Plan verification:** PASS

## Decisions Made

- Kept the planned scanner surfaces, including `scripts/`, and made the gate script self-scan cleanly by constructing forbidden host and retired-bin sentinel strings from pieces.
- Used `node scripts/phase4-parity.cjs` directly in CI instead of `npm run phase4:parity`, as required by the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoided self-scan false positives in phase4-parity.cjs**

- **Found during:** Task 04-07-T2 (Phase 4 parity gate runner)
- **Issue:** The plan's scanner script scans the full `scripts/` directory while also containing literal forbidden host strings and literal retired-bin references inside `scripts/phase4-parity.cjs`; that would make `offline-scan` and `retirement-scan` fail on the gate script itself.
- **Fix:** Preserved the same runtime sentinel values but constructed them from string pieces in the gate script.
- **Files modified:** `scripts/phase4-parity.cjs`
- **Verification:** `node scripts/phase4-parity.cjs --step offline-scan` and `node scripts/phase4-parity.cjs --step retirement-scan` both passed.
- **Committed in:** `6c6cf062`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The planned scanner coverage remains intact, and the required verification commands pass without weakening the explicit scan surfaces.

## Issues Encountered

- `RTK.md` was referenced by `AGENTS.md` but does not exist under the repo root or parent directory search path; execution continued with the GSD/project files provided in the prompt.
- Existing unrelated modified and untracked files were present before execution and were not staged or modified for these task commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 04-07 is ready for downstream Phase 4 work. The parity gate can now be run locally with `npm run phase4:parity`, targeted with `node scripts/phase4-parity.cjs --step <name>`, and enforced in CI after `build:sdk`.

## Self-Check: PASSED

- Created files exist on disk: `scripts/block-network.cjs`, `scripts/phase4-parity.cjs`.
- Modified files contain the expected integration points: `phase4:parity` in `package.json` and `Phase 4 parity gate` in `.github/workflows/test.yml`.
- Task commits exist: `78f08b4e`, `6c6cf062`, `31bcebc5`.
- Required plan verification commands passed.

---
*Phase: 04-parity-suite-gsd-post-update-retirement*
*Completed: 2026-04-28*
