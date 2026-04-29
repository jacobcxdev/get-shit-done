---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "Phase 5 Plan 02 complete — AdvisoryControlEvent union, gate/hook wiring, billing boundary extension"
last_updated: "2026-04-29T00:02:10Z"
last_activity: 2026-04-29
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 39
  completed_plans: 36
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** The SDK emits one atomic instruction packet at a time; the runtime executes it and reports back — `gsd-post-update` must become unnecessary.
**Current focus:** Phase 5 — Extension API + Migration Hardening (planned; ready to execute)

## Current Position

Phase: 5 of 6 (extension API + migration hardening)
Plan: 2/5 complete
Status: In progress
Last activity: 2026-04-29

Progress: [█████████░] Phase 5 executing — 2/5 plans done

## Performance Metrics

**Velocity:**

- Total plans completed: 34
- Average duration: 10 min
- Total execution time: 2.71 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Compiler / Audit Foundation | 7 | 78 min | 11 min |
| 2 | 4 | - | - |
| 3. Advisory Runner + Query Integration | 13/13 | 130 min | 10 min |

**Recent Trend:**

- Last 5 plans: 8 min, 18 min, 18 min, 8 min, 9 min
- Trend: Phase 5 executing

*Updated after each plan completion*
| Phase 02 PPLAN-01-packet-schema | 8min | 3 tasks | 10 files |
| Phase 02-packet-schema-state-contracts PPLAN-03-state-contracts | 14min | 3 tasks | 26 files |
| Phase 02-packet-schema-state-contracts PPLAN-04-workflow-fsm | 9min | 3 tasks | 13 files |
| Phase 03-advisory-runner-query-integration 03-01-test-scaffolding | 11min | 3 tasks | 12 files |
| Phase 03-advisory-runner-query-integration 03-02-fsm-transition-events | 10min | 3 tasks | 6 files |
| Phase 03-advisory-runner-query-integration 03-03-phase-edit-thread-query-aliases | 8min | 3 tasks | 8 files |
| Phase 03-advisory-runner-query-integration P03-04-workflow-runner-core | 6min | 3 tasks | 7 files |
| Phase 03-advisory-runner-query-integration P03-05-branchids-compile-observability | 4min | 3 tasks | 5 files |
| Phase 03-advisory-runner-query-integration P03-07-init-runner-advisory | 7 min | 3 tasks | 4 files |
| Phase 03-advisory-runner-query-integration P03-08-provider-fallback-confidence | 11 min | 3 tasks | 12 files |
| Phase 03-advisory-runner-query-integration P03-09-runtime-contract-events | 6 min | 3 tasks | 7 files |
| Phase 03-advisory-runner-query-integration 03-10-p4-chain-gap-closure | 8 min | 3 tasks | 7 files |
| Phase 03-advisory-runner-query-integration 03-11-state-runtime-contract-hardening | 8 min | 3 tasks | 8 files |
| Phase 03-advisory-runner-query-integration 03-12-cli-output-contract | 18 min | 3 tasks | 11 files |
| Phase 03-advisory-runner-query-integration 03-13-runtime-report-handoff | 18 min | 3 tasks | 10 files |
| Phase 04-parity-suite-gsd-post-update-retirement 04-05-generated-parity-fixtures | 8 min | 2 tasks | 5 files |
| Phase 05-extension-api-migration-hardening 05-01-extension-slot-registry | 9 min | 2 tasks | 2 files |
| Phase 05-extension-api-migration-hardening 05-02-advisory-control-events-wiring | 11 min | 3 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 02]: Advisory packet validation remains pure and dependency-free; compile validators translate issues into PCKT diagnostics.
- [Phase 02]: Phase 1 AgentEntry contracts are the source for packet agent, tool, disk-write, completion-marker, and artifact obligations.
- [Phase 02]: FSM state paths follow existing planning roots: flat `.planning/fsm-state.json` and workstream `.planning/workstreams/<name>/fsm-state.json`.
- [Phase 02]: Auto-chain state is durable only through FSM autoMode; `workflow.auto_advance` remains the persistent user preference.
- [Phase 02]: Legacy `semanticFeatures` remains compatibility data while `semanticManifest` becomes the structured Phase 2 runtime contract.
- [Phase 03 Plan 03-01]: Wave 0 changes are test-only; no Phase 3 production behavior was implemented.
- [Phase 03 Plan 03-01]: RED verification uses `NODE_PATH=$PWD/sdk/node_modules` in this checkout so root Vitest config can resolve `vitest/config`.
- [Phase 03 Plan 03-02]: Empty public workstream arguments remain supported for flat FSM transitions while non-empty workstreams route through workstream-scoped paths.
- [Phase 03 Plan 03-02]: FSM state writes preserve chronological `transitionHistory` array order instead of applying generic deterministic array sorting.
- [Phase 03 Plan 03-04]: WorkflowRunner consumes supplied compiler manifests only and returns one packet, posture, or typed error per dispatch.
- [Phase 03 Plan 03-04]: Hard outliers, composite workflows, and query-native workflows posture with `emitsPacket: false`; dynamic branches require explicit `branchId`.
- [Phase 03 Plan 03-05]: `mode-dispatch` semantic entries require deterministic `branchIds`, inferred as `mode:<mode>` from the fixed mode list.
- [Phase 03 Plan 03-05]: Compile success logging is locked by an exact counts assertion covering commands, workflows, agents, hooks, and outliers.
- [Phase 03 Plan 03-03]: `thread.*` query handlers read durable FSM state only and never shell out.
- [Phase 03 Plan 03-03]: `phase.edit` remains an allowlisted FSM mutation surface for `currentState`, `resume.status`, `autoMode.active`, and `autoMode.source`.
- [Phase Phase 03 Plan 03-07]: InitRunner default mode now requires an existing .planning directory and emits init_required when it is absent. — Preserves advisory resume semantics and avoids default SDK file writes before runtime execution owns the workflow.
- [Phase Phase 03 Plan 03-07]: Advisory packet evidence is surfaced through InitStepResult.artifacts using packet expectedEvidence values. — Default init can report deterministic packet evidence without writing project artifacts directly.
- [Phase Phase 03 Plan 03-07]: Legacy init file-writing and model-backed behavior is retained only behind legacyModelBacked: true. — Maintains compatibility while keeping the default billing boundary free of SDK-owned model sessions.
- [Phase 03 Plan 03-08]: Provider fallback metadata is persisted atomically on FSM transition history entries. — Reduced-confidence transitions retain durable missing-provider history.
- [Phase 03 Plan 03-08]: `fsm.confidence` derives from history only and does not perform live provider checks. — Confidence queries remain offline and deterministic.
- [Phase 03 Plan 03-08]: Production provider status source remains unexported in this phase. — Tests inject ProviderStatusSource while preserving the default billing boundary.
- [Phase 03 Plan 03-09]: Runtime contract validators split pre-emit worktree/marker structural failures from post-success absent markers/artifacts. — Phase 4 parity can observe unsafe execution and false-success failures through typed events.
- [Phase 03 Plan 03-09]: WorkflowRunner packets include command classification agentTypes for AgentEntry contract validation. — Packet agents now provide concrete contract targets before emission.
- [Phase 03 Plan 03-10]: Disabled P4 skip history uses `advanceFsmState()` so it shares the same lock-protected FSM transition path as query handlers.
- [Phase 03 Plan 03-10]: Missing FSM initialization is non-fatal only for disabled P4 skip recording; malformed or unreadable FSM state still fails fast.
- [Phase 03 Plan 03-10]: RNNR/P4NY traceability checkboxes were closed only after focused P4/FSM, advisory/query/init, integration, and build gates passed.
- [Phase 03 Plan 03-11]: FSM query reads reject unsupported schema versions before returning data or writing phase edits.
- [Phase 03 Plan 03-11]: Completion marker absence events now separate marker IDs from missing artifact paths while preserving blocking semantics.
- [Phase 03 Plan 03-11]: Stale-lock inspection failures are rethrown directly so callers see the root lock-stale/read failure.
- [Phase 03 Plan 03-12]: Phase 3 query terminal output is centralized in pure `formatQueryOutput()` instead of generic JSON serialization.
- [Phase 03 Plan 03-12]: The native query CLI path stays subprocess-free for UI-contracted output handling.
- [Phase 03 Plan 03-12]: Compile count output is emitted by the CLI layer while compiler report generation remains side-effect-free.
- [Phase 03 Plan 03-13]: Runtime report handlers are caller-supplied deterministic callbacks; the SDK does not provide a default implementation that shells out, opens model sessions, reads stdin, or executes tools.
- [Phase 03 Plan 03-13]: Runtime reports are validated against the emitted packet identity and allowed outcomes before any FSM transition or provider metadata persistence.
- [Phase 03 Plan 03-13]: Default advisory advance emits completion intent and waits for runtime evidence; direct `phaseComplete` remains confined to the opt-in legacy model-backed path.
- [Phase 03 Plan 03-13]: Validated runtime reports can tolerate absent FSM initialization only in test/no-FSM contexts; real FSM states still persist provider metadata through `advanceFsmState()`.
- [Phase 05 Plan 05-01]: finalize() is an explicit public call on ExtensionRegistry returning SealedExtensionGraph; cycle-detected and unknown-dependency errors are thrown (hard) from finalize() rather than returned as diagnostics.
- [Phase 05 Plan 05-01]: co-anchor warnings use CompileDiagnostic shape with code EXT-01 stored on SealedExtensionGraph.warnings; no mkWarning import to preserve pure advisory layer boundary.
- [Phase 05 Plan 05-01]: duplicate-id check is per extensionId+kind pair — same extension can register multiple slot kinds without conflict.
- [Phase 05 Plan 05-02]: gate pre-check lives in PhaseRunner.resolveAdvisoryPacketResult() not WorkflowRunner.dispatch() because dispatch input lacks a full FsmRunState.
- [Phase 05 Plan 05-02]: gate-failed PhaseStepResult uses error='gate-failed' with data.controlEvent carrying the typed event.
- [Phase 05 Plan 05-02]: lifecycle hooks silently skip when FSM state is unavailable (no throw on missing FSM for hook path).
- [Phase 05 Plan 05-02]: WorkflowRunnerResult control variant requires narrowing fixes in all callers that switch on posture/error kinds.

### Pending Todos

- Execute Phase 5 — Extension API + Migration Hardening — Plans 03–05 remaining.

### Blockers/Concerns

- [Phase 4 verification]: Three-model verification reconciled to passed after `node scripts/phase4-parity.cjs` passed in the main worktree; Codex/Gemini residual concerns were verification-environment limits, not missing implementation.
- [Phase 5 planning]: Phase 5 plans cover extension ordering/cycle risks and migration rollback semantics; execute them before Phase 6 planning.
- [Pre-Phase 3]: Research flag — map all 84 workflows against WorkflowRunner step taxonomy before coding begins (highest-risk migration step).

## Deferred Items

Items acknowledged and carried forward; activate only after v1 parity gates pass unless explicitly listed in Phase 1–4 requirements.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v1.x | Extension API hardening (EXT-01–07) | Planned in Phase 5; pending execution | Phase 5 planning |
| v1.x | In-flight migration / rollback hardening (MIGR-01–05) | Planned in Phase 5; pending execution | Phase 5 planning |
| v2+ | Markdown Slimming (SLIM-01–03) | Pending Phase 4 parity gates and slim-eligibility check | Init |
| v2+ | Hard Outlier Posturing (OUTL-01–02) | Pending Phase 4 parity gates | Init |

## Session Continuity

Last session: 2026-04-29T00:02:10Z
Stopped at: Completed Phase 5 Plan 02 — advisory control events, gate/hook wiring, billing boundary extension
Resume file: .planning/phases/05-extension-api-migration-hardening/05-03-PLAN.md

## Session Note — 2026-04-28

- Stopped at: Phase 3 UI-SPEC approved
- Resume file: `.planning/phases/03-advisory-runner-query-integration/03-UI-SPEC.md`
