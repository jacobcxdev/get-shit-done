# GSD Advisory FSM Migration

## What This Is

A migration of GSD's orchestration substrate from Markdown-prose workflows to an SDK-owned advisory finite state machine. The SDK becomes the source of truth for workflow state, valid transitions, gates, retries, and next-step selection; Claude Code and other runtimes remain executors that receive fine-grained instruction packets, perform the requested action, and report outcome and evidence back. This project targets the full corpus of 86 commands, 84 workflows, and 33 agents — not a representative subset.

## Core Value

The SDK emits one atomic instruction packet at a time; the runtime executes it and reports back — `gsd-post-update` must become unnecessary.

## Requirements

### Validated

- [x] Compiler/audit foundation: `gsd-sdk compile` generates command, workflow, agent, hook, classification, billing-boundary, and summary manifests from the live corpus; Phase 1 verification passed after billing-boundary parser/resolver hardening.
- [x] Packet schema and state contracts: versioned advisory packets, foreground execution constraints, `agent_routing` validation, workstream-scoped FSM state, lock-status queries, and structured workflow semantic manifests are typed and compiler-enforced. Validated in Phase 2: Packet Schema + State Contracts.
- [x] Advisory runner and query integration: WorkflowRunner/PhaseRunner/InitRunner advisory packet emission, FSM query handlers, provider fallback confidence, Nyquist P4 sequencing, typed runtime events, CLI output contracts, and runtime report handoff are implemented and verified. Validated in Phase 3: Advisory Runner + Query Integration.

### Active

- [ ] Extension API: insert custom steps, replace instructions, add gates, add lifecycle hooks, add provider availability checks, add config schema fields, declare ordering dependencies
- [ ] Absorb all `gsd-post-update` behaviours into supported SDK surfaces (see disposition table in spec)
- [ ] In-flight run migration and rollback contract: `migration-required`/`resume-blocked` states, typed recovery instructions, and forward-compatible transition-history migrations
- [ ] Parity test suite: round-trip flows, golden inputs derived from live inventories, deterministic fallback and filesystem-fallback tests, lock staleness tests, `STATE.md` mirror lock-protection tests
- [ ] Installer/runtime integration: absorb hook re-fetch into supported build path, preserve `hooks/dist/` pre-build requirement, preserve minimal-install semantics, address tracked bugs in `.plans/1755-install-audit-fix.md`
- [ ] Compatibility cleanup and Markdown slimming (only after all parity coverage gates pass)

### Out of Scope

- Implementing the FSM itself before the spec passes recursive roundtable review — the spec defines the design; implementation follows `/gsd-map-codebase` and `/gsd-new-project --auto`
- Moving Claude Code or other runtime tool execution into the SDK — the SDK is an advisor, not an executor
- Treating generated Markdown as the source of truth — Markdown is a launcher and compatibility layer only
- Weakening parity gates or deleting tests to make migration easier — parity is non-negotiable
- Reopening the 10 locked design decisions because `/gsd-map-codebase` discovers more corpus detail — that gate is for missed context, not strategy revision
- Per-agent routing defaults as a substitute for per-step/per-transition routing hooks — Codex routing is injected at multiple step-specific sites today and needs per-transition hooks
- Runtime fetches for hook installation — hooks already exist in `hooks/`; the target is a supported install/build path, not `raw.githubusercontent.com` re-fetches

## Context

GSD already has a partial SDK/FSM substrate — this is brownfield, not greenfield. The existing phase chain (`discuss → research → plan → plan-check → execute → verify → advance`) is already encoded in `sdk/src/phase-runner.ts`. The typed query layer (`sdk/src/query/*`) already provides dotted/spaced alias dispatch, locking primitives, and mutation events. The migration extends these surfaces rather than replacing them.

`gsd-post-update` exists because the current Markdown-heavy substrate requires post-update string injection to remain usable locally. The migration must replace the *reasons* for its existence, not merely replicate its patches. All 24 distinct behaviours in the script have been audited and assigned explicit target dispositions in the spec (`docs/superpowers/specs/2026-04-27-gsd-advisory-fsm-migration-design.md`).

Validated corpus counts from the pre-spec audit (verify against live repo before acting):
- 86 commands, 84 workflows, 33 agents
- 14 agents with disk-write mandates (core: `gsd-phase-researcher`, `gsd-planner`, `gsd-verifier`, `gsd-executor`; extended: 10 others listed in spec)

Known gaps that are design inputs, not optional cleanup:
- Phase 4 parity planning must resolve verification dissent: undeclared-agent runtime reports, packet `expectedEvidence`, `init-required` fail-open behaviour, dynamic branch allowlisting, and mandatory provider omission were flagged by Codex/Gemini as hardening gaps
- workstream `STATE.md` frontmatter threading still needs parity hardening across migrated flows
- tracked install bugs in `.plans/1755-install-audit-fix.md` (hook executability, Codex hook path/name, stale cache, `.sh` uninstall-manifest coverage)

Hard outliers that remain separate postures: `/gsd-graphify`, `/gsd-from-gsd2`, `/gsd-ultraplan-phase`, `/gsd-review`, `/gsd-fast`.

`docs/gsd-sdk-query-migration-blurb.md` is aligned on typed queries replacing subprocess parsing but does not define the advisory FSM, packet model, or extension system — it must not silently override the spec's locked decisions.

## Constraints

- **Methodology**: Compiler/audit/parity foundation must be built before any behavioural migration — no handwaving completeness
- **Parity**: Preserve upstream agent-facing behaviour unless there is a genuine FSM-related reason to drift; parity gates cannot be weakened
- **Goldens**: Must be repo-derived and mechanical (live inventories, `gsd-sdk query` output shapes, audited manifests) — Markdown workflows are not executable goldens
- **Execution model**: SDK advises; runtime executes — no tool execution moves into the SDK
- **Billing boundary**: The default advisory path must not call Claude Agent SDK `query()` from `gsd-sdk`; model work stays inside Claude Code/runtime execution to preserve OAuth/subscription billing. API-key model execution is a separate, explicit mode only.
- **State substrate**: `.planning/` remains the durable state location; do not introduce a separate persistence layer
- **Packet granularity**: One packet = one atomic action; overly coarse packets must be rejected by the compiler before runtime use
- **Codex relay**: `run_in_background: false` is a hard requirement for Codex relay tasks — backgrounded relays interfere with watchdog/orchestrator behaviour
- **Transform ordering**: Transforms that are not commutative must preserve the dependency order established in the spec (skill extraction before workflow splitting; Nyquist before step footers; preamble migration before stripping; model string refresh after model identifier injection)
- **Bootstrap sequence**: `/gsd-map-codebase` must run before `/gsd-new-project --auto`; roundtable review must pass before either
- **Runtime portability**: Bootstrap contract must not assume Claude-Code-only `@path` affordances

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SDK/FSM is the source of truth; Markdown is a thin launcher | Markdown-prose state machines are not reliably followed end-to-end and require post-update patching to stay usable | — Pending |
| Full corpus migration (86 commands, 84 workflows, 33 agents) | Partial migration leaves `gsd-post-update` partially necessary; only full coverage removes the need for it | — Pending |
| Build compiler/audit layer first, migrate behaviour second | Cannot validate parity without a compiler; handwaving completeness has caused past regressions | Validated by Phase 1 |
| Packet contracts, config routing, and FSM state are typed before runner migration | Phase 3 needs stable packet/state/config surfaces before emitting runtime packets | Validated by Phase 2 |
| Extend existing `PhaseRunner`/`InitRunner`; do not discard | Already encodes the canonical phase chain and locking primitives; discarding loses tested behaviour | Validated by Phase 3 |
| Per-step/per-transition provider routing hooks (not per-agent defaults) | Codex routing today is injected at multiple step-specific sites for the same agent type in different contexts | Validated by Phase 2 |
| Nyquist P4 as explicit post-verify packet/state, separate from triple-spawn verification | P4 is a deterministic single-model compliance check, not part of the multi-model verification policy | Validated by Phase 3 |
| `workflow._auto_chain_active` treated as a data-model problem, not a missing feature | The flat/shared flag is architecturally wrong; workstream scoping requires a proper state concept | Validated by Phase 2 |
| Hook installation via supported build path, not runtime fetches | Hook sources already exist in `hooks/`; defensive re-fetching is a workaround for an absent install path, not a feature | — Pending |
| Reduced-confidence operation allowed when one provider is unavailable | Gemini quota exhaustion observed in practice; stalling indefinitely is worse than proceeding with explicit missing-leg recording | Validated by Phase 3 |

---
*Last updated: 2026-04-28 after Phase 3 advisory runner and query integration verification*
