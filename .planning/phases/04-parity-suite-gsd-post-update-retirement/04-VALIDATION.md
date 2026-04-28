---
phase: 4
slug: parity-suite-gsd-post-update-retirement
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-28
completed: 2026-04-28T22:19:44Z
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest / npm script gates |
| **Config file** | `sdk/vitest.config.ts` and package script surfaces |
| **Quick run command** | `cd sdk && npx vitest run src/parity/` |
| **Full suite command** | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` |
| **Estimated runtime** | ~30 seconds observed for Phase 4 gate + standalone parity run |

---

## Sampling Rate

- **After every task commit:** focused task acceptance command(s)
- **After every plan wave:** `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs`
- **Before `/gsd-verify-work`:** Full Phase 4 parity gate must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-W0-01 | Wave 0 | 0 | RNNR/PRTY trust boundary carry-forward | T-4-01 | Undeclared runtime report agents fail closed without FSM advance | unit/integration | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[PRTY-08] PASS: wave0-hardening` | ✅ W0 | ✅ green |
| 4-W0-02 | Wave 0 | 0 | PRTY trust boundary carry-forward | T-4-02 | Missing `packet.expectedEvidence` blocks completion with typed event | unit/integration | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[PRTY-08] PASS: wave0-hardening` | ✅ W0 | ✅ green |
| 4-W0-03 | Wave 0 | 0 | PRTY trust boundary carry-forward | T-4-03 | `init-required` and skipped transition history fail closed outside explicit test bypass | unit/integration | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[PRTY-08] PASS: wave0-hardening` | ✅ W0 | ✅ green |
| 4-W0-04 | Wave 0 | 0 | PROV/PRTY trust boundary carry-forward | T-4-04 | Mandatory provider omissions are derived from packet metadata and block execution | unit/integration | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[PRTY-08] PASS: wave0-hardening` | ✅ W0 | ✅ green |
| 4-W0-05 | Wave 0 | 0 | CLSS/PRTY trust boundary carry-forward | T-4-05 | Unknown, absent, or empty dynamic `branchId` fails strictly | unit/integration | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[PRTY-08] PASS: wave0-hardening`; compile fix also verified `/workflows/explore` branch IDs | ✅ W0 | ✅ green |
| 4-HOOK-01 | Hook absorption | 1 | HOOK-01–HOOK-06 | T-4-06 | Hook build/install paths are repo-contained, fresh, executable, and offline | unit/integration/build | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[HOOK-02] PASS: hook-build`, `[HOOK-01] PASS: hook-install-tests` | ✅ W0 | ✅ green |
| 4-PRTY-01 | Parity fixtures | 2 | PRTY-01–PRTY-08 | T-4-07 | Generated fixtures cover deterministic, dynamic, HITL, and hard-outlier workflows without hand-authored goldens | parity/staleness | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[PRTY-06] PASS: staleness-gate`, `[PRTY-01] PASS: parity-suite`, `[PRTY-08] PASS: skip-ban`, `[PRTY-07] PASS: offline-scan` | ✅ W0 | ✅ green |
| 4-UPDT-01 | Retirement gate | 3 | UPDT-01–UPDT-05 | T-4-08 | Every audited `gsd-post-update` behaviour has automated disposition evidence and no executable invocation | parity/static scan | `npm run build:hooks && npm run build:sdk && node scripts/phase4-parity.cjs` at `2026-04-28T22:19:44Z`; output: `[UPDT-05] PASS: retirement-scan`, `[PRTY-08] All Phase 4 parity gates PASSED` | ✅ W0 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Runtime report actor validation tests for undeclared agents and reserved report modes. Evidence: `wave0-hardening` PASS.
- [x] Expected-evidence enforcement tests covering completion markers and artefact evidence. Evidence: `wave0-hardening` PASS.
- [x] PhaseRunner fail-closed tests for `init-required` and skipped transition history, with any no-FSM bypass restricted to explicit test-only wiring. Evidence: `wave0-hardening` PASS.
- [x] Mandatory-provider metadata derivation and runner enforcement tests. Evidence: `wave0-hardening` PASS.
- [x] Dynamic branch validation tests for unknown, absent, and empty `branchId` values. Evidence: `wave0-hardening` PASS and `/workflows/explore` compile branch IDs.
- [x] Live-code audit of `.plans/1755-install-audit-fix.md` against `bin/install.js` and `scripts/build-hooks.js` before hook edits. Evidence: `hook-install-tests` PASS.
- [x] Hook install/build regression tests for Codex hook paths, `.sh` uninstall coverage, stale cache refresh, executable permissions, and no network fetches. Evidence: `hook-build`, `hook-install-tests`, and `offline-scan` PASS.
- [x] Phase 4 parity gate script stubs for Wave 0 hardening, hook build, hook tests, compile check, staleness diff, parity suite, offline scan, and retirement scan. Evidence: all 9 gate steps PASS.

---

## Manual-Only Verifications

None - all phase behaviours have automated verification. Off-repo runtime/configuration behaviours are represented by repo-contained schema proxies or disposition evidence.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] Nyquist compliance flag set in frontmatter

**Approval:** passed — all Phase 4 gates green at 2026-04-28T22:19:44Z

---

## Gate Run Evidence

### Build Hooks

Command: `npm run build:hooks`

```text
> get-shit-done-cc@1.38.5 build:hooks
> node scripts/build-hooks.js

✓ Copying gsd-check-update-worker.js...
✓ Copying gsd-check-update.js...
✓ Copying gsd-context-monitor.js...
✓ Copying gsd-prompt-guard.js...
✓ Copying gsd-read-guard.js...
✓ Copying gsd-read-injection-scanner.js...
✓ Copying gsd-statusline.js...
✓ Copying gsd-workflow-guard.js...
✓ Copying gsd-session-state.sh...
✓ Copying gsd-validate-commit.sh...
✓ Copying gsd-phase-boundary.sh...

Build complete.
```

### Build SDK

Command: `npm run build:sdk`

```text
> get-shit-done-cc@1.38.5 build:sdk
> cd sdk && npm ci && npm run build

added 63 packages, and audited 64 packages in 7s

20 packages are looking for funding
  run `npm fund` for details

2 vulnerabilities (1 moderate, 1 high)

To address all issues, run:
  npm audit fix

Run `npm audit` for details.

> @gsd-build/sdk@0.1.0 build
> tsc && npm run copy:generated

> @gsd-build/sdk@0.1.0 copy:generated
> node -e "const fs=require('node:fs'); const path=require('node:path'); const src=path.join('src','generated','compile'); const dst=path.join('dist','generated','compile'); if (fs.existsSync(src)) { fs.mkdirSync(dst,{recursive:true}); for (const f of fs.readdirSync(src)) if (f.endsWith('.json')) fs.copyFileSync(path.join(src,f), path.join(dst,f)); }"
```

### Phase 4 Parity Gate

Command: `node scripts/phase4-parity.cjs`

```text
[PRTY-08] Running step: wave0-hardening
[PRTY-08] PASS: wave0-hardening

[HOOK-02] Running step: hook-build
[HOOK-02] PASS: hook-build

[HOOK-01] Running step: hook-install-tests
[HOOK-01] PASS: hook-install-tests

[PRTY-02] Running step: sdk-compile-check
[PRTY-02] PASS: sdk-compile-check

[PRTY-06] Running step: staleness-gate
[PRTY-06] PASS: staleness-gate

[PRTY-01] Running step: parity-suite
[PRTY-01] PASS: parity-suite

[PRTY-08] Running step: skip-ban
[PRTY-08] PASS: skip-ban

[PRTY-07] Running step: offline-scan
[PRTY-07] PASS: offline-scan

[UPDT-05] Running step: retirement-scan
[UPDT-05] PASS: retirement-scan

[PRTY-08] All Phase 4 parity gates PASSED
```

Full parity-suite count from the same gate run:

```text
Test Files  9 passed (9)
Tests  567 passed (567)
```

### Standalone Parity Vitest

Command: `cd sdk && npx vitest run src/parity/`

```text
Test Files  9 passed (9)
Tests  567 passed (567)
```
