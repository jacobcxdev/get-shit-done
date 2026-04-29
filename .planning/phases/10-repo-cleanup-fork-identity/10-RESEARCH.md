# Phase 10: Repo Cleanup + Fork Identity - Research

**Researched:** 2026-04-29
**Domain:** Git repository hygiene, fork identity rewriting, npm package metadata
**Confidence:** HIGH — all findings based on direct inventory of the live repository

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Active identity surfaces must describe this repository as Jacob Clayden's fork of upstream GSD and credit upstream rather than presenting the fork as the canonical upstream distribution.
- **D-02** Keep existing package names and executable/bin names for Phase 10. Update metadata, URLs, descriptions, install text, and source-clone instructions, but defer scoped package renames or new publish strategy to a separate release/publishing phase.
- **D-03** Treat visible install/help/error text in README.md, package metadata, docs install surfaces, and bin/install shims as identity surfaces. Update user-facing strings where they identify the repository, source URL, maintainer, or install path; do not change runtime behaviour merely for rebranding.
- **D-04** Preserve historical upstream references in changelogs, specs, handover notes, and audit records when they are lineage/history rather than current install or ownership instructions.
- **D-06** Preserve `.planning/` as intentional audit/project state for this migration, not ephemeral clutter.
- **D-07** Treat local tool state, dependency installs, caches, OS files, and temporary worktrees as removable or ignored clutter: `.omc/`, `.claude/`, `.DS_Store`, `node_modules/`, `tmp/`, `.worktrees/`, and equivalent local-only artefacts should not remain tracked.
- **D-08** Treat generated distribution outputs such as `sdk/dist/` and `hooks/dist/` as release/build assets when they are intentionally tracked by packaging. Do not remove them as generic temp files unless package scripts and release requirements prove they are obsolete.
- **D-09** Tracked one-off files are audited case by case: `.release-monitor.sh` is presumed stale local monitoring and should be removed; `.clinerules` should be retained because tests intentionally cover Cline support; `.plans/1755-install-audit-fix.md` should not remain an active root planning artefact once any still-needed evidence is preserved in canonical planning docs or tests.
- **D-11** Validation must use existing build, test, parity, and security/no-secret surfaces. Record known pre-existing failures explicitly instead of weakening tests or treating cleanup as permission to reduce coverage.
- **D-12** File removals must be staged intentionally and supported by evidence. No source, test, planning, generated release asset, or documentation tree may be removed solely because it looks old.

### Claude's Discretion

- Exact audit command set, edit order, and wording are left to downstream planning.
- Disputed destructive choices (D-05 and D-10 below) must be resolved by evidence in the plan before execution.

### Disputed Decisions (Require Evidence Before Execution)

- **D-05** [disputed: Codex preserve/update notices; Gemini remove] The planner must choose a bounded policy for translated READMEs and localised docs. Codex recommends preserving them with fork/current-install notices; Gemini recommends removing them to avoid stale upstream-specific guidance. Either path must be intentional, documented, and avoid leaving active install instructions that contradict the fork identity.
- **D-10** [disputed: Codex audited/tombstone removal; Gemini full removal] Do not delete `gsd-post-update` or fallback update logic merely because it is legacy. Phase 10 must audit live references and compatibility expectations before deciding. NOTE: Direct inventory in this research found zero references to `gsd-post-update` in `bin/`, `scripts/`, `get-shit-done/`, `agents/`, `commands/`, or `hooks/` — the removal from source is already complete. Evidence gathering for D-10 can be brief.

### Deferred Ideas (OUT OF SCOPE)

- Scoped npm package rename, fork-specific publish pipeline, and package-name migration strategy.
- Full retranslation or regeneration of localised documentation.
- Historical changelog/spec rewriting beyond misleading active identity/install surfaces.
- Broad workflow Markdown slimming (blocked by Phase 6 pilot outcome).

</user_constraints>

---

## Summary

Phase 10 has a clear, bounded scope: audit and correct active identity surfaces so this repository presents as Jacob Clayden's fork of upstream GSD, remove or ignore local-only and stale artefacts, and validate that cleanup does not break the build or parity. There is no framework migration, no new code to write, and no architectural changes.

The upstream identity is concentrated in a small number of files. A direct inventory found all the key surfaces: `README.md`, `package.json`, `sdk/package.json`, `sdk/README.md`, `CONTRIBUTING.md`, `docs/manual-update.md`, `.github/CODEOWNERS`, `.github/FUNDING.yml`, and `.github/workflows/release.yml`. The actual git remote already points to `jacobcxdev/get-shit-done` (not `gsd-build`), confirming the fork exists — only the documentation and metadata need to catch up.

The stale-artefact picture is straightforward. `.release-monitor.sh` is a standalone monitoring shell script hardcoded to watch `gsd-build/get-shit-done` for releases — it has no tests, no CI invocation, and no callers; it is safe to remove. `.plans/1755-install-audit-fix.md` documents install fixes that are already landed (confirmed by the audit block at the top of `bin/install.js`); the plan's evidence is preserved in install.js and tests, so the root artefact can be removed. `gsd-post-update` is already fully absent from `bin/`, `scripts/`, `get-shit-done/`, `agents/`, `commands/`, and `hooks/` — D-10 evidence gathering will be brief. The `.planning/` directory is correctly untracked (listed in `git status` as `??`) because `.planning/config.json` sets `planning_artifacts_ignored: true`; this is the intended state. Local-only directories `.omc/` and `.claude/worktrees/` exist on disk but are already gitignored.

**Primary recommendation:** Execute in three sequential waves — (1) artefact inventory and removal, (2) identity surface updates, (3) validation gate.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fork identity text | Documentation / metadata | — | README, package.json, sdk/package.json, CONTRIBUTING.md are pure content edits |
| Install URL / source-clone fix | Documentation / metadata | bin/install.js (string update only) | No runtime behaviour change; update URLs and author strings only |
| Artefact hygiene (.gitignore, removals) | Repository config | — | git rm, .gitignore entries; no code change |
| Translated docs policy (D-05) | Documentation | — | Decision gates on evidence; either update-in-place or git-rm |
| gsd-post-update audit (D-10) | Codebase inventory | — | Search-and-confirm only; already absent from source |
| Build/parity/security validation | CI / test gates | — | Existing scripts: npm test, phase4-parity.cjs, secret-scan.sh |

---

## Standard Stack

No new libraries or frameworks are introduced in this phase. All operations use:

| Tool | Version | Purpose |
|------|---------|---------|
| git | (system) | `git rm`, `git mv`, status, index management |
| Node.js | >=22.0.0 | Run existing test/build/parity scripts |
| npm | (system) | `npm test`, `npm run build:sdk`, `npm run phase4:parity` |
| Vitest | ^3.1.1 (already installed in sdk/) | SDK test suite |

**No installation required.** All tooling is already present.

---

## Architecture Patterns

### Recommended Work Order

```
Wave 1: Artefact inventory and removal
  ├── Confirm gsd-post-update absence (D-10 evidence)
  ├── git rm .release-monitor.sh
  ├── git rm .plans/1755-install-audit-fix.md  (after confirming evidence preserved)
  └── Audit .gitignore completeness for .omc/, .planning/fsm-state.json

Wave 2: Identity surface updates
  ├── README.md  (badges, repo URL, clone URL, author attribution, star-history)
  ├── package.json  (author, repository.url, homepage, bugs.url)
  ├── sdk/package.json  (name note, author, repository.url, homepage, bugs.url)
  ├── sdk/README.md  (package name references, install instructions)
  ├── CONTRIBUTING.md  (clone URL, issue/PR links)
  ├── docs/manual-update.md  (clone URL)
  ├── .github/CODEOWNERS  (owner: glittercowboy → jacobcxdev)
  ├── .github/FUNDING.yml  (github: glittercowboy → jacobcxdev)
  ├── .github/workflows/release.yml  (@gsd-build/sdk references — D-02 compatibility note)
  └── D-05: Decide translated docs policy and execute

Wave 3: Validation
  ├── npm run build:sdk
  ├── npm test
  ├── node scripts/phase4-parity.cjs
  └── bash scripts/secret-scan.sh (or equivalent)
```

### Identity Surface Inventory (complete)

Every upstream identity string found in tracked files:

| File | Upstream String | Required Action |
|------|----------------|-----------------|
| `README.md` line 13 | `gsd-build/get-shit-done` in CI badge URL | Replace with `jacobcxdev/get-shit-done` |
| `README.md` line 15 | `@gsd__foundation` X/Twitter badge | Remove or replace with Jacob's handle |
| `README.md` line 16 | `$GSD` Dexscreener badge | Remove (upstream crypto token, not fork-relevant) |
| `README.md` line 17 | `gsd-build/get-shit-done` in stars badge | Replace with `jacobcxdev/get-shit-done` |
| `README.md` line 76 | `— **TÂCHES**` attribution | Replace with Jacob Clayden attribution (or add fork notice) |
| `README.md` line 257 | `https://github.com/gsd-build/get-shit-done.git` clone URL | Replace with `jacobcxdev` fork URL |
| `README.md` lines 961–964 | `gsd-build/get-shit-done` in star-history URLs | Replace with `jacobcxdev/get-shit-done` |
| `package.json` | `author: "TÂCHES"`, `repository.url`, `homepage`, `bugs.url` pointing to `gsd-build` | Update to Jacob Clayden, `jacobcxdev/get-shit-done` |
| `sdk/package.json` | `name: "@gsd-build/sdk"`, `author: "TÂCHES"`, `repository.url`, `homepage`, `bugs.url` | D-02: keep package name for compat; update author+URLs |
| `sdk/README.md` | `# @gsd-build/sdk`, install instructions, CLI examples using `@gsd-build/sdk` path | Add fork notice; D-02: package name unchanged, note upstream lineage |
| `CONTRIBUTING.md` | All `https://github.com/gsd-build/get-shit-done` links | Replace with `jacobcxdev/get-shit-done` |
| `docs/manual-update.md` | `git clone https://github.com/gsd-build/get-shit-done` | Replace with fork URL |
| `.github/CODEOWNERS` | `@glittercowboy` | Replace with `@jacobcxdev` |
| `.github/FUNDING.yml` | `github: glittercowboy` | Replace with `jacobcxdev` |
| `.github/workflows/release.yml` | `@gsd-build/sdk` npm package name references | D-02: package name compatibility — add comment noting fork; do not rename |

### Artefact Hygiene Inventory (complete)

| Artefact | Status | Evidence | Action |
|----------|--------|----------|--------|
| `.release-monitor.sh` | Tracked, stale | Hardcoded to watch `gsd-build/get-shit-done`; no callers; no tests | `git rm` |
| `.plans/1755-install-audit-fix.md` | Tracked at root | All 9 fixes landed per `bin/install.js` audit block (line 1–10); HOOK-05 still open | Preserve HOOK-05 note in planning or inline comment, then `git rm` |
| `.omc/` | Untracked, on disk | Not in `git ls-files`; `.gitignore` does not list `.omc/` explicitly | Add `.omc/` to `.gitignore` |
| `.claude/worktrees/` | Untracked, on disk | `.gitignore` has `.claude/` already — covers this | No action needed (already ignored) |
| `.DS_Store` | Untracked, on disk | `.gitignore` has `.DS_Store` | No action needed (already ignored) |
| `.planning/` directory | Untracked (correct per config) | `planning_artifacts_ignored: true` in config.json; listed as `??` in git status | Verify `.gitignore` contains `.planning/` or equivalent; do not add to index |
| `.planning/fsm-state.json` | Untracked (correct) | Runtime FSM state; `planning_artifacts_ignored: true` | No action — leave untracked |
| `sdk/dist/` | Not tracked in git | `git ls-files | grep sdk/dist` returns nothing; `.gitignore` has `dist/` | Correct — no action needed |
| `hooks/dist/` | Not tracked in git | `git ls-files | grep hooks/dist` returns nothing; `.gitignore` has `hooks/dist/` | Correct — no action needed |
| `gsd-post-update` in source | Already absent | Zero hits in `bin/`, `scripts/`, `get-shit-done/`, `agents/`, `commands/`, `hooks/` | D-10 resolved: no further action |
| `node_modules/` | Untracked | `.gitignore` has `node_modules/` | Correct — no action needed |

### .gitignore Gap

`.omc/` is present on disk and untracked but is **not listed in `.gitignore`**. The current `.gitignore` covers `.claude/`, `node_modules/`, `.DS_Store`, `tmp/`, `.worktrees`, and `dist/` but does not include `.omc/`. This is a gap: without a `.gitignore` entry, a future `git add .` or contributor checkout could accidentally stage `.omc/` session files.

**Action required:** Add `.omc/` to `.gitignore`.

### Translated Docs Policy Decision (D-05)

This is the one open decision the planner must resolve before Wave 2. The research findings:

- `docs/ja-JP/`, `docs/ko-KR/`, `docs/pt-BR/`, `docs/zh-CN/` are fully tracked (confirmed via `git ls-files`)
- Root `README.ja-JP.md`, `README.ko-KR.md`, `README.pt-BR.md`, `README.zh-CN.md` are tracked
- These files contain upstream-specific install instructions (e.g. `npx get-shit-done-cc@latest`, upstream GitHub URLs)
- zh-CN docs have a different structure (references/ subdir rather than full doc set)

**Codex position:** Preserve all translated docs. Add a fork notice at the top of each that clarifies this is Jacob Clayden's fork and upstream install instructions may differ.

**Gemini position:** Remove all translated docs (4 docs subtrees + 4 root README translations = ~65 files) because keeping them synchronised is unsustainable for a solo-maintained fork. Schedule retranslation separately.

**Planner decision point:** Choose one path before Wave 2, document the choice in the plan, and execute it consistently. Do not leave some translations updated and others pointing to upstream without a comment.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Finding upstream identity strings | Custom search scripts | `git grep` / standard grep across tracked files |
| Validating no secrets are tracked | Custom scanner | Existing `scripts/secret-scan.sh` and `.secretscanignore` |
| Checking build health after cleanup | New validation scripts | Existing `npm test`, `npm run build:sdk`, `node scripts/phase4-parity.cjs` |
| Verifying parity gates still pass | Manual inspection | `node scripts/phase4-parity.cjs` (already the canonical parity gate) |

---

## Runtime State Inventory

> Phase 10 involves file/doc edits and git removals — this section confirms what runtime state exists.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `.omc/project-memory.json` and `.omc/sessions/*.json` — OMC session state on disk | None (local-only, untracked, adding `.omc/` to `.gitignore` is sufficient) |
| Live service config | `.github/CODEOWNERS` and `.github/FUNDING.yml` point to `@glittercowboy` — GitHub uses these for PR review routing and sponsor display | Code edit — update to `@jacobcxdev` |
| OS-registered state | None — no Task Scheduler, pm2, launchd, or systemd registrations found | None |
| Secrets/env vars | No `.env` or secrets tracked; `.secretscanignore` controls scan scope | No action — existing secret scan covers this |
| Build artifacts | `sdk/dist/` and `hooks/dist/` are gitignored (confirmed via `git ls-files`); build is reproducible via `npm run build:sdk` + `npm run build:hooks` | No action needed |

**gsd-post-update runtime state:** Zero references found in any source file. Phase 4 retirement was complete before Phase 10 began.

---

## Common Pitfalls

### Pitfall 1: Renaming the npm package name in sdk/package.json
**What goes wrong:** Changing `"name": "@gsd-build/sdk"` breaks external consumers that have installed the SDK by its current npm name, and breaks `bin/gsd-sdk.js` which resolves `sdk/dist/cli.js` relative to the package root. D-02 explicitly defers package renames.
**How to avoid:** Update author, repository.url, homepage, and bugs.url in `sdk/package.json` only. Leave `"name": "@gsd-build/sdk"` unchanged. Add a fork notice comment or description update that credits upstream without renaming.
**Warning signs:** Any edit to the `name` field in either `package.json` or `sdk/package.json`.

### Pitfall 2: Removing .clinerules
**What goes wrong:** `tests/` contains tests that intentionally cover Cline support and depend on `.clinerules` being present.
**How to avoid:** Do not remove `.clinerules`. It is documented as intentional in D-09.
**Warning signs:** Seeing `.clinerules` in a removal list.

### Pitfall 3: Weakening or skipping parity gates
**What goes wrong:** Phase 10 edits are "just docs" so it can be tempting to skip `node scripts/phase4-parity.cjs`. But the parity suite runs against the live repository and would catch any accidental removal of a source or fixture file.
**How to avoid:** Always run the full parity gate as the final validation step. D-11 is explicit about this.
**Warning signs:** Validation plan that only runs `npm test` without the parity script.

### Pitfall 4: Accidentally staging .planning/ artefacts
**What goes wrong:** `planning_artifacts_ignored: true` keeps `.planning/` out of git, but `.planning/` is not currently in `.gitignore` (the config flag manages this at the GSD tooling level, not at the git level). A `git add -A` during the cleanup commit could accidentally stage `.planning/` files.
**How to avoid:** Use targeted `git add <specific-file>` for every commit in this phase. Verify with `git status` before each commit that no `.planning/` files appear in the index.
**Warning signs:** `.planning/` appearing in `git status` staged section.

### Pitfall 5: Removing .plans/1755-install-audit-fix.md before preserving HOOK-05
**What goes wrong:** The plan file has one still-open item — HOOK-05 (hash-aware hook copy to avoid stale destination refresh). Removing the file without capturing that note loses the open issue.
**How to avoid:** Before `git rm .plans/1755-install-audit-fix.md`, record HOOK-05 in a canonical location (inline comment in `bin/install.js`, or a note in the `.planning/STATE.md` pending todos).
**Warning signs:** Removing the file in a single step without a prior preservation commit.

---

## Code Examples

### Finding all upstream identity strings in tracked files
```bash
# Source: direct git grep (VERIFIED in this research session)
git grep -n "gsd-build\|TÂCHES\|glittercowboy\|gsd_foundation\|dexscreener" \
  -- README.md package.json sdk/package.json sdk/README.md CONTRIBUTING.md \
     docs/manual-update.md .github/CODEOWNERS .github/FUNDING.yml
```

### Removing a tracked stale file
```bash
# Source: standard git workflow [VERIFIED: git documentation]
git rm .release-monitor.sh
git rm .plans/1755-install-audit-fix.md
```

### Adding .omc/ to .gitignore
```bash
# Append to .gitignore — confirm no existing .omc entry first
grep -n "\.omc" .gitignore  # should return nothing
echo '.omc/' >> .gitignore
```

### Running the validation gate
```bash
# Source: package.json scripts [VERIFIED in this research session]
npm run build:sdk           # TypeScript compile
npm test                    # Full CJS + SDK test suite
node scripts/phase4-parity.cjs  # Parity gate
bash scripts/secret-scan.sh     # Secret scan
```

### Confirming gsd-post-update is absent (D-10 evidence)
```bash
# Source: direct search [VERIFIED: zero hits in this research session]
git grep -l "gsd-post-update" -- bin/ scripts/ get-shit-done/ agents/ commands/ hooks/
# Expected output: (empty)
```

---

## State of the Art

| Old State | Current State | Notes |
|-----------|--------------|-------|
| `gsd-post-update` present in source | Already removed before Phase 10 | Phase 4 retirement completed; no action needed |
| `.plans/` as active root planning artefact | Should be retired | Evidence already preserved in `bin/install.js` audit block |
| Git remote pointing to upstream | Already points to `jacobcxdev/get-shit-done` | Only docs/metadata need updating |
| `sdk/dist/` committed to git | Now gitignored (`dist/` in .gitignore) | Correct state; no action needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `.omc/` is not in `.gitignore` based on reading the current `.gitignore` file | Artefact Hygiene Inventory | If `.omc/` is already ignored by a wildcard pattern, the add is redundant but harmless |
| A2 | All HOOK-05 is the only still-open item in `.plans/1755-install-audit-fix.md` | Common Pitfalls / Pitfall 5 | If other items are open, more evidence must be preserved before removing the file |
| A3 | `bin/install.js` contains no `gsd-post-update` runtime call path (only found in non-source artefacts in `.planning/` and `.omc/`) | Runtime State Inventory | If a fallback call exists deeper in `bin/install.js`, D-10 needs deeper audit; confirmed by zero grep hits |

---

## Open Questions

1. **D-05: Translated docs policy**
   - What we know: ~65 files across ja-JP, ko-KR, pt-BR, zh-CN contain upstream install instructions and URLs
   - What's unclear: Whether preservation-with-notices or removal-until-retranslation is better for this fork
   - Recommendation: Planner chooses before Wave 2. If preserving, add a standard notice block at the top of each translated README. If removing, do it in a single `git rm -r docs/ja-JP docs/ko-KR docs/pt-BR docs/zh-CN README.ja-JP.md README.ko-KR.md README.pt-BR.md README.zh-CN.md` and record the decision in `.planning/STATE.md`.

2. **HOOK-05 open status in .plans/1755-install-audit-fix.md**
   - What we know: The file's audit header in `bin/install.js` marks HOOK-05 (hash-aware hook copy) as still open
   - What's unclear: Whether HOOK-05 is tracked anywhere else or needs a new issue/plan
   - Recommendation: Planner should check if a test or issue already tracks HOOK-05. If not, add an inline comment in `bin/install.js` before removing the root plan file.

---

## Environment Availability

| Dependency | Required By | Available | Fallback |
|------------|------------|-----------|---------|
| git | All artefact removal and staging | System git present (verified via worktree commands) | — |
| Node.js >=22 | Build and test validation | Confirmed (project has been building/testing throughout Phases 1–9) | — |
| npm | Build scripts | Present | — |
| `scripts/phase4-parity.cjs` | Parity validation | Present (tracked, confirmed via `git ls-files`) | — |
| `scripts/secret-scan.sh` | Security validation | Present (tracked, confirmed via `git ls-files`) | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1.1 (SDK) + Node CJS runner via `scripts/run-tests.cjs` (integration) |
| Config file | `vitest.config.ts` (SDK); `scripts/run-tests.cjs` (CJS suite) |
| Quick run command | `npm test` |
| Full suite command | `npm test && node scripts/phase4-parity.cjs` |

### Phase Requirements → Test Map

Phase 10 has no new code requirements — all success criteria are documentary or git-state checks. Existing tests cover the surfaces that must not regress:

| Behaviour | Test Type | Automated Command | Notes |
|-----------|-----------|-------------------|-------|
| Build still compiles | build | `npm run build:sdk` | TypeScript compile gate |
| CJS integration tests pass | integration | `npm test` | ~974 tracked test files |
| Parity gates pass | parity | `node scripts/phase4-parity.cjs` | Phase 4 retirement gate |
| No secrets tracked | security | `bash scripts/secret-scan.sh` | Existing secret scan |
| `.clinerules` still present | implicit | `npm test` (Cline tests depend on it) | Do not remove `.clinerules` |

### Wave 0 Gaps
None — no new test files are needed for Phase 10. This phase does not add source code.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | — |
| V6 Cryptography | no | — |

Phase 10 is documentation/metadata/file-removal only. The primary security concern is ensuring no secrets are introduced (e.g. real API keys in a fork notice) or that secrets are not inadvertently tracked when local state directories are normalised. The existing `scripts/secret-scan.sh` and `.secretscanignore` files cover this.

### Known Threat Patterns for This Phase

| Pattern | Risk | Mitigation |
|---------|------|-----------|
| Accidentally tracking `.omc/` session files | Session data / memory leakage | Add `.omc/` to `.gitignore`; use targeted `git add` |
| Identity update introducing a real API key or personal token in a badge URL | Secret exposure | Review all badge/link replacements before commit |

---

## Sources

### Primary (HIGH confidence)
- Live `git ls-files` inventory — full list of 974 tracked files, confirmed during this session
- Direct file reads: `package.json`, `sdk/package.json`, `README.md`, `bin/install.js`, `.gitignore`, `.planning/config.json`, `.planning/CONTEXT.md`, `.planning/ROADMAP.md`
- `git remote -v` — confirmed fork remote: `git@github.com:jacobcxdev/get-shit-done`
- `git grep` search — confirmed zero `gsd-post-update` hits in source directories

### Secondary (MEDIUM confidence)
- `.planning/codebase/STRUCTURE.md` and `STACK.md` — project structure and technology analysis (dated 2026-04-27, consistent with observed state)
- `10-CONTEXT.md` discussion artefacts (Codex and Gemini positions on D-05 and D-10)

---

## Metadata

**Confidence breakdown:**
- Identity surfaces: HIGH — direct file reads, complete line-level inventory
- Artefact hygiene: HIGH — direct git ls-files and disk inventory
- Validation gates: HIGH — confirmed existing scripts are present and have been used throughout Phases 1–9
- Translated docs policy (D-05): LOW — disputed; requires planner decision, not research resolution

**Research date:** 2026-04-29
**Valid until:** Indefinite for static file inventory; re-run git grep before executing if significant time passes
