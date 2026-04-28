# Roadmap: GSD Advisory FSM Migration

## Overview

A brownfield migration of GSD's orchestration substrate from Markdown-prose workflows to an SDK-owned advisory finite state machine. The SDK becomes the authoritative source for workflow state, valid transitions, and instruction packets; Claude Code and other runtimes remain executors that receive atomic packets, act, and report back. The v1 sequence is compiler gate → packet/state contracts → advisory runner → parity and `gsd-post-update` retirement. v1.x and v2+ phases harden extension/migration surfaces and slim compatibility Markdown only after parity is proven.

**Roundtable status:** Requirements were refreshed after a reduced-confidence Claude+Codex roundtable. Gemini Pro was exhausted, so provider unavailability is recorded explicitly rather than blocking the workflow.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Compiler / Audit Foundation** - `gsd-sdk compile` exists and produces passing manifests for commands, workflows, agents, hooks, billing-boundary checks, and command classifications
- [x] **Phase 2: Packet Schema + State Contracts** - Versioned packet schema, execution constraints, config/routing validation, workstream-scoped FSM state, and workflow semantic manifests are typed and compiler-enforced (completed 2026-04-27)
- [x] **Phase 3: Advisory Runner + Query Integration** - WorkflowRunner generalises PhaseRunner/InitRunner using deterministic packet emission, query registry FSM handlers, provider fallback, Nyquist P4, typed errors, and runtime report handoff (completed 2026-04-28)
- [x] **Phase 4: Parity Suite + gsd-post-update Retirement** - Workflow parity, hook install fixes, and `gsd-post-update` no-op retirement gates are green without network access (completed 2026-04-28)
- [ ] **Phase 5: Extension API + Migration Hardening (v1.x)** - Extension insertion/replacement/gates and in-flight migration/rollback are production-hardened after v1 parity is stable
- [ ] **Phase 6: Compatibility Cleanup + Hard Outlier Posturing (v2+)** - Markdown is slimmed only after machine eligibility passes; hard outliers are formally documented

## Phase Details

### Phase 1: Compiler / Audit Foundation
**Goal**: Add `gsd-sdk compile` and make it the hard gate for the whole corpus, including coverage manifests, billing-boundary checks, agent contracts, hook manifests, and per-command classification
**Depends on**: Nothing (first phase)
**Requirements**: COMP-00, COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07, COMP-08, COMP-09, COMP-10, COMP-11, COMP-12, COMP-13, CLSS-01, CLSS-02, CLSS-03, CLSS-04, BILL-01, BILL-02, BILL-03, BILL-04, AGNT-01, AGNT-02
**Success Criteria** (what must be TRUE):
  1. `gsd-sdk compile` is available in `sdk/src/cli.ts`, documented in CLI help, and exits zero only when manifests cover all live commands, workflows, agents, hooks, and hard outliers
  2. All commands are classified under exactly one taxonomy type in a machine-readable manifest generated from the live repo inventory
  3. Duplicate IDs, unknown workflow references, bad transform ordering, invalid state references, missing generated artefacts, and packet budget failures each cause a non-zero exit naming the specific offender
  4. Billing-boundary checks prove the default advisory path does not import/call Claude Agent SDK `query()` or open SDK-internal model sessions; default advisory commands run without Anthropic API credentials
  5. Agent contract and hook/install manifests are valid JSON and suitable as golden baselines; compile logs command, workflow, agent, hook, and outlier counts
**Plans**: 7 plans across 5 waves

Plans:
- [x] 01-01-PLAN.md — Compile types, diagnostics, paths, and hash utilities
- [x] 01-02-PLAN.md — CLI integration, compile command, and billing-safe lazy imports
- [x] 01-03-PLAN.md — Command and workflow inventory collectors
- [x] 01-04-PLAN.md — Agent and hook inventory collectors
- [x] 01-05-PLAN.md — Command classification and corpus validation checks
- [x] 01-06-PLAN.md — Static import-graph billing boundary checker
- [x] 01-07-PLAN.md — Compiler orchestrator, baselines, and integration tests

### Phase 2: Packet Schema + State Contracts
**Goal**: Define and enforce the packet contract, config/routing schema, workstream-scoped FSM state model, workflow semantic features, and CJS/SDK parity obligations before behavioural migration begins
**Depends on**: Phase 1
**Requirements**: PCKT-01, PCKT-02, PCKT-03, PCKT-04, PCKT-05, PCKT-06, PCKT-07, PCKT-08, CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06, CONF-07, STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, STAT-06, STAT-07, STAT-08, STAT-09, STAT-10, WFSM-01, WFSM-02, WFSM-03, WFSM-04, WFSM-05, WFSM-06, WFSM-07, WFSM-08
**Success Criteria** (what must be TRUE):
  1. Every SDK-emitted packet validates against the TypeScript schema with all required fields including `executionConstraints`; multi-action instructions are rejected at compile time
  2. Codex relay foreground-only semantics (`run_in_background: false`) and other execution constraints are represented in packet metadata, not prose
  3. `agent_routing` supports validated `codex:<effort>` values plus step-scoped overrides; routing resolves per packet emission using the config snapshot
  4. FSM state follows existing `planningPaths`: flat mode uses `.planning/fsm-state.json`, workstream mode uses `.planning/workstreams/<name>/fsm-state.json`; every state file starts with `runId` and `stateSchemaVersion`
  5. New config fields are maintained across SDK and CJS schemas in the same change, and new FSM writes avoid silent catch blocks
**Plans**: 4 plans across 2 waves

Plans:
- [x] PLAN-01-packet-schema.md — Advisory packet schema, runtime guard, and compile packet validators
- [x] PLAN-02-config-routing-schema.md — Config routing schema, provider effort validation, and snapshot hashing
- [x] PLAN-03-state-contracts.md — Workstream-scoped FSM state model, lock status, and auto-mode query state
- [x] PLAN-04-workflow-fsm.md — Structured workflow semantic manifests and compiler validation

### Phase 3: Advisory Runner + Query Integration
**Goal**: Generalise PhaseRunner/InitRunner into a deterministic advisory runner, integrate FSM reads/writes through the query registry, and make provider fallback, agent completion checks, Nyquist P4, and typed error events observable before parity
**Depends on**: Phase 2
**Requirements**: RNNR-01, RNNR-02, RNNR-03, RNNR-04, RNNR-05, RNNR-06, RNNR-07, RNNR-08, RNNR-09, RNNR-10, QREG-01, QREG-02, QREG-03, QREG-04, QREG-05, QREG-06, QREG-07, P4NY-01, P4NY-02, P4NY-03, P4NY-04, ERRT-01, ERRT-02, ERRT-03, ERRT-04, LOGG-01, LOGG-02, LOGG-03, PROV-01, PROV-02, PROV-03, PROV-04, AGNT-03, AGNT-04
**Success Criteria** (what must be TRUE):
  1. WorkflowRunner supports every workflow pattern classified by the compiler manifest; hard outliers are bypassed with explicit posture records rather than wrapped
  2. PhaseRunner's canonical chain (`discuss → research → plan → plan-check → execute → verify → advance`) and InitRunner's deterministic sequence are preserved with identical locking and packet semantics while default model-backed orchestration is removed from the advisory path
  3. Nyquist P4 compliance is a distinct `p4-compliance` state after `verify` and before `advance`; it is never included inside the verify multi-model packet sequence
  4. FSM query handlers (`fsm.state`, `fsm.run-id`, `fsm.transition`, `fsm.history`, `fsm.confidence`, `thread.*`, `phase.edit`) are native SDK handlers with dotted and spaced aliases
  5. Provider unavailability completes with typed reduced-confidence transitions, missing-provider history, and no indefinite stall; missing completion markers and worktree requirements emit typed events
**Plans**: 13 of 13 plans complete (completed 2026-04-28)
**Research flag**: Recommend `/gsd-research-phase` before planning — map all 84 workflows against WorkflowRunner pattern support, HITL seams, and dynamic-branch classifications.

### Phase 4: Parity Suite + gsd-post-update Retirement
**Goal**: Prove behavioural parity mechanically, fix supported hook install/build paths, and retire `gsd-post-update` only when its reasons no longer exist
**Depends on**: Phase 3
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, HOOK-06, UPDT-01, UPDT-02, UPDT-03, UPDT-04, UPDT-05, PRTY-01, PRTY-02, PRTY-03, PRTY-04, PRTY-05, PRTY-06, PRTY-07, PRTY-08
**Success Criteria** (what must be TRUE):
  1. Deterministic workflows have round-trip parity tests; dynamic-branch workflows have branch-specific tests; HITL workflows test suspension/resume with explicit mocked seams; hard outliers have posture tests
  2. Every golden is generated from live `gsd-sdk compile` output or `gsd-sdk query` responses — no golden is hand-authored from Markdown prose
  3. Provider-fallback, filesystem-fallback, lock-staleness, `STATE.md` mirror lock-protection, and golden-staleness tests pass in CI with zero network access
  4. Hook installation copies all hooks to correct paths with executable permissions, handles Codex path/name requirements, detects stale cache, and covers `.sh` hooks in uninstall manifests without network fetches
  5. Running `gsd-post-update` against a migrated project produces no observable side effects, and no parity test invokes it
**Plans**: 10 of 10 plans complete (completed 2026-04-28)

Plans:
- [x] 04-01-PLAN.md — Undeclared-agent report rejection and expectedEvidence fail-closed
- [x] 04-02-PLAN.md — PhaseRunner init-required fail-closed and noFsmForTesting bypass
- [x] 04-03-PLAN.md — Dynamic branch allowlist validation and mandatory-provider metadata authority
- [x] 04-04-PLAN.md — Hook install/build audit and absorption
- [x] 04-05-PLAN.md — Generated parity fixtures and disposition manifest
- [x] 04-06-PLAN.md — Parity suite core
- [x] 04-07-PLAN.md — Hermetic Phase 4 gate script and CI integration
- [x] 04-08-PLAN.md — Provider fallback and concurrent STATE.md write parity tests
- [x] 04-09-PLAN.md — Retirement gate
- [x] 04-10-PLAN.md — gsd-post-update retirement declaration

### Phase 5: Extension API + Migration Hardening (v1.x)
**Goal**: Harden the extension API and in-flight migration/rollback contract after v1 parity has proven the core advisory substrate
**Depends on**: Phase 4
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06, EXT-07, MIGR-01, MIGR-02, MIGR-03, MIGR-04, MIGR-05
**Success Criteria** (what must be TRUE):
  1. Extensions can insert steps, replace instructions, add gates, register lifecycle hooks, and register custom provider checks without modifying SDK source
  2. Extension ordering dependencies are topologically sorted and cycles are rejected with diagnostics
  3. Run-state schema mismatches produce `migration-required` or `resume-blocked` states with typed recovery instructions
  4. Transition history is preserved across migrations, and rollback restores to the last checkpoint while retaining later entries as audit trail
  5. State files created in v1 are compatible with the migration hardening because they already include `stateSchemaVersion`
**Plans**: 5 plans across 3 waves

Plans:
- [ ] 05-01-PLAN.md — Extension slot registry: ExtensionRegistry, SealedExtensionGraph, slot types, cycle detection (EXT-01, EXT-02, EXT-06, EXT-07)
- [ ] 05-02-PLAN.md — Gate/hook/provider-check integration, AdvisoryControlEvent schema, billing boundary extension (EXT-03, EXT-04, EXT-05)
- [ ] 05-03-PLAN.md — FsmTransitionHistoryEntry hardening, parseFsmRunStateOrControlEvent wrapper (MIGR-01, MIGR-02, MIGR-03, MIGR-05)
- [ ] 05-04-PLAN.md — Append-only rollback and schema migration functions: rollbackFsmState, migrateFsmState (MIGR-03, MIGR-04)
- [ ] 05-05-PLAN.md — Integration hardening, advisory index re-exports, diagnostic alignment, phase docs (EXT-01–07, MIGR-01–05)

### Phase 6: Compatibility Cleanup + Hard Outlier Posturing (v2+)
**Goal**: Slim Markdown workflow files to thin launchers only after eligibility checks and parity gates pass; keep hard outlier posture explicit
**Depends on**: Phase 4 parity gates green (hard prerequisite — Phase 6 cannot begin while any parity gate is red)
**Requirements**: SLIM-01, SLIM-02, SLIM-03, OUTL-01, OUTL-02
**Success Criteria** (what must be TRUE):
  1. `gsd-sdk compile --check-slim-eligibility <workflow-id>` passes before any workflow Markdown file is archived or slimmed
  2. Retained launcher files contain only the advisory invocation after typed transitions, packet sequencing, provider routing, and parity coverage are proven
  3. CI blocks cleanup PRs until all parity gates exit zero
  4. All 5 hard outliers have documented posture records and are registered in the classification manifest with type `hard-outlier`
**Plans**: TBD

## Progress

**Execution Order:**
v1 phases execute in order: 1 → 2 → 3 → 4
Phase 5 (v1.x) begins after Phase 4 parity gates pass
Phase 6 (v2+) cannot begin before Phase 4 parity gates are green

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Compiler / Audit Foundation | 7/7 | Complete | 2026-04-27 |
| 2. Packet Schema + State Contracts | 4/4 | Complete | 2026-04-27 |
| 3. Advisory Runner + Query Integration | 13/13 | Complete | 2026-04-28 |
| 4. Parity Suite + gsd-post-update Retirement | 10/10 | Complete | 2026-04-28 |
| 5. Extension API + Migration Hardening (v1.x) | 0/5 | In progress | - |
| 6. Compatibility Cleanup + Hard Outlier Posturing (v2+) | 0/TBD | Not started | - |
