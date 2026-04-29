---
phase: 2
slug: 02-packet-schema-state-contracts
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
updated: 2026-04-29
---

# Phase 2 — Validation Strategy

Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x for SDK unit/integration tests; Node built-in `node:test` for root CJS/docs parity tests; TypeScript `tsc` via SDK build |
| **Config file** | `sdk/vitest.config.ts`; root parity tests under `tests/*.test.cjs`; SDK package scripts in `sdk/package.json` |
| **Quick run command** | `cd sdk && npx vitest run --project unit src/advisory/packet.test.ts src/compile/packet-contracts.test.ts src/advisory/routing.test.ts src/query/config-snapshot.test.ts src/query/config-mutation.test.ts src/advisory/fsm-state.test.ts src/query/fsm-state.test.ts src/query/check-auto-mode.test.ts src/query/config-gates.test.ts src/query/state-mutation.test.ts src/advisory/workflow-semantics.test.ts src/compile/workflow-semantics.test.ts src/compile/inventory/workflows.test.ts src/compile/compiler.test.ts` |
| **Full suite command** | `cd sdk && npm test && npm run build`; then from repo root `node --test tests/config.test.cjs tests/config-schema-sdk-parity.test.cjs tests/config-schema-docs-parity.test.cjs` and `node sdk/dist/cli.js compile --check` |
| **Estimated runtime** | Quick: ~90 seconds after Wave 0 test files exist; full: ~180 seconds plus compile baseline check |

## Sampling Rate

- **After every task completion:** Run the task's targeted automated command from the map below.
- **After every plan wave:** Run the full suite command.
- **Before `/gsd-verify-work`:** Full suite, root parity tests, SDK build, and `compile --check` must be green.
- **Max feedback latency:** 180 seconds for the full phase gate; 90 seconds for task-level sampling.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | PLAN-01 | 1 | PCKT-01, PCKT-03, PCKT-06, PCKT-07 | T-PCKT-01, T-PCKT-03 | Packet fields, schema version, config hash format, and Codex foreground constraints reject malformed packets | unit | `cd sdk && npx vitest run --project unit src/advisory/packet.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | PLAN-01 | 1 | PCKT-02, PCKT-04, PCKT-08, D-04 | T-PCKT-01, T-PCKT-02 | Compile diagnostics reject missing fields, coarse packets, unknown agents, disallowed tools, missing completion markers, missing evidence, and disk-write mandate violations | unit | `cd sdk && npx vitest run --project unit src/compile/packet-contracts.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | PLAN-01 | 1 | PCKT-04, PCKT-06, PCKT-08 | T-PCKT-02 | Compiler integration receives non-empty packet candidates and exported packet contracts build | unit/build | `cd sdk && npx vitest run --project unit src/compile/compiler.test.ts src/compile/packet-contracts.test.ts && npm run build` | ❌ W0 | ⬜ pending |
| 02-02-01 | PLAN-02 | 1 | CONF-02, CONF-03, CONF-04, PCKT-05 | T-CONF-02, T-CONF-03 | Routing parser validates provider targets, preserves literal workflow IDs with `::` keys, SDK config-set stores `agent_routing.<rest>` as a literal key, and hashes canonical effective config | unit | `cd sdk && npx vitest run --project unit src/advisory/routing.test.ts src/query/config-snapshot.test.ts src/query/config-mutation.test.ts` | ❌ W0 literal routing assertions | ⬜ pending |
| 02-02-02 | PLAN-02 | 1 | CONF-01, CONF-06, CONF-07 | T-CONF-01 | Startup validation rejects malformed routing/model config, SDK/CJS/docs schemas stay in parity, and CJS config-set does not dot-split workflow IDs in `agent_routing` paths | node:test/build | `node --test tests/config.test.cjs tests/config-schema-sdk-parity.test.cjs tests/config-schema-docs-parity.test.cjs && cd sdk && npm run build` | ✅ existing parity/config tests, ❌ W0 routing assertions | ⬜ pending |
| 02-02-03 | PLAN-02 | 1 | CONF-04, CONF-05, PCKT-05 | T-CONF-02 | `config.snapshot-hash` reflects effective config mutations but not raw JSON order/whitespace | unit | `cd sdk && npx vitest run --project unit src/advisory/routing.test.ts src/query/config-snapshot.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | PLAN-03 | 2 | STAT-01, STAT-02, STAT-05, STAT-06, STAT-07, STAT-10 | T-STAT-01, T-STAT-02, T-STAT-03 | FSM state paths are traversal-safe, first writes are deterministic JSON with an always-present `workstream` key, locks are typed/statused, `syncStateMd` runs under the FSM lock, concurrent sync/write returns `lock-conflict`, and write failures are not swallowed | unit | `cd sdk && npx vitest run --project unit src/advisory/fsm-state.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | PLAN-03 | 2 | STAT-03, STAT-06, STAT-09 | T-STAT-02, T-STAT-03 | FSM read/init/auto-mode/lock queries dispatch through SDK query modules and mutation commands are registered | unit | `cd sdk && npx vitest run --project unit src/query/fsm-state.test.ts src/query/registry.test.ts` | ❌ W0 fsm-state test, ✅ registry test | ⬜ pending |
| 02-03-03 | PLAN-03 | 2 | STAT-03, STAT-04, STAT-08, STAT-10 | T-STAT-02 | Auto-chain state is FSM-scoped, flat `_auto_chain_active` is removed/quarantined from source, workflows, references, and query-handler docs, and unrelated `STATE.md` bytes are preserved against goldens | unit/scan | `cd sdk && npx vitest run --project unit src/query/check-auto-mode.test.ts src/query/config-gates.test.ts src/query/state-mutation.test.ts && cd .. && ! rg "_auto_chain_active" sdk/src sdk/src/query/QUERY-HANDLERS.md get-shit-done/bin/lib get-shit-done/workflows get-shit-done/references/checkpoints.md get-shit-done/references/planning-config.md` | ✅ existing tests, ❌ W0 fixtures/updates | ⬜ pending |
| 02-04-01 | PLAN-04 | 2 | WFSM-01 through WFSM-08 | T-WFSM-01, T-WFSM-02 | Structured semantic contract rejects unknown families, missing provenance, and missing/wrong-type/invalid family-specific scalar fields | unit | `cd sdk && npx vitest run --project unit src/advisory/workflow-semantics.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-02 | PLAN-04 | 2 | WFSM-01 through WFSM-08 | T-WFSM-01, T-WFSM-03 | Workflow inventory attaches deterministic semantic manifests and compiler diagnostics reject invalid manifests | unit | `cd sdk && npx vitest run --project unit src/compile/workflow-semantics.test.ts src/compile/inventory/workflows.test.ts src/compile/compiler.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-03 | PLAN-04 | 2 | WFSM-01 through WFSM-08 | T-WFSM-03 | Generated semantic baselines are deterministic and included in compile check | unit/build/compile | `cd sdk && npx vitest run --project unit src/advisory/workflow-semantics.test.ts src/compile/workflow-semantics.test.ts src/compile/inventory/workflows.test.ts src/compile/compiler.test.ts && npm run build && node dist/cli.js compile --check` | ❌ W0 generated baseline | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `sdk/src/advisory/packet.test.ts` — packet field/version/hash/Codex foreground guards.
- [ ] `sdk/src/compile/packet-contracts.test.ts` — packet diagnostics, atomicity, D-04 agent contract obligations.
- [ ] `sdk/src/compile/__fixtures__/phase-02/packet-definitions.json` — deterministic non-empty packet candidates for compiler tests.
- [ ] `sdk/src/advisory/routing.test.ts` — provider target parsing, `::` step-key grammar, routing precedence, malformed config.
- [ ] Updates to `sdk/src/query/config-mutation.test.ts` and `tests/config.test.cjs` — SDK and CJS `config-set` preserve `agent_routing.<agentId>::<literalWorkflowId>::<stepId>` as a literal key when workflow IDs contain dots or `/workflows/...`.
- [ ] `sdk/src/query/config-snapshot.test.ts` — canonical effective config hash stability and mutation sensitivity.
- [ ] `sdk/src/advisory/fsm-state.test.ts` — FSM paths, first-write fields with always-present `workstream`, deterministic JSON, lock/status behavior, `syncStateMd` lock coverage, and concurrent `lock-conflict` rejection.
- [ ] `sdk/src/query/fsm-state.test.ts` — FSM read/init/auto-mode/lock query aliases and mutation registration.
- [ ] Updates to `sdk/src/query/check-auto-mode.test.ts` and `sdk/src/query/config-gates.test.ts` — FSM-scoped auto-mode and no flat-state reads.
- [ ] Update to `sdk/src/query/QUERY-HANDLERS.md` — `check.auto-mode` docs describe FSM-scoped autoMode and do not retain flat `_auto_chain_active` semantics.
- [ ] `sdk/src/query/__fixtures__/phase-02/state-md-before.md` and `sdk/src/query/__fixtures__/phase-02/state-md-after.md` — byte-identical `STATE.md` preservation goldens.
- [ ] `sdk/src/advisory/workflow-semantics.test.ts` and `sdk/src/compile/workflow-semantics.test.ts` — semantic family/provenance/ordering coverage plus negative tests for `mockInputSeam`, `guardName`, `parentStateKey`, `childStateKey`, `metric`, `operator`, and `threshold`.
- [ ] Updates to `sdk/src/compile/inventory/workflows.test.ts` and `sdk/src/compile/compiler.test.ts` — semantic manifest and baseline wiring.
- [ ] No framework install required; SDK dependencies are already represented by `sdk/package.json` and `sdk/vitest.config.ts`.

## Manual-Only Verifications

All Phase 2 behaviors have automated verification. No manual-only checks are required.

## Validation Sign-Off

- [x] All tasks have automated verification or explicit Wave 0 test/fixture dependencies.
- [x] Sampling continuity: no task lacks an automated command.
- [x] Wave 0 lists every missing test file and deterministic fixture.
- [x] No watch-mode flags are used.
- [x] Feedback latency target is below 180 seconds for the full gate.
- [x] `nyquist_compliant: true` is set because the populated contract covers every plan task with concrete commands and Wave 0 stubs for missing tests.

**Approval:** approved for execution 2026-04-27; Wave 0 files remain to be created during the plan tasks.

## Reconciliation Note (Phase 9)

- `wave_0_complete` advanced from `false` to `true` and `status` advanced from `ready` to `complete` retroactively by Phase 9 (2026-04-29) per D-14.
- Evidence: ROADMAP.md records Phase 2 as Complete on 2026-04-27; `nyquist_compliant: true` was already set in this file's frontmatter.
- Per D-15, no re-execution of `/gsd-validate-phase` was performed for this correction. This is metadata reconciliation only.
