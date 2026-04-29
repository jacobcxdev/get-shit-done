# Phase 10 Auto-Discussion — Codex

Reduced-confidence auto-discussion: Claude leg skipped due exhausted quota; this is a Codex/repo-inspection-only decision artefact.

## Domain Boundary

Phase 10 is repo hygiene and fork identity only. It may update docs/meta, classify/remove stale artefacts, and clarify local-only state. It must not change FSM behaviour, weaken parity gates, delete source/tests/release assets without evidence, or reopen Phase 9’s metadata discipline.

## Initial Decisions

1. **Fork identity vs package compatibility** — Identify the repo as Jacob Clayden’s fork in README/package metadata and source-install docs, but keep existing package/bin names unless a separate publish phase chooses new scoped npm names.
2. **Primary vs translated docs** — Update active identity/install surfaces across root README translations, `docs/manual-update.md`, package metadata, and badges. Leave historical changelog/spec/handover upstream references unless they are presented as current install or ownership.
3. **Generated and local-only artefacts** — Keep generated outputs ignored unless already tracked and justified as release assets. Treat `.planning/`, `sdk/dist/`, `hooks/dist/`, `.omc/`, `.claude/`, `node_modules/`, and `.DS_Store` as local-only/ignored in this checkout unless Phase 10 explicitly documents a different policy.
4. **Tracked miscellaneous files** — Delete or justify tracked one-offs case by case. `.release-monitor.sh` should be discarded as stale local monitoring. `.plans/1755-install-audit-fix.md` should not remain an active root artefact once its evidence is preserved in tests/planning notes. `.clinerules` should be retained but refreshed because tests and Cline support intentionally depend on it.
5. **Validation standard** — Validation evidence should use existing build/test/parity/security surfaces and explicitly record any known pre-existing failures rather than weakening tests.

## Cross-Review Final Positions

1. Keep the repo identity as Jacob Clayden’s fork of upstream GSD, with upstream credited.
2. Keep existing package/bin names for now; update metadata URLs/author/description, but defer package rename or scoped npm publishing.
3. Treat `bin/` user-facing help, fallback clone URLs, and install error text as identity surfaces. Update those strings, but do not change executable names or behaviour for identity alone.
4. Preserve translated READMEs/localised docs. Add fork/current-install notice where needed; do not delete them just to reduce rebrand scope.
5. Preserve `.planning` as audit/project state, not ephemeral clutter. If tracking policy is ambiguous, document the policy; deletion is off the table.
6. Remove untracked local-only clutter from disk: `.omc`, `.claude`, `.DS_Store`, `tmp`, `.worktrees`, caches, local installs.
7. Preserve source/tests/release assets unless audit evidence proves obsolete. `sdk/dist`/`hooks/dist` should be handled as release/build assets, not casual temp files.
8. Remove stale local monitoring/misc files such as `.release-monitor.sh`. Retain `.clinerules` because it is tested runtime support.
9. Do not blanket-remove all `gsd-post-update` source/fallback logic in Phase 10. Remove dead fallback logic only where parity plus inventory prove no active install/runtime path depends on it; a deprecated no-op/tombstone surface is acceptable.
10. Validation remains build/test/parity/security oriented; record known pre-existing failures and do not weaken gates.

## Dissents

- Gemini recommends removing translated docs. Codex dissents because this is too destructive for Phase 10 and conflicts with multilingual docs as an intentional repo surface.
- Gemini recommends full `gsd-post-update` source/fallback removal. Codex dissents because Phase 10 is cleanup/identity, not broad compatibility removal; preserve a compatibility tombstone if users may still invoke it.

## CONTEXT.md Status Recommendation

No true three-leg majority is possible because Claude was skipped. Mark available-leg consensus for fork identity rewrite, source-install docs, ephemeral cleanup, `.planning` preservation, and validation discipline. Mark translated docs retention/removal and full `gsd-post-update` removal as reduced-confidence disputed decisions.
