---
phase: 06
slug: compatibility-cleanup-hard-outlier-posturing-v2
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-29
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest for SDK TypeScript; Node `node:test` for root CJS artefact/parity gates |
| **Config file** | `sdk/vitest.config.ts`; root CJS tests use Node's built-in runner |
| **Quick run command** | `node bin/gsd-sdk.js compile --check` |
| **Full suite command** | `node scripts/phase4-parity.cjs` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node bin/gsd-sdk.js compile --check`
- **After every plan wave:** Run `node scripts/phase4-parity.cjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | OUTL-01, OUTL-02 | T-06-01 | Hard-outlier posture records are parsed from source-authored YAML and cannot silently extend the seed set | unit | `cd sdk && npm run test:unit -- src/compile/outlier-postures.test.ts src/compile/classification.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | OUTL-01, OUTL-02 | T-06-01 | Missing or invalid posture records fail compilation with named diagnostics | integration | `node bin/gsd-sdk.js compile --check` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 0 | SLIM-01 | T-06-02 | Slim eligibility emits structured fail-closed verdicts for unknown, hard-outlier, failed, and indeterminate workflows | unit | `cd sdk && npm run test:unit -- src/compile/cli.test.ts src/compile/slim-eligibility.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | SLIM-01 | T-06-02 | Eligibility gates independently report typed transitions, packet sequencing, provider routing, and parity coverage evidence | integration | `node bin/gsd-sdk.js compile --check-slim-eligibility /workflows/<candidate>` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 0 | SLIM-02 | T-06-03 | Thin launcher files contain exactly one fenced `gsd-advisory` YAML block and no workflow prose | unit | `cd sdk && npm run test:unit -- src/compile/slim-launcher.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 1 | SLIM-02 | T-06-03 | Launcher metadata matches command/workflow classification and rejects hard outliers | root artefact | `node --test tests/workflow-compat.test.cjs tests/commands-doc-parity.test.cjs tests/workflow-size-budget.test.cjs tests/workflow-guard-registration.test.cjs` | ✅ | ⬜ pending |
| 06-04-01 | 04 | 1 | SLIM-03 | T-06-04 | The Phase 4 parity gate conditionally enforces slim eligibility without adding a competing gate script | parity gate | `node scripts/phase4-parity.cjs` | ✅ | ⬜ pending |
| 06-04-02 | 04 | 1 | SLIM-03 | T-06-04 | The conditional slim gate is a no-op without slim artefacts and fails on failed or indeterminate verdicts when artefacts exist | root artefact | `node --test tests/inventory-counts.test.cjs tests/inventory-source-parity.test.cjs tests/inventory-manifest-sync.test.cjs` | ✅ | ⬜ pending |
| 06-05-01 | 05 | 2 | SLIM-01, SLIM-02, SLIM-03 | T-06-05 | Pilot slimming runs only for workflows with pass verdicts; hard outliers and indeterminate candidates remain full prose | end-to-end | `node bin/gsd-sdk.js compile --check && node scripts/phase4-parity.cjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sdk/src/compile/outlier-postures.test.ts` — OUTL-01/OUTL-02 posture schema and seed-set validation stubs
- [ ] `sdk/src/compile/slim-eligibility.test.ts` — SLIM-01 fail-closed gate verdict stubs
- [ ] `sdk/src/compile/slim-launcher.test.ts` — SLIM-02 launcher schema validation stubs
- [ ] CLI coverage in `sdk/src/compile/cli.test.ts` for `--check-slim-eligibility <workflow-id>` parsing, usage text, JSON output, and non-zero failed/indeterminate exits

---

## Manual-Only Verifications

All phase behaviours have automated verification. Pilot candidate choice requires human-readable plan evidence, but the acceptance gate remains automated through `--check-slim-eligibility` and `scripts/phase4-parity.cjs`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29
