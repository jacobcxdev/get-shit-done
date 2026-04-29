---
phase: 7
slug: extension-runtime-slot-wiring
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
updated: 2026-04-29
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `sdk/vitest.config.ts` via root test wiring |
| **Quick run command** | `NODE_PATH=$PWD/sdk/node_modules npx vitest run sdk/src/advisory/workflow-runner.test.ts sdk/src/advisory/provider-confidence.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60–180 seconds focused; full suite varies |

---

## Sampling Rate

- **After every task commit:** Run the focused command for files touched by that task.
- **After every plan wave:** Run `npm run build:sdk` and the relevant focused Vitest files.
- **Before `/gsd-verify-work`:** `npm test` and `node scripts/phase4-parity.cjs` must be green, or unrelated failures must be recorded with exact failing suites.
- **Max feedback latency:** 180 seconds for focused feedback.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | EXT-01 | T-07-01 | Dispatch emits one packet per call while walking inserted steps | unit | `NODE_PATH=$PWD/sdk/node_modules npx vitest run sdk/src/advisory/workflow-runner.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | EXT-01 | T-07-02 | Inserted packet runtime identity is normalised without mutating extension-owned fields | unit | `NODE_PATH=$PWD/sdk/node_modules npx vitest run sdk/src/advisory/workflow-runner.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | EXT-05 | T-07-03 | Custom provider names survive deterministic normalisation | unit | `NODE_PATH=$PWD/sdk/node_modules npx vitest run sdk/src/advisory/provider-confidence.test.ts` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 1 | EXT-05 | T-07-04 | Provider checks fail closed and unavailable wins over available | unit | `NODE_PATH=$PWD/sdk/node_modules npx vitest run sdk/src/advisory/workflow-runner.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 2 | EXT-01, EXT-05 | T-07-05 | Runtime report handoff and FSM persistence remain one-packet-at-a-time | integration | `NODE_PATH=$PWD/sdk/node_modules npx vitest run sdk/src/phase-runner.test.ts sdk/src/parity/provider-fallback.test.ts` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 2 | EXT-01, EXT-05 | T-07-06 | Phase 4 parity and billing boundary remain intact | parity | `node scripts/phase4-parity.cjs && node bin/gsd-sdk.js compile --check-billing-boundary` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sdk/src/advisory/workflow-runner.test.ts` — RED tests for inserted-step sequence dispatch and provider-check composition.
- [ ] `sdk/src/advisory/provider-confidence.test.ts` — RED tests for custom provider normalisation and confidence rendering.
- [ ] `sdk/src/parity/provider-fallback.test.ts` — RED parity test for provider checks affecting fallback metadata and FSM persistence.
- [ ] `sdk/src/phase-runner.test.ts` — RED integration test for PhaseRunner receiving one inserted packet and awaiting runtime report.

---

## Manual-Only Verifications

All Phase 7 behaviours have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29

## Reconciliation Note (Phase 9)

- `wave_0_complete` advanced from `false` to `true` and `status` advanced from `draft` to `complete` retroactively by Phase 9 (2026-04-29) per D-14.
- Evidence: `07-VERIFICATION-CLAUDE.md` recorded `passed` (3/3) for EXT-01 and EXT-05 runtime consumption; `07-VERIFICATION-CODEX.md` recorded an independent `PASS` verdict. Both artefacts already exist; per D-04 Phase 9 must not create a new VERIFICATION file or re-implement runtime wiring.
- Per D-15, no re-execution of `/gsd-validate-phase` was performed for this correction. This is metadata reconciliation only.
