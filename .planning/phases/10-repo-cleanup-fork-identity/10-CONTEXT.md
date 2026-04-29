# Phase 10: Repo Cleanup + Fork Identity - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Confidence:** Reduced — Claude leg skipped because provider quota was exhausted; Codex and Gemini completed initial and cross-review auto-discussion.

<domain>
## Phase Boundary

Phase 10 cleans repository state and rewrites active identity surfaces so this checkout reads as Jacob Clayden's fork of upstream GSD. It may audit tracked and untracked artefacts, remove or ignore local/generated/stale files, justify intentional release/build assets, update active documentation and metadata, and validate that cleanup did not break build/test/parity/security expectations.

This phase must not change advisory FSM behaviour, weaken parity gates, move runtime execution into the SDK, reopen Phase 9 metadata decisions, remove source/tests/planning/release assets without evidence they are obsolete, or silently erase upstream provenance.

</domain>

<decisions>
## Implementation Decisions

### Fork identity and package compatibility
- **D-01:** [available-leg consensus: Codex+Gemini; Claude skipped] Active identity surfaces must describe this repository as Jacob Clayden's fork of upstream GSD and credit upstream rather than presenting the fork as the canonical upstream distribution.
- **D-02:** [available-leg consensus: Codex+Gemini; Claude skipped] Keep existing package names and executable/bin names for Phase 10. Update metadata, URLs, descriptions, install text, and source-clone instructions, but defer scoped package renames or new publish strategy to a separate release/publishing phase.
- **D-03:** [available-leg consensus: Codex+Gemini; Claude skipped] Treat visible install/help/error text in `README.md`, package metadata, docs install surfaces, and bin/install shims as identity surfaces. Update user-facing strings where they identify the repository, source URL, maintainer, or install path; do not change runtime behaviour merely for rebranding.
- **D-04:** [available-leg consensus: Codex+Gemini; Claude skipped] Preserve historical upstream references in changelogs, specs, handover notes, and audit records when they are lineage/history rather than current install or ownership instructions.

### Documentation language surfaces
- **D-05:** [disputed: Codex preserve/update notices; Gemini remove] The planner must choose a bounded policy for translated READMEs and localised docs before execution. Codex recommends preserving them with fork/current-install notices to avoid destructive churn; Gemini recommends removing them until retranslation is explicitly scheduled to avoid stale upstream-specific guidance. Either path must be intentional, documented, and avoid leaving active install instructions that contradict the fork identity.

### Artefact hygiene and tracking policy
- **D-06:** [available-leg consensus: Codex+Gemini; Claude skipped] Preserve `.planning/` as intentional audit/project state for this migration, not ephemeral clutter. If its tracked/ignored status is inconsistent, document and normalise the policy rather than deleting planning evidence.
- **D-07:** [available-leg consensus: Codex+Gemini; Claude skipped] Treat local tool state, dependency installs, caches, OS files, and temporary worktrees as removable or ignored clutter: `.omc/`, `.claude/`, `.DS_Store`, `node_modules/`, `tmp/`, `.worktrees/`, and equivalent local-only artefacts should not remain tracked.
- **D-08:** [available-leg consensus: Codex+Gemini; Claude skipped] Treat generated distribution outputs such as `sdk/dist/` and `hooks/dist/` as release/build assets when they are intentionally tracked by packaging. Do not remove them as generic temp files unless package scripts and release requirements prove they are obsolete.
- **D-09:** [available-leg consensus: Codex+Gemini; Claude skipped] Tracked one-off files are audited case by case. `.release-monitor.sh` is presumed stale local monitoring and should be removed unless planning finds live usage. `.clinerules` should be retained because tests intentionally cover Cline support. `.plans/1755-install-audit-fix.md` should not remain an active root planning artefact once any still-needed evidence is preserved in canonical planning docs or tests.

### Legacy update machinery
- **D-10:** [disputed: Codex audited/tombstone removal; Gemini full removal] Do not delete `gsd-post-update` or fallback update logic merely because it is legacy. Phase 4 retired its need, but Phase 10 must audit live references and compatibility expectations before deciding between full removal, removal of dead fallback paths, or retaining a deprecated no-op/tombstone surface. Gemini recommends full removal if parity passes; Codex recommends removing only proven-dead code while preserving compatibility where users may still invoke it.

### Validation and safety
- **D-11:** [available-leg consensus: Codex+Gemini; Claude skipped] Validation must use existing build, test, parity, and security/no-secret surfaces. Record known pre-existing failures explicitly instead of weakening tests or treating cleanup as permission to reduce coverage.
- **D-12:** [available-leg consensus: Codex+Gemini; Claude skipped] File removals must be staged intentionally and supported by evidence. No source, test, planning, generated release asset, or documentation tree may be removed solely because it looks old.

### Claude's Discretion
Downstream planners may choose exact audit commands, edit order, and wording, but must preserve the reduced-confidence labels above. Disputed decisions require explicit plan tasks that gather evidence before choosing the destructive path.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and project constraints
- `.planning/ROADMAP.md` — Phase 10 goal and success criteria for repo cleanup, tracked-file hygiene, fork identity, documentation metadata, and validation.
- `.planning/PROJECT.md` — Migration constraints: preserve upstream-facing behaviour unless FSM migration requires drift, SDK advises while runtime executes, billing boundary remains intact, parity gates cannot be weakened.
- `.planning/STATE.md` — Current project state showing Phase 10 as repo-cleanup-fork-identity and pending todo context.
- `.planning/phases/09-milestone-audit-metadata-reconciliation/09-CONTEXT.md` — Prior evidence hierarchy and metadata-only discipline that Phase 10 must not undo.

### Codebase maps
- `.planning/codebase/STACK.md` — Node/npm package structure, SDK/package dependencies, generated distribution outputs, runtime/package requirements.
- `.planning/codebase/STRUCTURE.md` — Directory layout and intentional surfaces including `sdk/dist/`, `hooks/`, `docs/`, `.planning/`, agents, commands, workflows, and package entry points.
- `.planning/codebase/CONVENTIONS.md` — Naming, error-handling, logging, and test conventions to preserve when editing source-adjacent files.

### Identity and install surfaces to audit
- `README.md` — Primary active identity and install surface.
- `package.json` — Root package metadata, bin definitions, scripts, repository identity, and package name compatibility surface.
- `sdk/package.json` — SDK sub-package metadata and package identity surface.
- `docs/` — User-facing documentation tree, including install/update guidance and localised docs.
- `bin/install.js` — Install/source clone and user-facing install-error text surface.
- `bin/gsd-sdk.js` — SDK CLI shim; audit for identity/help text without changing behaviour unnecessarily.

### Cleanup-sensitive artefacts
- `.gitignore` — Source of truth for local-only and generated artefact ignore policy.
- `.clinerules` — Retain unless tests and Cline-support requirements prove it obsolete.
- `tests/cline-support.test.cjs` — Evidence that `.clinerules` is intentional support, not random root clutter.
- `.release-monitor.sh` — Presumed stale local monitoring artefact to remove unless live usage is found.
- `.plans/1755-install-audit-fix.md` — Root one-off plan artefact; preserve any still-needed evidence in canonical planning docs/tests before removing or archiving.
- `sdk/dist/` — Generated but currently distribution-relevant output; treat as release asset until package evidence says otherwise.
- `hooks/dist/` — Generated hook distribution output; treat as release/install asset until package evidence says otherwise.

### Discussion artefacts
- `.planning/phases/10-repo-cleanup-fork-identity/discussion/phase10-CODEX.md` — Codex initial and cross-review positions.
- `.planning/phases/10-repo-cleanup-fork-identity/discussion/phase10-GEMINI.md` — Gemini initial and cross-review positions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing package scripts and build outputs define what generated artefacts are release assets versus disposable local output.
- Existing `.planning/` artefacts are part of the migration audit record and must be preserved as evidence.
- Existing tests can prove whether support files such as `.clinerules` are intentional.

### Established Patterns
- Phase 9 established that planning metadata follows verified evidence and that historical audit records should not be rewritten casually.
- The project preserves upstream agent-facing behaviour unless there is a concrete FSM migration reason to drift.
- Packaging currently uses existing bin/package names as compatibility surfaces; identity text can change without renaming commands.

### Integration Points
- Repository identity updates connect through README/docs, package metadata, install scripts, and any source-clone fallback URLs.
- Cleanup decisions connect through `.gitignore`, git status, tracked-file inventory, packaging manifests, tests, and release/build scripts.
- Validation connects through the existing SDK build/test/parity/security gates rather than new weakened cleanup-only checks.

</code_context>

<specifics>
## Specific Ideas

- Prefer wording like: "Jacob Clayden's fork of upstream GSD" so provenance and ownership are both clear.
- Install instructions should not imply that upstream npm/source URLs install Jacob's fork. If package names remain unchanged, source install instructions and repository URLs must disambiguate the fork.
- Retaining package/bin names is a compatibility decision, not a claim that the fork is upstream.
- Destructive doc/code removals should have explicit audit evidence in the plan before execution.

</specifics>

<deferred>
## Deferred Ideas

- Scoped npm package rename, fork-specific publish pipeline, and package-name migration strategy are deferred to a separate release/publishing phase.
- Full retranslation or regeneration of localised documentation is deferred unless Phase 10 chooses removal and a later translation phase is scheduled.
- Historical changelog/spec rewriting is deferred; preserve upstream lineage records unless they mislead users about current install or ownership.
- Broad workflow Markdown slimming remains deferred per Phase 6 blocked-pilot outcome until durable typed-transition and packet-sequencing evidence exists.

</deferred>

---

*Phase: 10-repo-cleanup-fork-identity*
*Context gathered: 2026-04-29*
