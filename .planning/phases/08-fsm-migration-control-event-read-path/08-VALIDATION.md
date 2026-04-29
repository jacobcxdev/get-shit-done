---
phase: 8
slug: fsm-migration-control-event-read-path
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
updated: 2026-04-29
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.1.1 |
| **Config file** | `sdk/vitest.config.ts` |
| **Quick run command** | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run src/query/fsm-state.test.ts` |
| **Full suite command** | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run` |
| **Estimated runtime** | ~30 seconds quick, ~120 seconds full |

---

## Sampling Rate

- **After every task commit:** Run `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run src/query/fsm-state.test.ts`
- **After every plan wave:** Run `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | MIGR-01 | T-08-01 / — | Old or missing FSM schema versions return `migration-required` through live read query paths | integration | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run src/query/fsm-state.test.ts` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | MIGR-02 | T-08-02 / — | Future FSM schema versions return `resume-blocked` through live read query paths | integration | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run src/query/fsm-state.test.ts` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | MIGR-01/MIGR-02 | T-08-03 / — | Mutation paths reject mismatched schema versions and preserve file contents | integration | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run src/query/fsm-state.test.ts` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 1 | D-12 | T-08-04 / — | CLI/query output renders control events as structured JSON, not `[object Object]` | unit | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run src/query/output.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 1 | MIGR-01/MIGR-02 | T-08-05 / — | Full SDK suite remains green after read-path wiring and output formatting | integration | `cd sdk && NODE_PATH=$PWD/node_modules npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify whether `sdk/src/query/output.test.ts` exists.
- [ ] If absent, create `sdk/src/query/output.test.ts` with control-event formatting tests for affected FSM commands.
- [ ] If present, extend it with control-event formatting coverage.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | All Phase 8 behaviours have automated validation paths | — |

All phase behaviours have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29

## Reconciliation Note (Phase 9)

- `wave_0_complete` advanced from `false` to `true` and `status` advanced from `draft` to `complete` retroactively by Phase 9 (2026-04-29) per D-14.
- Evidence: 08-01-SUMMARY.md and 08-02-SUMMARY.md report `requirements-completed: [MIGR-01, MIGR-02]` with focused test gates and TypeScript compile gates PASS. The full SDK suite reported pre-existing unrelated failures (decomposed-handlers, init-runner, init-e2e, golden, ws-transport, commit, read-only-parity) that were confirmed present before Phase 8 began — see STATE.md `## Deferred Items` row "SDK test failures (6 pre-existing)". Phase 8 implementation behaviour is independently verified by the focused tests covering the live read-path control-event surface.
- Per D-15, no re-execution of `/gsd-validate-phase` was performed for this correction. This is metadata reconciliation only.
