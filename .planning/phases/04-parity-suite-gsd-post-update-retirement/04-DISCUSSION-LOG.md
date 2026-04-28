# Phase 4: Parity Suite + gsd-post-update Retirement - Discussion Log

**Gathered:** 2026-04-28
**Mode:** `/gsd-discuss-phase 4 --auto`
**Status:** Step 11 multi-model discussion completed; decisions captured in `04-CONTEXT.md`.

This log is a human audit trail for the discuss-phase Q&A. Downstream agents should use `04-CONTEXT.md` as the operative context and read the canonical references listed there before planning or implementing.

## Source Artefacts

Roundtable artefacts were written under `.planning/phases/04-parity-suite-gsd-post-update-retirement/discussion/`.

### Parity Fixture Source and Coverage Shape
- `parity-fixtures-CLAUDE.md`
- `parity-fixtures-CODEX.md`
- `parity-fixtures-GEMINI.md`
- `parity-fixtures-CLAUDE-review.md`
- `parity-fixtures-CODEX-review.md`
- `parity-fixtures-GEMINI-review.md`
- Recursive follow-up artefacts: `gray-CLAUDE.md`, `gray-CODEX.md`, `gray-GEMINI.md`, `gray-CLAUDE-review.md`, `gray-CODEX-review.md`, `gray-GEMINI-review.md`

### gsd-post-update Disposition and No-op Retirement Gate
- `post-update-retirement-CLAUDE.md`
- `post-update-retirement-CODEX.md`
- `post-update-retirement-GEMINI.md`
- `post-update-retirement-CLAUDE-review.md`
- `post-update-retirement-CODEX-review.md`
- `post-update-retirement-GEMINI-review.md`

### Hook Install/Build Absorption
- `hooks-absorption-CLAUDE.md`
- `hooks-absorption-CODEX.md`
- `hooks-absorption-GEMINI.md`
- `hooks-absorption-CLAUDE-review.md`
- `hooks-absorption-CODEX-review.md`

Gemini failed before producing a model result for this area. Per Step 11 fallback handling, the workflow proceeded with real Claude and Codex perspectives only. The Gemini artefact records `[gemini unavailable — double-spawn]` and no substitute Sonnet analysis was used.

### Phase 3 Dissent Hardening Gates
- `dissent-hardening-CLAUDE.md`
- `dissent-hardening-CODEX.md`
- `dissent-hardening-GEMINI.md`
- `dissent-hardening-CLAUDE-review.md`
- `dissent-hardening-CODEX-review.md`
- `dissent-hardening-GEMINI-review.md`

### CI/Offline Failure Semantics
- `ci-offline-CLAUDE.md`
- `ci-offline-CODEX.md`
- `ci-offline-GEMINI.md`
- `ci-offline-CLAUDE-review.md`
- `ci-offline-CODEX-review.md`
- `ci-offline-GEMINI-review.md`

## Resolved Questions

### 1. Parity Fixture Source and Coverage Shape

**Question:** Which fixture and coverage strategy should Phase 4 use?

**Decision:** [consensus] Use a hybrid layered parity strategy: inline typed factories for runtime/unit behaviours and committed generated JSON fixtures for integration and staleness gates, with hard CI diff failures.

**Rationale:** Static fixtures are best for corpus enumeration, identity, and drift detection; inline typed harnesses are best for dynamic runtime behaviours such as HITL, fallback, locking, and branch dispatch. A single fixture style would either miss runtime semantics or make staleness checks too opaque.

**Question:** What fixture contract and refresh/check command should be used?

**Decision:** [majority: Claude+Codex] Use the SDK generated-fixture hierarchy rather than `.planning/parity`. Wave 0 must reconcile exact Phase 1 paths, then lock repo-contained generated compiler/parity fixtures under `sdk/src/generated/*` or existing compile-baseline equivalents.

**Dissent/nuance:** Gemini preferred a more explicit `.planning/parity` style location, but the majority favoured keeping generated proof assets near SDK/compiler outputs so CI can treat them as part of the SDK contract.

**Question:** What HITL minimum coverage is required?

**Decision:** [majority: Claude+Gemini] Require suspend, resume-success, and resume-failure coverage for HITL workflows with typed failure variants. Timeout is not universal unless the manifest or runner contract introduces it.

**Question:** What HITL seam shape and fixture metadata are required?

**Decision:** [majority: Claude+Codex] Use an injectable typed HITL input/suspension provider seam. Static fixtures may enumerate HITL workflow IDs, suspension points, and resumable outcomes, but per-run HITL path choices stay in inline harness assertions. Env-var driven HITL injection is rejected.

**Question:** What is the authoritative dynamic-branch taxonomy source?

**Decision:** [consensus] Derive dynamic-branch workflow and `branchId` taxonomy from live compiler manifests such as command-classification and workflow-semantics outputs. Do not hand-maintain a static branch manifest.

**Question:** How should `gsd-post-update` no-op proof work inside the parity fixture decision?

**Decision:** [consensus] Use a repo-contained disposition manifest that enumerates every audited side effect with absorbed/open-gap disposition and evidence checks. CI must not invoke a user-local `gsd-post-update` script path.

### 2. gsd-post-update Disposition and No-op Retirement Gate

**Question:** What is the primary retirement-gate mechanism?

**Decision:** [consensus] Use a compiler-emitted, repo-contained committed JSON disposition manifest for every audited `gsd-post-update` behaviour. Retirement is blocked until every behaviour has disposition, requirement linkage, target surface, `retirementStatus`, and strict automated evidence.

**Question:** Where should the disposition manifest live?

**Decision:** [majority: Claude+Gemini] Store the manifest in the generated parity artefact area for Phase 4, with Wave 0 reconciling exact existing generated path convention.

**Dissent/nuance:** Codex agreed on compiler emission and strict schema but preferred a generated compile path rather than a generated parity path. The context records the unresolved exact path as a Wave 0 reconciliation detail rather than a permission to move the manifest outside generated SDK outputs.

**Question:** Should no-op proof invoke the legacy `gsd-post-update` script?

**Decision:** [consensus] No. Prove UPDT-04 through manifest-derived repo-contained probes and static no-invocation/unreachability checks. No parity test may invoke `gsd-post-update`.

**Question:** How strict must evidence predicates be?

**Decision:** [consensus] Evidence predicates must be automated and repo-contained. Documentation-only evidence is insufficient; off-repo runtime/config behaviours require a repo-contained schema proxy or remain open-gap.

**Question:** How should HOOK-06 ordering be enforced?

**Decision:** [consensus] HOOK-06 is a hard prerequisite for retirement. Planning must sequence hook absorption before terminal retirement, and CI must enforce hook-related disposition entries remain open-gap until hook install/build fixes pass.

**Question:** Should terminal retirement be deletion or tombstone stub?

**Decision:** [majority: Codex+Gemini] Prefer a tombstone stub that exits successfully with a deprecation warning after all gates pass, unless implementation planning proves repo references can be hard-deleted without breaking supported packaging.

**Dissent/nuance:** Claude preferred hard deletion or deferring the retirement form. Majority chose tombstone to preserve external compatibility while still forbidding parity tests from invoking the command.

### 3. Hook Install/Build Absorption Path

**Provider note:** Gemini was unavailable for this area. Decisions are based on Claude+Codex double-spawn fallback and are marked accordingly in `04-CONTEXT.md`.

**Question:** What implementation strategy should absorb hook install/build fixes?

**Decision:** [consensus; gemini unavailable — double-spawn] Start with the dedicated in-place `install.js` bug-fix plan from `.plans/1755-install-audit-fix.md`. Do not perform broad helper extraction; allow only tiny local helpers if needed.

**Question:** Should `hooks/dist` build/package validation be mandatory?

**Decision:** [consensus; gemini unavailable — double-spawn] Yes. A mandatory build gate proving `hooks/dist` is populated and fresh is required for HOOK-01/HOOK-02. This is a build gate, not a publish pipeline redesign.

**Question:** What is the authoritative hook inventory source?

**Decision:** [majority: Codex; gemini unavailable — double-spawn] Use the generated hook-install manifest as the canonical CI comparison source, while Wave 0 must reconcile it against `scripts/build-hooks.js` managed-hook lists and report conflicts before fixes.

**Question:** What hook-specific coverage is required?

**Decision:** [consensus; gemini unavailable — double-spawn] Add tests for the dual Codex hook-copy path with exact filename/path assertions, `.sh` uninstall manifest coverage across event buckets, stale cache refresh from source rather than skip, executable permissions, and no network fetches.

**Question:** How should HOOK-06 ordering connect to retirement?

**Decision:** [consensus; gemini unavailable — double-spawn] `PLAN.md` must sequence hook absorption before retirement declaration, and CI must require hook tests, `npm run build:hooks` or equivalent, and manifest validation before terminal retirement.

**Question:** What Wave 0 task is required before writing fixes?

**Decision:** [consensus; gemini unavailable — double-spawn] Include a Wave 0 diff audit of `.plans/1755-install-audit-fix.md` line references against live code because some fixes may already be partially landed.

### 4. Phase 3 Dissent Hardening Gates

**Question:** How should Phase 4 classify the five Phase 3 verification dissent items?

**Decision:** [consensus] Treat all five as Wave 0 prerequisites before parity fixture generation, hook absorption, or `gsd-post-update` retirement gates.

**Question:** Are any dissent items standalone retirement blockers?

**Decision:** [majority: Codex+Gemini] Runtime reports from undeclared agents and mandatory-provider omission are standalone retirement blockers; all five collectively block retirement because parity cannot be green until Wave 0 is green.

**Question:** How should undeclared runtime report agents behave?

**Decision:** [consensus] Reject undeclared runtime report agents fail-closed with a typed blocking event and no FSM advance. System/runtime reports are only valid through an explicit reserved actor or typed non-agent report mode in the packet contract.

**Question:** How deep should `packet.expectedEvidence` enforcement be?

**Decision:** [consensus] Enforce `expectedEvidence` fail-closed using exact matching against the union of validated completion markers and artefact evidence, with no new DSL and no advisory-only mode.

**Question:** How should PhaseRunner `init-required` fail-open be handled?

**Decision:** [majority: Claude+Codex] `PhaseRunner` must fail closed on `init-required` or skipped transition history for normal execution. A narrow explicit test-only `noFsmForTesting` bypass may exist only for unit tests.

**Question:** What is authoritative for mandatory-provider enforcement?

**Decision:** [majority: Claude+Codex] Authoritative metadata is compiler-emitted packet mandatory-provider metadata derived from workflow semantics/config at packet emission time, not caller-supplied arrays. Detection and runner wiring both belong in Wave 0.

**Dissent/nuance:** Gemini wanted further human judgment on cadence. The majority decision locks init/packet-time enforcement for Phase 4 while leaving implementation sequencing to the planner.

**Question:** How should dynamic branch IDs be enforced?

**Decision:** [consensus] Dynamic branch dispatch must fail strictly on unknown, absent, or empty `branchId`s using a typed `unknown-branch-id`/branch validation event. No default fallback is allowed.

### 5. CI/Offline Failure Semantics

**Question:** What overall CI gate shape should Phase 4 use?

**Decision:** [majority: Claude+Codex] Use a single canonical npm entry point such as `npm run phase4:parity`, implemented as named sequential CI steps for observability.

**Dissent/nuance:** This reconciles Codex's single-gate preference with Claude/Gemini's named-step visibility. Required named steps include Wave 0 hardening, hook build, hook install tests, SDK compile check, staleness gate, parity suite, and static offline/retirement scans.

**Question:** How should failures be reported?

**Decision:** [consensus] Fail fast with hard non-zero exits on the first gate failure. Every failure must carry a named PRTY/HOOK/UPDT diagnostic code.

**Question:** How should no-network semantics be enforced?

**Decision:** [majority: Claude+Codex] Use layered enforcement: static scans for forbidden external-host strings such as `raw.githubusercontent.com` plus a Node preload/runtime blocker for network primitives during parity commands. External hosts are banned; loopback is banned by default with an explicit documented escape hatch only if necessary.

**Question:** How should golden staleness detection work?

**Decision:** [consensus] Run a named PRTY-06 staleness step that regenerates/canonicalises compile/parity JSON into a deterministic location or temp output and fails on exact diff against committed fixtures.

**Question:** What scope should the `test.skip`/`test.todo` ban cover?

**Decision:** [majority: Claude+Codex] Ban `test.skip`/`test.todo` in Phase 4 parity and hook/retirement gate globs rather than all repository tests.

**Question:** How should provider/HITL mocks be standardised?

**Decision:** [consensus] Use explicit dependency injection with typed Provider/HITL/filesystem/lock factory helpers, centralised in a shared parity mock module. Network interceptors are defensive enforcement only.

**Question:** Where should the hook build gate run?

**Decision:** [consensus] Run `npm run build:hooks` or equivalent as a distinct sequential CI step before hook install regression tests and before parity/retirement gates.

**Question:** What scope should the no `gsd-post-update` invocation scan cover?

**Decision:** [majority: Claude+Codex] Scan all Phase 4 parity, hook, retirement, CI, script, package, and generated parity surfaces that could invoke the command, with an allowlist for disposition labels/docs that mention it only as audit text.

## Deferred Ideas

None. The discussion stayed within Phase 4 scope.

## Checkpoint

The structured decision checkpoint is `.planning/phases/04-parity-suite-gsd-post-update-retirement/04-DISCUSS-CHECKPOINT.json`.
