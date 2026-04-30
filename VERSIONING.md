# Versioning & Release Strategy

This fork is source-first. Releases are currently represented by Git history, tags, and source checkouts from `jacobcxdev/get-shit-done`, not by a fork-owned npm package.

`get-shit-done-cc` is retained as a compatibility/upstream npm package name in `package.json`. Treat npm dist-tags, `npm view`, and `npx get-shit-done-cc` as upstream/compatibility surfaces unless a future publish document records fork-owned package names or explicit npm ownership proof.

## Source release tiers

GSD follows [Semantic Versioning 2.0.0](https://semver.org/) for source releases.

| Tier | What ships | Version format | Branch | Fork install/update |
|------|-----------|---------------|--------|---------------------|
| **Patch** | Bug fixes only | `1.27.1` | `hotfix/1.27.1` | Pull source, rebuild, run `node bin/install.js` |
| **Minor** | Fixes + enhancements | `1.28.0` | `release/1.28.0` | Pull source, rebuild, run `node bin/install.js` |
| **Major** | Breaking changes or large feature sets | `2.0.0` | `release/2.0.0` | Pull source, rebuild, run `node bin/install.js` |

## Canonical fork install/update

```bash
git clone https://github.com/jacobcxdev/get-shit-done.git
cd get-shit-done
npm ci
npm run build:hooks
npm run build:sdk
node bin/install.js --codex --global   # replace runtime flag as needed
```

For updates from an existing checkout:

```bash
git pull --rebase origin main
npm ci
npm run build:hooks
npm run build:sdk
node bin/install.js --codex --global   # replace runtime flag as needed
```

## npm publishing policy

Future npm publishing for this fork requires one of:

1. Fork-owned package names documented in this repository.
2. Explicit proof that this fork owns and is authorised to publish the retained compatibility names.

Until then:

- Do not present the npm latest entrypoint for `get-shit-done-cc` as installing this fork.
- Do not present `npm install @gsd-build/sdk` as installing this fork's SDK.
- Do not treat `npm view`, `npm dist-tag`, or npm badge output as fork release proof.

## Semver rules

| Increment | When | Examples |
|-----------|------|----------|
| **PATCH** (1.27.x) | Bug fixes, typo corrections, test additions | Hook filter fix, config corruption fix |
| **MINOR** (1.x.0) | Non-breaking enhancements, new commands, new runtime support | New workflow command, discuss-mode feature |
| **MAJOR** (x.0.0) | Breaking changes to config format, CLI flags, or runtime API; new features that alter existing behaviour | Removing a command, changing config schema |

## Pre-release version progression

Major and minor source releases use different pre-release types:

```
Minor: 1.28.0-rc.1  →  1.28.0-rc.2  →  1.28.0
Major: 2.0.0-beta.1 →  2.0.0-beta.2 →  2.0.0
```

- **beta** (major releases only): Feature-complete but not fully tested. API mostly stable. Used for major releases to signal a longer testing cycle.
- **rc** (minor releases only): Production-ready candidate. Only critical fixes expected.
- Each version uses one pre-release type throughout its cycle.

## Branch structure

```
main                              ← stable, always installable from source
  │
  ├── hotfix/1.27.1               ← patch: cherry-pick fix from main
  │
  ├── release/1.28.0              ← minor: accumulate fixes + enhancements, RC cycle
  │     ├── v1.28.0-rc.1          ← source tag
  │     └── v1.28.0               ← source tag
  │
  ├── release/2.0.0               ← major: features + breaking changes, beta cycle
  │     ├── v2.0.0-beta.1         ← source tag
  │     ├── v2.0.0-beta.2         ← source tag
  │     └── v2.0.0                ← source tag
  │
  ├── fix/1200-bug-description    ← bug fix branch (merges to main)
  ├── feat/925-feature-name       ← feature branch (merges to main)
  └── chore/1206-maintenance      ← maintenance branch (merges to main)
```

## Release workflows

### Patch release (hotfix)

For critical bugs that cannot wait for the next minor release.

1. Trigger `hotfix.yml` with version (e.g. `1.27.1`).
2. Workflow creates `hotfix/1.27.1` branch from the latest patch tag for that minor version.
3. Cherry-pick or apply fix on the hotfix branch.
4. Push — CI runs tests automatically.
5. Trigger `hotfix.yml` finalise action.
6. Workflow runs the full test suite, bumps version, and tags the source release.
7. Merge hotfix branch back to main.

### Minor release

For accumulated fixes and enhancements.

1. Trigger `release.yml` with action `create` and version (e.g. `1.28.0`).
2. Workflow creates `release/1.28.0` branch from main and bumps package metadata.
3. Trigger `release.yml` with action `rc` to tag `1.28.0-rc.1`.
4. Test the RC from source.
5. If issues are found, fix on the release branch and tag `rc.2`, `rc.3`, etc.
6. Trigger `release.yml` with action `finalize` to tag `1.28.0`.
7. Merge release branch to main.

### Major release

Same as minor but uses `-beta.N` instead of `-rc.N`, signalling a longer testing cycle.

## Conventional commits

Branch names map to commit types:

| Branch prefix | Commit type | Version bump |
|--------------|-------------|-------------|
| `fix/` | `fix:` | PATCH |
| `feat/` | `feat:` | MINOR |
| `hotfix/` | `fix:` | PATCH (immediate) |
| `chore/` | `chore:` | none |
| `docs/` | `docs:` | none |
| `refactor/` | `refactor:` | none |
