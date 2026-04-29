---
phase: 5
slug: extension-api-migration-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
updated: 2026-04-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest for SDK tests; Node.js `node:test` for root CJS tests |
| **Config file** | `sdk/vitest.config.ts`; root Node tests under `tests/*.test.cjs` |
| **Quick run command** | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` |
| **Full suite command** | `npm test && node scripts/phase4-parity.cjs` |
| **Estimated runtime** | ~70 seconds |

---

## Sampling Rate

- **After every task commit:** Run `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run`
- **After every plan wave:** Run `npm test && node scripts/phase4-parity.cjs`
- **Before `/gsd-verify-work`:** Full suite and Phase 4 parity gate must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 05-01 | 1 | EXT-01, EXT-02, EXT-06, EXT-07 | T-05-01 | Extension registrations cannot mutate packet identity, tools, evidence, or transitions outside typed slots | unit | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-01-02 | 05-01 | 1 | EXT-06 | T-05-02 | Cyclic extension ordering is rejected with deterministic diagnostics before packet emission | unit | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-02-01 | 05-02 | 1 | EXT-03, EXT-04, EXT-05 | T-05-03 | Gates, hooks, and provider checks cannot cross the billing boundary or perform runtime execution | unit/integration | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-02-02 | 05-02 | 1 | EXT-03 | T-05-04 | `gate-failed` blocks normal packet emission and does not advance FSM state | unit/integration | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-03-01 | 05-03 | 2 | MIGR-01, MIGR-02, MIGR-03, MIGR-05 | T-05-05 | Schema-version mismatch surfaces typed control events without direct state writes | unit/integration | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-03-02 | 05-03 | 2 | MIGR-03 | T-05-06 | Transition history ordering and entries are preserved during migration | unit/integration | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-04-01 | 05-04 | 2 | MIGR-04 | T-05-07 | Rollback is append-only and preserves post-checkpoint entries as audit trail | unit/integration | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-04-02 | 05-04 | 2 | MIGR-04 | T-05-08 | Missing rollback checkpoints surface `rollback-blocked` instead of throwing or reusing `resume-blocked` | unit/integration | `NODE_PATH=$PWD/sdk/node_modules npm --prefix sdk test -- --run` | ✅ existing SDK Vitest | ⬜ pending |
| 05-05-01 | 05-05 | 3 | EXT-01–07, MIGR-01–05 | T-05-09 | Phase 4 parity, compile, billing-boundary, and packet atomicity gates remain green after Phase 5 additions | regression | `npm test && node scripts/phase4-parity.cjs` | ✅ existing root scripts | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sdk/src/compile/*extension*.test.ts` or equivalent — RED tests for slot registry validation, ordering, namespace collisions, and instruction-only replacement.
- [ ] `sdk/src/*workflow-runner*.test.ts` or equivalent — RED tests for gate-failed control events and no FSM advancement.
- [ ] `sdk/src/query/*migration*.test.ts` or equivalent — RED tests for `migration-required`, `resume-blocked`, history preservation, and rollback-blocked.
- [ ] `sdk/src/compile/billing-boundary.test.ts` — RED tests proving extension gate/hook/provider-check entrypoints are included in boundary scanning.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension author ergonomics | EXT-01–07 | API usability is partly qualitative until external extension examples exist | Review generated plan examples and ensure each registration surface has concrete TypeScript signatures and diagnostics |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29

## Reconciliation Note (Phase 9)

- `wave_0_complete` advanced from `false` to `true` and `status` advanced from `draft` to `complete` retroactively by Phase 9 (2026-04-29) per D-14.
- Evidence: 05-05-SUMMARY.md Self-Check PASSED across the five-plan close-out; all extension-registry, gate/hook, history-hardening, rollback, and integration gates were green at Phase 5 completion (2026-04-29). ROADMAP.md records Phase 5 as Complete on 2026-04-29.
- Per D-15, no re-execution of `/gsd-validate-phase` was performed for this correction. This is metadata reconciliation only.
