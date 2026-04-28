# Phase 4: Parity Suite + gsd-post-update Retirement - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 builds the parity and retirement gate that makes `gsd-post-update` unnecessary. It must first harden the Phase 3 runtime trust-boundary gaps, then generate deterministic compiler/parity fixtures from live inventories, absorb tracked hook install/build behaviours into supported repo-owned surfaces, and prove through hermetic CI that every audited `gsd-post-update` side effect is either absorbed with automated evidence or remains a blocking open gap.

This phase does not migrate additional workflow behaviour for convenience, weaken parity gates, or invoke a user-local `gsd-post-update` script. Compatibility cleanup and terminal retirement form are only valid after the parity, hook, and disposition gates pass.

</domain>

<decisions>
## Implementation Decisions

### Parity Fixture Source and Coverage Shape
- **D-01:** [consensus] Use a hybrid layered parity strategy: inline typed factories for runtime/unit behaviours and committed generated JSON fixtures for integration and staleness gates. Static fixtures prove full-corpus enumeration and identity; inline harnesses prove dynamic dispatch, HITL, fallback, lock, and concurrency behaviours.
- **D-02:** [majority: Claude+Codex] Use the SDK generated-fixture hierarchy rather than `.planning/parity`. Wave 0 must reconcile exact existing Phase 1 generated paths, but the locked direction is repo-contained generated compiler/parity fixtures under `sdk/src/generated/*` or existing compile-baseline equivalents, refreshed and checked by a single parity/baseline command that CI can run in check mode with exact diff failure.
- **D-03:** [majority: Claude+Gemini] Require suspend, resume-success, and resume-failure coverage for HITL workflows with typed failure variants. Timeout is not universal unless the semantic manifest or runner contract explicitly introduces it.
- **D-04:** [majority: Claude+Codex] Define or use an injectable typed HITL input/suspension provider seam if absent. Committed fixtures may enumerate HITL workflow IDs, suspension points, and resumable outcomes for coverage, but per-run HITL path choices stay in inline harness assertions, not static fixtures. Env-var driven HITL injection is rejected.
- **D-05:** [consensus] Derive dynamic-branch workflow and `branchId` taxonomy from live compiler manifests such as command-classification and workflow-semantics outputs. Do not hand-maintain a static branch manifest; CI staleness gates must fail on drift.
- **D-06:** [consensus] Use a repo-contained `gsd-post-update` disposition manifest that enumerates every audited side effect with an absorbed/open-gap disposition and evidence checks. CI must not invoke a user-local `gsd-post-update` script path; include a lightweight no-invocation/static scan as part of the gate.

### gsd-post-update Disposition and Retirement Gate
- **D-07:** [consensus] Use a compiler-emitted, repo-contained committed JSON disposition manifest for every audited `gsd-post-update` behaviour. Retirement is blocked until every behaviour has a disposition, requirement linkage, target surface, `retirementStatus`, and strict automated evidence check; open-gap entries fail the retirement gate.
- **D-08:** [majority: Claude+Gemini] Store the disposition manifest in the generated parity artefact area for Phase 4, with Wave 0 reconciling the exact existing generated path convention. Codex accepted compiler emission and strict schema but differed between generated/compile and generated/parity paths.
- **D-09:** [consensus] Do not invoke the legacy `gsd-post-update` script for proof. UPDT-04 is proved through manifest-derived repo-contained probes and static no-invocation/unreachability checks.
- **D-10:** [consensus] Evidence predicates must be automated and repo-contained. Documentation-only evidence is not sufficient; off-repo runtime/config behaviours require a repo-contained schema proxy or remain open-gap.
- **D-11:** [consensus] HOOK-06 is a hard prerequisite for retirement. Planning should sequence hook absorption before terminal retirement, and CI should enforce that all hook-related disposition entries remain open-gap until hook install/build fixes pass.
- **D-12:** [majority: Codex+Gemini] Prefer a tombstone stub that exits successfully with a deprecation warning after all gates pass, unless implementation planning proves repo references can be hard-deleted without breaking supported packaging. Claude preferred deletion/deferral, but tombstone preserves external compatibility while keeping parity tests free of `gsd-post-update` invocation.

### Hook Install/Build Absorption Path
- **D-13:** [consensus; gemini unavailable — double-spawn] Start with the dedicated in-place `install.js` bug-fix plan from `.plans/1755-install-audit-fix.md`. Do not perform broad helper extraction; allow only tiny local helpers if needed to prevent direct duplicated inconsistency.
- **D-14:** [consensus; gemini unavailable — double-spawn] A mandatory build gate proving `hooks/dist` is populated and fresh is required for HOOK-01/HOOK-02. Scope it as a build gate, not a full publish pipeline redesign.
- **D-15:** [majority: Codex; gemini unavailable — double-spawn] Use the generated hook-install manifest as the canonical CI comparison source, while Wave 0 must reconcile it against `scripts/build-hooks.js` managed-hook lists and report conflicts before fixes. Missing managed hooks are hard failures; optional/community hook gaps may remain warnings.
- **D-16:** [consensus; gemini unavailable — double-spawn] Add tests for the dual Codex hook-copy path with exact filename/path assertions, `.sh` uninstall manifest coverage across event buckets, stale cache refresh from source rather than skip, executable permissions, and no network fetches.
- **D-17:** [consensus; gemini unavailable — double-spawn] `PLAN.md` must sequence hook absorption before retirement declaration, and CI must require hook tests, `npm run build:hooks` or equivalent, and manifest validation to pass before terminal `gsd-post-update` retirement.
- **D-18:** [consensus; gemini unavailable — double-spawn] Include a Wave 0 diff audit of `.plans/1755-install-audit-fix.md` line references against live code before implementing, because some fixes may already be partially landed.

### Phase 3 Dissent Hardening Gates
- **D-19:** [consensus] Treat all five Phase 3 verification dissent items as Wave 0 prerequisites before parity fixture generation, hook absorption, or `gsd-post-update` retirement gates. They are trust-boundary hardening items for the parity suite itself, not ordinary parity assertions and not deferred concerns.
- **D-20:** [majority: Codex+Gemini] Runtime reports from undeclared agents and mandatory-provider omission are standalone retirement blockers; all five collectively block retirement through the requirement that parity cannot be green until Wave 0 is green.
- **D-21:** [consensus] Reject undeclared runtime report agents fail-closed with a typed blocking event and no FSM advance. System/runtime reports are only valid through an explicit reserved actor or typed non-agent report mode in the packet contract; there is no silent bypass.
- **D-22:** [consensus] Enforce `packet.expectedEvidence` fail-closed using exact matching against the union of validated completion markers and artefact evidence, with no new DSL and no advisory-only mode. Missing expected evidence emits a typed blocking event.
- **D-23:** [majority: Claude+Codex] `PhaseRunner` must fail closed on `init-required` or skipped transition history for normal execution. A narrow explicit test-only `noFsmForTesting` bypass may exist only for unit tests, never user config, parity gates, or retirement gates; blocking events still block.
- **D-24:** [majority: Claude+Codex] Mandatory-provider enforcement is authoritative from compiler-emitted packet mandatory-provider metadata derived from workflow semantics/config at packet emission time, not caller-supplied arrays. Both detection and runner wiring belong in Wave 0; Gemini wanted further human judgment on cadence, but the majority locks init/packet-time enforcement for Phase 4.
- **D-25:** [consensus] Dynamic branch dispatch must fail strictly on unknown, absent, or empty `branchId`s using a typed `unknown-branch-id`/branch validation event. No default fallback is allowed; compiler-level branch validation is a Wave 0 deliverable.

### CI and Offline Failure Semantics
- **D-26:** [majority: Claude+Codex] Use a single canonical npm entry point such as `npm run phase4:parity`, implemented as named sequential CI steps for observability: Wave 0 hardening, hook build, hook install tests, SDK compile check, staleness gate, parity suite, and static offline/retirement scans.
- **D-27:** [consensus] Fail fast with hard non-zero exits on the first gate failure. Every failure must carry a named PRTY/HOOK/UPDT diagnostic code; no warning-only parity failures and no weakened assertions are allowed.
- **D-28:** [majority: Claude+Codex] Use layered no-network enforcement: static scans for forbidden external-host strings such as `raw.githubusercontent.com` plus a Node preload/runtime blocker for network primitives during parity commands. External hosts are banned; loopback is banned by default with an explicit `allowLoopback`-style escape hatch only if a Phase 4 test proves it is necessary and documents the justification.
- **D-29:** [consensus] Run a named PRTY-06 staleness step inside the Phase 4 parity gate that regenerates/canonicalises compile/parity JSON into a deterministic location or temp output and fails on exact diff against committed fixtures unless the refresh is intentionally committed.
- **D-30:** [majority: Claude+Codex] Ban `test.skip`/`test.todo` in Phase 4 parity and hook/retirement gate globs rather than all repository tests. Final file globs are implementation details, but must cover `sdk/src/parity/**` and Phase 4 hook/install/retirement tests.
- **D-31:** [consensus] Use explicit dependency injection with typed Provider/HITL/filesystem/lock factory helpers, centralised in a shared parity mock module. Network interceptors may exist only as defensive enforcement, not as the primary mocking mechanism.
- **D-32:** [consensus] Run `npm run build:hooks` or the equivalent hook build command as a distinct sequential CI step before hook install regression tests and before parity/retirement gates. Do not hide the only build check inside a test `before()` block.
- **D-33:** [majority: Claude+Codex] Scan all Phase 4 parity, hook, retirement, CI, script, package, and generated parity surfaces that could invoke `gsd-post-update`, with an allowlist for disposition labels/docs that mention it only as audit text. The scan must reject executable invocations and hardcoded fallback calls.

### Folded Todos
- Phase 3 verifier dissent is folded into Phase 4 Wave 0 hardening: undeclared-agent runtime reports, `packet.expectedEvidence`, `init-required` fail-open behaviour, mandatory provider omission, and dynamic branch allowlisting must be closed before parity/retirement gates can be trusted.
- `.plans/1755-install-audit-fix.md` is folded into hook absorption scope as the starting audit plan, subject to a live-code diff audit before implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` — Project boundary, active Phase 4 scope, core value, and out-of-scope constraints.
- `.planning/REQUIREMENTS.md` — Locked requirement IDs for compiler, packet, hook, update, and parity gates.
- `.planning/STATE.md` — Current project state and Phase 3 verifier dissent that Phase 4 must harden.

### Prior Phase Context and Verification
- `.planning/phases/01-compiler-audit-foundation/01-CONTEXT.md` — Compiler/audit foundation context and generated manifest assumptions.
- `.planning/phases/02-packet-schema-state-contracts/02-CONTEXT.md` — Packet schema and FSM state contract context.
- `.planning/phases/03-advisory-runner-query-integration/03-CONTEXT.md` — Advisory runner and query integration context.
- `.planning/phases/03-advisory-runner-query-integration/03-VERIFICATION-CODEX.md` — Supplemental Phase 3 verification dissent to harden in Wave 0.
- `.planning/phases/03-advisory-runner-query-integration/03-VERIFICATION-GEMINI.md` — Supplemental Phase 3 verification dissent to harden in Wave 0.

### Hook and Installer Absorption
- `.plans/1755-install-audit-fix.md` — Starting hook install/build bug audit; must be reconciled against live code before edits.
- `scripts/build-hooks.js` — Canonical hook build script and managed hook inventory source to reconcile.
- `bin/install.js` — Installer target for in-place hook install/build fixes.

### CI and Package Surfaces
- `.github/workflows/test.yml` — CI surface where Phase 4 named gates and offline checks must integrate.
- `package.json` — npm script surface for canonical Phase 4 parity and hook build entry points.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Compiler manifests from Phase 1: source of truth for command, workflow, agent, hook, classification, billing-boundary, and summary inventories.
- Runtime packet and FSM contracts from Phase 2 and Phase 3: foundation for fail-closed `expectedEvidence`, mandatory-provider metadata, runtime report actor validation, and branch validation.
- Existing hook build path: `scripts/build-hooks.js` and `hooks/dist/` form the supported hook build surface for Phase 4 gates.
- Existing installer path: `bin/install.js` is the in-place target for hook install bug absorption.

### Established Patterns
- Generated manifests are authoritative and machine-readable; hand-maintained parity manifests are rejected unless produced from live compiler outputs.
- Default advisory paths must remain hermetic and must not call model APIs, external hosts, or user-local `gsd-post-update` scripts.
- PhaseRunner/WorkflowRunner should emit typed blocking events rather than silently continuing when trust-boundary checks fail.
- Tests and gates should fail hard with named diagnostics rather than warning-only output.

### Integration Points
- Phase 4 Wave 0 hardening connects directly to packet validation, runtime report handling, provider metadata, branch dispatch, and PhaseRunner init/resume handling.
- Hook absorption connects `scripts/build-hooks.js`, generated hook-install manifests, `hooks/dist/`, install regression tests, and package/CI scripts.
- Retirement proof connects compiler-generated disposition manifests, UPDT/HOOK/PRTY evidence predicates, static no-invocation scans, and CI parity gates.

</code_context>

<specifics>
## Specific Ideas

- Use `npm run phase4:parity` or an equivalent canonical npm entry point, surfaced in CI as named sequential steps for observability.
- Include named steps for Wave 0 hardening, hook build, hook install tests, SDK compile check, staleness gate, parity suite, and static offline/retirement scans.
- Use exact canonical JSON diffs for generated parity/compile fixtures rather than hash-only checks.
- Use typed dependency-injected mock factories for providers, HITL, filesystem, and locks; network interceptors are defensive only.
- Use a scoped `test.skip`/`test.todo` ban for Phase 4 parity and hook/retirement gate globs.
- Use a broad executable-surface scan for `gsd-post-update` invocation with an allowlist for audit/disposition text.
- Prefer a tombstone `gsd-post-update` stub with a deprecation warning after all gates pass, unless planning proves hard deletion is safe.
- Gemini was unavailable for the hook absorption gray area; decisions there are explicitly marked as real Claude+Codex double-spawn fallback decisions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-parity-suite-gsd-post-update-retirement*
*Context gathered: 2026-04-28*
