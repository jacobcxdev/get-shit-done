---
phase: 04-parity-suite-gsd-post-update-retirement
plan: 10
subsystem: parity
tags: [phase4, parity, retirement, gsd-post-update, tombstone]

requires:
  - phase: 04-parity-suite-gsd-post-update-retirement
    provides: Plans 04-01 through 04-09 completed parity, hook, disposition, and retirement gates
provides:
  - Path B retirement-by-absence record for gsd-post-update
  - Static tombstone-or-absence parity tests
  - Final Phase 4 validation evidence
  - Green nine-step Phase 4 parity gate
affects: [phase4-parity, gsd-post-update-retirement, generated-parity-fixtures]

tech-stack:
  added: [tsx devDependency in sdk]
  patterns: [static retirement inspection, generator-first disposition updates, explicit dynamic branch ids]

key-files:
  created:
    - .planning/phases/04-parity-suite-gsd-post-update-retirement/04-10-SUMMARY.md
  modified:
    - .planning/phases/04-parity-suite-gsd-post-update-retirement/04-VALIDATION.md
    - scripts/phase4-parity.cjs
    - sdk/package.json
    - sdk/package-lock.json
    - sdk/src/compile/workflow-semantics.ts
    - sdk/src/compile/workflow-semantics.test.ts
    - sdk/src/generated/compile/workflow-coverage.json
    - sdk/src/generated/compile/workflow-semantics.json
    - sdk/src/generated/parity/disposition-manifest.json
    - sdk/src/generated/parity/parity-workflow-index.json
    - sdk/src/parity/behaviour-inventory.json
    - sdk/src/parity/retirement-gate.test.ts

key-decisions:
  - "Path B was taken: no repo-owned gsd-post-update bin entry or get-shit-done/bin entrypoint exists."
  - "Retirement is recorded through the behaviour inventory source of truth and regenerated disposition manifest, not by creating a new public command."
  - "Tombstone/absence parity coverage uses static source and manifest inspection only."

patterns-established:
  - "Retired command references in generator source must use structural scanner allowlists rather than broad string exemptions."
  - "Dynamic-branch workflows need explicit branchIds before Phase 4 parity can pass."

requirements-completed:
  - UPDT-01
  - UPDT-02
  - UPDT-03
  - UPDT-04
  - UPDT-05
  - HOOK-01
  - HOOK-02
  - HOOK-03
  - HOOK-04
  - HOOK-05
  - HOOK-06
  - PRTY-01
  - PRTY-02
  - PRTY-03
  - PRTY-04
  - PRTY-05
  - PRTY-06
  - PRTY-07
  - PRTY-08

duration: 72 min
completed: 2026-04-28
---

# Phase 4 Plan 10: Wave 5 — gsd-post-update Tombstone Stub and Final Retirement Declaration Summary

**gsd-post-update retired by absence, with generator-backed disposition evidence, static parity tests, and all Phase 4 gates green**

## Performance

- **Duration:** 72 min
- **Started:** 2026-04-28T22:09:34Z
- **Completed:** 2026-04-28T22:21:42Z
- **Tasks:** 4 completed
- **Files modified:** 12

## Accomplishments

- Took **Path B**: no repo-owned `gsd-post-update` package bin or `get-shit-done/bin/gsd-post-update*` entrypoint exists.
- Added `UPDT-B-RETIREMENT` to `sdk/src/parity/behaviour-inventory.json` and regenerated `disposition-manifest.json` with `retirementStatus: "unblocked"`.
- Added static-only tombstone/absence parity tests without invoking the retired command.
- Completed final Phase 4 validation evidence in `04-VALIDATION.md`.

## Task Commits

Each task was committed atomically:

1. **04-10-T1: Locate entrypoint and record absence** - `009c2e06` (feat)
2. **04-10-T2: Add static tombstone/absence parity tests** - `b0150729` (test)
3. **04-10-T3: Run and fix final Phase 4 parity gate** - `8c73544c` (fix)
4. **04-10-T4: Update validation evidence** - `c3e81e3f` (docs)

**Plan metadata:** pending final summary commit

## Files Created/Modified

- `.planning/phases/04-parity-suite-gsd-post-update-retirement/04-VALIDATION.md` - Final Phase 4 validation evidence and sign-off.
- `sdk/src/parity/behaviour-inventory.json` - Source-of-truth Path B retirement record.
- `sdk/src/generated/parity/disposition-manifest.json` - Regenerated disposition manifest with `UPDT-B-RETIREMENT`.
- `sdk/src/parity/retirement-gate.test.ts` - Static tombstone-or-absence parity tests.
- `scripts/phase4-parity.cjs` - Structural scanner allowlist for generator-source `absorptionCommand`.
- `sdk/src/compile/workflow-semantics.ts` - Explicit `/workflows/explore` branch IDs for dynamic-branch parity.
- `sdk/src/compile/workflow-semantics.test.ts` - Regression test for `/workflows/explore` branch IDs.
- `sdk/src/generated/compile/workflow-coverage.json` - Regenerated compile fixture.
- `sdk/src/generated/compile/workflow-semantics.json` - Regenerated compile fixture.
- `sdk/src/generated/parity/parity-workflow-index.json` - Regenerated parity fixture.
- `sdk/package.json` and `sdk/package-lock.json` - Declared `tsx` devDependency required by the local staleness gate.

## Decisions Made

- Path B was used because both packaging reachability checks returned `NONE`.
- No tombstone file or package bin entry was created, preserving the plan's "do not create a new public command" requirement.
- The scanner fix stayed structural by allowing the `absorptionCommand` field only, rather than broad retired-command phrases.

## Verification

Final required command:

```text
npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs
```

Phase 4 parity runner output, all 9 steps:

```text
[PRTY-08] PASS: wave0-hardening
[HOOK-02] PASS: hook-build
[HOOK-01] PASS: hook-install-tests
[PRTY-02] PASS: sdk-compile-check
[PRTY-06] PASS: staleness-gate
[PRTY-01] PASS: parity-suite
[PRTY-08] PASS: skip-ban
[PRTY-07] PASS: offline-scan
[UPDT-05] PASS: retirement-scan
[PRTY-08] All Phase 4 parity gates PASSED
```

Standalone parity test command:

```text
cd sdk && npx vitest run src/parity/
```

Vitest result:

```text
Test Files  9 passed (9)
Tests  567 passed (567)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Allowed generator-source absorptionCommand lines in retirement scans**
- **Found during:** Task 1
- **Issue:** The Path B source-of-truth entry prescribed by the plan includes an `absorptionCommand` containing `gsd-post-update`; existing scanners allowed generated `evidenceCheck` fields but not generator-source `absorptionCommand` fields.
- **Fix:** Added a narrow structural allowlist for `absorptionCommand` to `sdk/src/parity/retirement-gate.test.ts` and `scripts/phase4-parity.cjs`.
- **Verification:** `cd sdk && npx vitest run src/parity/retirement-gate.test.ts`; `node scripts/phase4-parity.cjs --step retirement-scan`.
- **Committed in:** `009c2e06`.

**2. [Rule 3 - Blocking] Declared `/workflows/explore` branch IDs for final compile parity**
- **Found during:** Task 3
- **Issue:** The final `sdk-compile-check` gate failed because `/workflows/explore` was classified as `dynamic-branch` but had no semantic `branchIds`.
- **Fix:** Added explicit `explore:*` branch IDs in workflow semantic inference, added a regression test, and regenerated compile/parity fixtures.
- **Verification:** `cd sdk && npx vitest run src/compile/workflow-semantics.test.ts`; full Phase 4 parity gate.
- **Committed in:** `8c73544c`.

**3. [Rule 3 - Blocking] Declared SDK-local tsx dependency for staleness gate**
- **Found during:** Task 3
- **Issue:** `npm run build:sdk` runs `npm ci` inside `sdk`, then the staleness gate invokes `sdk/node_modules/.bin/tsx`; `tsx` was not declared in `sdk/package.json`.
- **Fix:** Added `tsx` to SDK devDependencies and committed the lockfile update.
- **Verification:** full Phase 4 parity gate.
- **Committed in:** `8c73544c`.

---

**Total deviations:** 3 auto-fixed (3 blocking).
**Impact on plan:** All fixes were necessary for the exact required gates to pass. No public `gsd-post-update` command was introduced.

## Issues Encountered

- The global `gsd-sdk query` command available on PATH was an older/different CLI shape and did not support the query commands referenced by the executor docs. Execution continued using the plan's explicit commands and normal git commits.
- `npm run build:sdk` reports 2 npm audit findings from the existing dependency tree. This did not block the requested gates.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, schema changes, or trust-boundary file access patterns were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 parity gates are green and `gsd-post-update` retirement is declared by absence. The project is ready for the next planned phase after Phase 4 handoff.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/04-parity-suite-gsd-post-update-retirement/04-10-SUMMARY.md`
- Commit hashes found: `009c2e06`, `b0150729`, `8c73544c`, `c3e81e3f`
- Stub scan found no blocking stubs. Matches were intentional empty arrays in compiler/test scaffolding and the retirement test's split `TO${'DO'}` placeholder detector.
- Threat surface scan found no new network endpoints, auth paths, schema changes, or trust-boundary file access patterns.

---
*Phase: 04-parity-suite-gsd-post-update-retirement*
*Completed: 2026-04-28*
