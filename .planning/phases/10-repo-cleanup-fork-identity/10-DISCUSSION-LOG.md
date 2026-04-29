# Phase 10: Repo Cleanup + Fork Identity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 10-repo-cleanup-fork-identity
**Mode:** `--auto --chain`
**Confidence:** Reduced — Claude quota was exhausted; Codex and Gemini completed initial and cross-review discussion legs.
**Areas discussed:** Fork identity and package compatibility, documentation language surfaces, artefact hygiene and tracking policy, legacy update machinery, validation and safety

---

## Fork identity and package compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Fork identity with package/bin compatibility | Update identity text/metadata/source URLs while keeping existing package and executable names for now. | ✓ |
| Full rename/re-publish | Rename packages and binaries as part of cleanup. | |
| Minimal docs-only note | Add a short fork notice without auditing package/install surfaces. | |

**Auto-selection:** Fork identity with package/bin compatibility.
**Notes:** Codex and Gemini agreed package/bin names are compatibility surfaces and scoped publish strategy should be deferred.

---

## Documentation language surfaces

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve translated docs with fork notices | Keep localised docs and update/annotate active install surfaces. | contested |
| Remove translated docs until retranslation | Delete translated READMEs/localised docs to avoid stale upstream guidance. | contested |
| Ignore localised docs | Update only English docs and leave translations untouched. | |

**Auto-selection:** No full consensus. CONTEXT.md records this as a disputed reduced-confidence decision requiring planner evidence before destructive changes.
**Notes:** Codex favoured preservation to avoid destructive churn; Gemini favoured removal to avoid stale guidance and maintenance burden.

---

## Artefact hygiene and tracking policy

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence-based audit | Preserve intentional audit/release assets; remove or ignore local-only clutter; decide one-offs case by case. | ✓ |
| Aggressive cleanup | Remove all generated-looking or old-looking files. | |
| Documentation-only policy | Document cleanup expectations without changing files. | |

**Auto-selection:** Evidence-based audit.
**Notes:** Both providers agreed `.planning/` should be preserved as audit/project state, local-only state should be ignored/removed, and `.clinerules` should be retained because tests cover it.

---

## Legacy update machinery

| Option | Description | Selected |
|--------|-------------|----------|
| Audit then remove only proven-dead paths | Remove dead `gsd-post-update`/fallback logic only after live-reference and compatibility audit; keep no-op/tombstone if needed. | contested |
| Full removal | Remove all `gsd-post-update` source and fallback logic if parity passes. | contested |
| Retain as-is | Leave legacy update machinery untouched. | |

**Auto-selection:** No full consensus. CONTEXT.md records this as a disputed reduced-confidence decision requiring planner evidence before destructive deletion.
**Notes:** Codex favoured compatibility-safe audited removal; Gemini favoured full removal as cleanup after Phase 4 retirement.

---

## Validation and safety

| Option | Description | Selected |
|--------|-------------|----------|
| Existing gates plus no-secret audit | Use build/test/parity/security surfaces and record known pre-existing failures. | ✓ |
| Cleanup-specific smoke only | Run minimal smoke checks because this is mostly docs/files. | |
| Adjust gates for cleanup | Weaken or skip failing gates. | |

**Auto-selection:** Existing gates plus no-secret audit.
**Notes:** Both providers agreed cleanup must not weaken parity/tests or hide known pre-existing failures.

---

## Claude's Discretion

- Exact audit command set, edit order, and wording are left to downstream planning.
- Disputed destructive choices must be resolved by evidence in the plan before execution.

## Deferred Ideas

- Scoped npm package rename and fork-specific publishing strategy.
- Full retranslation/regeneration of localised documentation.
- Historical changelog/spec rewriting beyond misleading active identity/install surfaces.
- Broad workflow Markdown slimming until durable evidence unblocks the Phase 6 pilot.
