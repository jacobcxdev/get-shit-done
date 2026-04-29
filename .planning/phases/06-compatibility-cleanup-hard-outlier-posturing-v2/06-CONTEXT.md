# Phase 6: Compatibility Cleanup + Hard Outlier Posturing (v2+) - Context

**Gathered:** 2026-04-29T02:00:00+01:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 delivers v2+ compatibility cleanup after the Phase 4 parity gate is already green and Phase 5 extension/migration hardening is complete. It adds the machinery and guarded first use for Markdown slimming: a workflow may lose inline workflow prose only after `gsd-sdk compile --check-slim-eligibility <workflow-id>` verifies typed transitions, packet sequencing, provider routing, and parity coverage. It also formalises the five hard outliers as documented, compiler-visible exceptions.

This phase does not move runtime execution into the SDK, weaken Phase 1–5 parity or billing-boundary guarantees, packetise hard outliers, or mass-slim all 84 workflows in one pass.

</domain>

<decisions>
## Implementation Decisions

### Slim eligibility and CI gates
- **D-01:** [consensus] `gsd-sdk compile --check-slim-eligibility <workflow-id>` is the sole archive eligibility authority. It must emit a structured verdict and exit non-zero for any failed or indeterminate gate.
- **D-02:** [consensus] Eligibility requires all four SLIM-01 checks: typed transitions, packet sequencing, provider routing, and parity coverage. Phase 4 parity is mandatory but not sufficient by itself.
- **D-03:** [consensus/majority: Claude+Codex implementation] The eligibility flag should reuse compiler-owned data from the existing compile pipeline; it must not shell out to `scripts/phase4-parity.cjs` or create a circular SDK→CJS parity invocation.
- **D-04:** [consensus] `node scripts/phase4-parity.cjs` remains the single hermetic cleanup PR gate. Extend it conditionally to run slim eligibility checks when slim evidence files or thin launchers are present; do not add a competing Phase 6 gate script.

### Thin launcher and archive sequencing
- **D-05:** [consensus] A slimmed workflow keeps a thin launcher at the original workflow path so command/workflow discovery and human entry points remain stable.
- **D-06:** [consensus] Thin launchers may contain only advisory invocation or forwarding metadata. They must not contain workflow prose, branching logic, runtime semantics, packet definitions, or hidden compatibility instructions.
- **D-07:** [majority: Claude+Codex; Gemini filesystem concern noted] Slimming is a two-step sequence: first write the launcher-only Markdown in place, then archive the original prose to `docs/archive/` after eligibility and parity evidence are green. Planning may enforce separate plan steps or commits, but the SDK compiler should enforce eligibility, not git history shape.
- **D-08:** [majority: Claude+Codex] Archive paths use flat command/workflow identifiers under `docs/archive/<command-id>.md` unless live planning finds an existing archive convention that must be followed.
- **D-09:** [majority: Claude+Gemini] Launcher syntax should be a machine-parseable fenced `gsd-advisory` YAML block with a schema validated by tests.
- **D-10:** [consensus] Before any archive move, planning must audit workflow/command tests that enumerate paths or counts, especially `tests/workflow-compat.test.cjs`, `tests/commands-doc-parity.test.cjs`, `tests/workflow-size-budget.test.cjs`, and `tests/workflow-guard-registration.test.cjs`.

### Hard outlier posture
- **D-11:** [consensus] `/gsd-graphify`, `/gsd-from-gsd2`, `/gsd-ultraplan-phase`, `/gsd-review`, and `/gsd-fast` remain hard outliers in Phase 6. They are not wrapped, packetised, or slimmed as normal FSM workflows.
- **D-12:** [consensus] `--check-slim-eligibility` must reject hard-outlier workflows with a diagnostic that references the posture record.
- **D-13:** [majority: Claude+Codex] Hard outlier posture records are human-authored, machine-readable YAML files under `sdk/src/advisory/outlier-postures/<command-id>.yaml`. Required fields: `commandId`, `classifiedAs: hard-outlier`, `migrationDisposition`, `rationale`, `emitsPacket: false`, `reviewedAt`, and `owner`.
- **D-14:** [consensus] `SEED_HARD_OUTLIERS` remains the canonical hard-coded compile-time set. YAML posture files are required for entries in that set but do not dynamically extend it; adding a new hard outlier requires both a code change and a posture file.
- **D-15:** [majority] The compiler should populate `ClassificationEntry.outlierPosture` from posture YAML and fail with an OUTL diagnostic when a seed hard outlier lacks a valid posture record.

### Phase 6 execution scope
- **D-16:** [majority: Claude+Codex] Use a bounded pilot set of 3–5 non-outlier workflows with the strongest semantic/packet/parity coverage rather than attempting to slim all 84 workflows in Phase 6. The planner should identify the pilot from live compile outputs.
- **D-17:** [consensus] If no workflow passes eligibility during planning, Phase 6 may still deliver the eligibility machinery, CI enforcement, and outlier posture records; archive/slimming execution remains blocked until a candidate passes.

### Claude's Discretion
Claude has implementation discretion over helper names, exact diagnostic codes, YAML parsing implementation, test organisation, and whether Phase 6 plans split eligibility machinery, posture records, CI enforcement, launcher schema, and pilot slimming into separate waves, as long as the decisions above and Phase 1–5 guarantees are preserved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` — Project boundary, SDK-as-advisor posture, billing boundary, `.planning/` durable state constraint, and compatibility cleanup as active v2+ scope.
- `.planning/ROADMAP.md` — Phase 6 goal, dependencies, success criteria, and completed Phase 1–5 status.
- `.planning/REQUIREMENTS.md` — Locked SLIM-01–03 and OUTL-01–02 requirements plus Phase 1–5 requirement guarantees that Phase 6 must not weaken.
- `.planning/STATE.md` — Current state: Phase 5 complete, Phase 6 ready to plan, parity/extension context carried forward.

### Prior Phase Context
- `.planning/phases/03-advisory-runner-query-integration/03-CONTEXT.md` — WorkflowRunner, hard-outlier posture, provider fallback, typed packet/event, and billing-boundary decisions.
- `.planning/phases/04-parity-suite-gsd-post-update-retirement/04-CONTEXT.md` — Phase 4 parity gate, hermetic CI, generated fixture, hook/retirement, and no-weakened-assertion decisions.
- `.planning/phases/05-extension-api-migration-hardening/05-CONTEXT.md` — Extension and migration hardening decisions; confirms Markdown slimming and hard-outlier cleanup were deferred to Phase 6.

### Codebase Maps
- `.planning/codebase/STACK.md` — Node/TypeScript/CJS stack, build/test commands, generated compile output paths.
- `.planning/codebase/ARCHITECTURE.md` — Workflow prose layer, command layer, SDK compile/query/runner layers, and state management surfaces.
- `.planning/codebase/TESTING.md` — Vitest and root CJS test patterns relevant to compiler, workflow artefact, and parity-gate tests.

### Discussion Artefacts
- `.planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/discussion/phase6-CLAUDE.md` — Claude first-pass decisions.
- `.planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/discussion/phase6-CODEX.md` — Codex first-pass decisions.
- `.planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/discussion/phase6-GEMINI.md` — Gemini first-pass decisions.
- `.planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/discussion/phase6-CLAUDE-review.md` — Claude cross-review and synthesis.
- `.planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/discussion/phase6-CODEX-review.md` — Codex cross-review and challenges.
- `.planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/discussion/phase6-GEMINI-review.md` — Gemini cross-review.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sdk/src/compile/` — Existing compiler pipeline, diagnostics, manifest collectors, baselines, command classification, and generated JSON outputs should host slim eligibility checks and posture validation.
- `scripts/phase4-parity.cjs` — Existing hermetic parity gate should be extended conditionally for SLIM-03 rather than replaced.
- `sdk/src/generated/compile/` — Existing generated compile artefacts should remain the machine-readable baseline area; posture-derived manifest updates should fit this pattern.
- `commands/gsd/` and `get-shit-done/workflows/` — Command/workflow Markdown surfaces that thin launchers must preserve for compatibility.
- Root CJS tests in `tests/*.test.cjs` — Existing artefact tests are the natural place for launcher schema, workflow inventory, and parity script assertions.

### Established Patterns
- Compiler outputs and generated manifests are authoritative; Markdown prose is a compatibility/human entry surface, not an executable golden.
- Phase gates fail hard with named diagnostics; warning-only cleanup failures are not acceptable for SLIM-01 or SLIM-03.
- Default advisory paths must remain billing-safe and offline; SDK code must not execute runtime tools or open model sessions for cleanup decisions.
- Source-authored structured records are acceptable when they are compiler-validated and surfaced through generated manifests.

### Integration Points
- `gsd-sdk compile --check-slim-eligibility <workflow-id>` connects compile manifests, workflow semantics, packet sequencing, provider routing, and parity coverage.
- `scripts/phase4-parity.cjs` connects slim eligibility to the existing CI cleanup gate.
- Hard outlier posture YAML connects to command classification and generated command manifests.
- Thin launcher validation connects workflow Markdown artefact tests with command/workflow discovery.

</code_context>

<specifics>
## Specific Ideas

- The planner should start by proving whether `--check-slim-eligibility` can derive all four required criteria from existing compile outputs; if not, the missing criterion becomes a blocking implementation task, not a warning or override.
- A candidate pilot set should be selected from live compiler data, excluding hard outliers and any workflow with incomplete typed transitions, packet sequencing, provider routing, or parity coverage.
- Avoid an automated `--apply-slim` mutation surface in Phase 6 unless planning proves it is necessary. The locked scope is checks, launcher shape, archive rules, CI enforcement, posture records, and a bounded pilot if eligible.
- `docs/archive/` may need first-time creation before archive moves; if no archive convention exists, use flat `docs/archive/<command-id>.md`.

</specifics>

<deferred>
## Deferred Ideas

- Automated `--apply-slim` file mutation is deferred unless a later phase explicitly asks for it.
- Reclassifying or migrating hard outliers into normal FSM packet flows is deferred to a future explicit reclassification phase; Phase 6 only documents and registers their hard-outlier posture.
- Broad slimming of all 84 workflows is deferred until the pilot machinery has passed eligibility and parity evidence.

</deferred>

---

*Phase: 06-compatibility-cleanup-hard-outlier-posturing-v2*
*Context gathered: 2026-04-29T02:00:00+01:00*
