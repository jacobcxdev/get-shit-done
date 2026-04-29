# Phase 10 Auto-Discussion — Gemini

Reduced-confidence auto-discussion: Claude leg skipped due exhausted quota; this is a Gemini decision artefact.

## Domain Boundary

Phase 10 focuses exclusively on Repo Cleanup + Fork Identity. The goal is to clean the repository state in git and on the filesystem, ensure only intentional source/docs/assets remain tracked, and update documentation and meta files to reflect Jacob Clayden's fork of upstream GSD. This phase must not alter the executed FSM migration logic, weaken parity gates, or modify core SDK behaviour. Success is determined by a clean git status, zero tracked ephemeral/secret files, updated package metadata, and passing build/test suites.

## Initial Decisions

1. **Scope of fork identity in documentation and metadata** — Rewrite `README.md`, `package.json`, `docs/USER-GUIDE.md`, and bin shims (`bin/install.js`, `bin/gsd-sdk.js`) to explicitly state this is Jacob Clayden's fork with the advisory FSM migration. Upstream branding should be removed or contextualised, but original `LICENSE` copyright notices must remain intact.
2. **Treatment of upstream multi-language documentation** — Stage removal of all upstream translated READMEs and localised `docs/` subdirectories.
3. **Ephemeral state vs durable audit evidence** — Preserve `.planning/` as read-only audit evidence for the v1 FSM migration. Strictly untrack and remove ephemeral local state directories such as `.omc/`, `.claude/`, `tmp/`, and `.worktrees/`.
4. **Final disposition of `gsd-post-update`** — Fully remove `gsd-post-update` from tracked source and delete its associated fallback execution logic, ensuring the Phase 4 parity suite still passes.

## Cross-Review Final Positions

1. Update `README.md`, `package.json` metadata, and source-install documentation to explicitly state this is Jacob Clayden's fork.
2. Retain existing `gsd` binary and package names. Any move to scoped npm packages is deferred to a separate publish phase.
3. Leave historical references to the upstream project intact in `CHANGELOG.md`, specs, and handover documents to preserve lineage and context.
4. Ensure `.planning`, `sdk/dist`, `hooks/dist`, `.omc`, `.claude`, `node_modules`, and `.DS_Store` are strictly treated as local-only/ignored.
5. Delete `.release-monitor.sh`; delete `.plans/1755-install-audit-fix.md` after preserving any required evidence elsewhere; retain `.clinerules` as an active dependency for tests.
6. Remove translated READMEs and localised docs to reduce maintenance burden and avoid stale upstream-specific documentation.
7. Remove upstream-specific `gsd-post-update` fallback logic to simplify the fork's lifecycle.

## Dissents

- Gemini defends translated-doc removal because keeping localised docs synchronised with new architectural changes is unsustainable for an individual-maintained fork and risks stale upstream-specific guidance.
- Gemini defends full `gsd-post-update` fallback removal because retained upstream-specific update handling introduces dead code and failure vectors if standard installation is now the lifecycle.

## CONTEXT.md Status Recommendation

Gemini recommends adopting translated-doc removal and `gsd-post-update` fallback removal as executable Phase 10 decisions. Because Claude was skipped and Codex dissented, these should be recorded as reduced-confidence contested decisions if the orchestrator cannot form a three-model majority.
