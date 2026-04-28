# Codebase Structure

**Analysis Date:** 2026-04-27

## Directory Layout

```
get-shit-done/                  # Repo root (npm package: get-shit-done-cc)
├── agents/                     # Agent definition files (gsd-*.md) — installed to ~/.claude/agents/
├── bin/                        # npm bin shims
│   ├── install.js              # Installs GSD files into ~/.claude/ (npx get-shit-done-cc)
│   └── gsd-sdk.js              # CLI shim for gsd-sdk → sdk/dist/cli.js
├── commands/
│   └── gsd/                    # Slash command definitions (*.md) — installed to ~/.claude/commands/gsd/
├── docs/                       # Multi-language documentation (en, ja-JP, ko-KR, pt-BR, zh-CN)
├── get-shit-done/              # Core GSD content bundle — installed to ~/.claude/get-shit-done/
│   ├── bin/
│   │   ├── gsd-tools.cjs       # CJS state/config tool binary (main workhorse)
│   │   └── lib/                # CJS library modules (state, config, phase, roadmap, etc.)
│   ├── contexts/               # Phase context files (dev.md, research.md, review.md)
│   ├── references/             # Reference docs (ui-brand.md, few-shot-examples/)
│   ├── templates/              # File templates (PLAN.md, STATE.md, CONTEXT.md, etc.)
│   │   ├── codebase/           # Codebase map templates (stack.md, architecture.md, etc.)
│   │   └── research-project/   # Research project templates
│   └── workflows/              # Workflow prose files — loaded by commands via @-include
│       ├── discuss-phase/
│       │   ├── modes/          # discuss-phase mode variants (auto, advisor, batch, etc.)
│       │   └── templates/      # discussion context/log templates
│       └── execute-phase/
│           └── steps/          # Sub-step prose (codebase-drift-gate.md, post-merge-gate.md)
├── hooks/                      # Claude Code session hooks (JS + shell)
├── scripts/                    # Build and dev scripts
├── sdk/                        # TypeScript SDK (@gsd-build/sdk)
│   ├── src/                    # TypeScript source
│   │   ├── compile/            # Compiler/audit orchestrator, baselines, diagnostics, validators, and inventory collectors
│   │   ├── generated/compile/  # SDK-owned deterministic compile baseline JSON files
│   │   ├── query/              # Native query handler registry (~60 files)
│   │   │   └── golden/         # Golden test infrastructure
│   │   └── golden/             # Golden test fixtures (*.golden.json, sample sessions)
│   ├── prompts/                # Prompt template files for SDK-driven sessions
│   │   └── templates/
│   ├── scripts/                # SDK build scripts
│   ├── dist/                   # Compiled JS output (generated, committed for distribution)
│   ├── package.json            # SDK sub-package manifest
│   └── tsconfig.json           # SDK TypeScript config
├── tests/                      # Integration test suite
├── .claude/
│   └── worktrees/              # Agent worktrees (auto-created by Claude Code agent spawning)
├── .github/
│   └── workflows/              # CI workflows
├── .planning/                  # GSD planning state for this repo itself
│   └── codebase/               # Codebase map documents (written here by gsd-map-codebase)
├── package.json                # Root npm manifest (bin: get-shit-done-cc, gsd-sdk)
├── vitest.config.ts            # Vitest config for SDK tests
└── tsconfig.json               # Root TypeScript config
```

## Directory Purposes

**`agents/`:**
- Purpose: Specialized agent role definitions; each file is a Claude Code sub-agent specification
- Contains: 33 `gsd-*.md` files with YAML frontmatter (`tools:`, `model:`) and `<role>` blocks
- Key files: `gsd-executor.md`, `gsd-planner.md`, `gsd-verifier.md`, `gsd-phase-researcher.md`, `gsd-plan-checker.md`, `gsd-codebase-mapper.md`, `gsd-roadmapper.md`, `gsd-integration-checker.md`
- Installed to: `~/.claude/agents/`

**`commands/gsd/`:**
- Purpose: One `.md` file per slash command; these are the user-facing entry points
- Contains: YAML frontmatter (name, description, argument-hint, allowed-tools, agent), `<objective>` block, `<execution_context>` with `@`-file references
- Key files: `execute-phase.md`, `plan-phase.md`, `discuss-phase.md`, `map-codebase.md`, `new-project.md`, `next.md`, `verify-work.md`
- Installed to: `~/.claude/commands/gsd/` where Claude Code discovers them as `/gsd:*` commands

**`get-shit-done/bin/`:**
- Purpose: CJS runtime for state management — the "backend" that both the CLI and SDK call
- Contains: `gsd-tools.cjs` (router + dispatcher) and `lib/` modules
- Key lib modules: `state.cjs`, `phase.cjs`, `roadmap.cjs`, `config.cjs`, `config-schema.cjs`, `core.cjs`, `verify.cjs`, `frontmatter.cjs`, `template.cjs`, `commit.cjs`, `workstream.cjs`, `intel.cjs`, `security.cjs`, `drift.cjs`

**`get-shit-done/workflows/`:**
- Purpose: Detailed prose instructions for each workflow; loaded by commands via `@~/.claude/get-shit-done/workflows/<name>.md` references
- Contains: One `.md` per workflow matching the commands set, plus subdirectories for multi-mode workflows
- Key files: `execute-phase.md`, `plan-phase.md`, `discuss-phase.md`, `new-project.md`, `verify-work.md`

**`get-shit-done/templates/`:**
- Purpose: Starter file templates used when creating new planning artifacts
- Contains: Templates for PLAN.md, STATE.md, CONTEXT.md, ROADMAP.md, PROJECT.md, config.json, and codebase map documents
- `codebase/` subdirectory: blank templates for STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md

**`hooks/`:**
- Purpose: Claude Code hooks that intercept tool calls and session lifecycle events
- Contains: JavaScript and shell scripts for workflow enforcement, security, context monitoring
- Key files: `gsd-workflow-guard.js`, `gsd-read-guard.js`, `gsd-context-monitor.js`, `gsd-prompt-guard.js`, `gsd-phase-boundary.sh`, `gsd-validate-commit.sh`, `gsd-statusline.js`, `gsd-check-update.js`

**`sdk/src/`:**
- Purpose: TypeScript SDK source — programmatic API for running GSD workflows
- Key files: `index.ts` (GSD facade), `cli.ts` (CLI entry), `types.ts` (all type definitions), `phase-runner.ts` (FSM), `session-runner.ts` (Agent SDK bridge), `gsd-tools.ts` (state management bridge), `event-stream.ts` (event bus), `context-engine.ts` (file resolution), `config.ts`, `prompt-builder.ts`, `phase-prompt.ts`, `plan-parser.ts`, `init-runner.ts`, `tool-scoping.ts`, `errors.ts`

**`sdk/src/compile/`:**
- Purpose: SDK-owned compiler/audit foundation for the advisory FSM migration; holds the `runCompiler` orchestrator, compile CLI parsing, deterministic baseline read/write/check logic, diagnostics, path/hash helpers, validators, classification, billing-boundary checks, and filesystem inventory collectors
- Contains: Pure TypeScript utility modules with co-located Vitest unit tests plus `compiler.integration.test.ts` against the live repository; command/workflow/agent/hook collectors live under `inventory/`
- Key files: `cli.ts`, `compiler.ts`, `baselines.ts`, `types.ts`, `diagnostics.ts`, `paths.ts`, `hash.ts`, `classification.ts`, `validators.ts`, `billing-boundary.ts`, `index.ts`, `inventory/commands.ts`, `inventory/workflows.ts`, `inventory/agents.ts`, `inventory/hooks.ts`

**`sdk/src/generated/compile/`:**
- Purpose: Committed compiler golden baselines generated by `gsd-sdk compile --write`
- Contains: Seven deterministic JSON files: command coverage, workflow coverage, agent contracts, hook install posture, command classification, billing boundary, and compile summary
- Build note: `sdk/package.json` copies these JSON files into `sdk/dist/generated/compile/` after `tsc`

**`sdk/src/query/`:**
- Purpose: Native TypeScript implementations of gsd-tools.cjs query/mutation commands; registered in a flat `QueryRegistry`
- Contains: ~60 handler files organized by domain; co-located `.test.ts` files
- Key files: `index.ts` (registry factory), `registry.ts` (QueryRegistry class), `fsm-state.ts`, `thread.ts`, `state.ts`, `state-mutation.ts`, `phase.ts`, `phase-lifecycle.ts`, `roadmap.ts`, `config-query.ts`, `config-mutation.ts`, `verify.ts`, `validate.ts`, `frontmatter.ts`, `frontmatter-mutation.ts`, `commit.ts`, `workspace.ts`, `workstream.ts`, `intel.ts`, `progress.ts`, `init.ts`, `init-complex.ts`

**`sdk/src/golden/`:**
- Purpose: Golden test infrastructure for SDK regression testing
- Contains: `capture.ts`, `golden-policy.ts`, `registry-canonical-commands.ts`, fixture files (`.golden.json`, sample JSONL sessions)

**`tests/`:**
- Purpose: Integration tests for `gsd-tools.cjs`
- Contains: CJS-style tests exercising state, phase, roadmap, and config operations

## Key File Locations

**Entry Points:**
- `bin/install.js`: npm install/npx entry — copies GSD files to `~/.claude/`
- `bin/gsd-sdk.js`: `gsd-sdk` CLI shim
- `sdk/src/cli.ts`: Full CLI implementation (`run`, `auto`, `init`, `query`, `compile` commands)
- `sdk/src/index.ts`: Public SDK API (`GSD` class, all re-exports)
- `get-shit-done/bin/gsd-tools.cjs`: CJS state management CLI

**Configuration:**
- `package.json`: Root package, bin definitions, build scripts
- `sdk/package.json`: SDK sub-package with own deps (`@anthropic-ai/claude-agent-sdk`, `ws`)
- `vitest.config.ts`: Test runner configuration
- `tsconfig.json`: Root TypeScript config
- `sdk/tsconfig.json`: SDK-specific TypeScript config
- `get-shit-done/templates/config.json`: Template for `.planning/config.json` (workflow flags, model profile)

**Core Logic:**
- `sdk/src/phase-runner.ts`: Phase lifecycle FSM (discuss→research→plan→execute→verify→advance)
- `sdk/src/session-runner.ts`: `query()` call orchestration and result extraction
- `sdk/src/gsd-tools.ts`: Bridge between SDK and state management (native registry + CJS fallback)
- `sdk/src/query/index.ts`: All native query handlers registered via `createRegistry()`
- `sdk/src/context-engine.ts`: Phase-type → context file resolution and truncation
- `sdk/src/event-stream.ts`: SDKMessage → GSDEvent mapping and transport dispatch
- `sdk/src/tool-scoping.ts`: PhaseType → allowed tools mapping

**Testing:**
- `sdk/src/*.test.ts`: Unit tests co-located with source (vitest)
- `sdk/src/*.integration.test.ts`: Integration tests requiring disk/subprocess
- `sdk/src/golden/`: Golden capture/replay tests
- `tests/`: CJS integration tests for `gsd-tools.cjs`

## Naming Conventions

**Files:**
- Commands: kebab-case `.md` matching the slash command name (e.g. `execute-phase.md` → `/gsd:execute-phase`)
- SDK source: kebab-case `.ts` (e.g. `phase-runner.ts`, `context-engine.ts`)
- Test files: `<name>.test.ts` (unit), `<name>.integration.test.ts` (integration), `<name>.e2e.integration.test.ts` (E2E)
- Agent definitions: `gsd-<role>.md` prefix (e.g. `gsd-executor.md`, `gsd-planner.md`)
- CJS modules: kebab-case `.cjs` (e.g. `state.cjs`, `phase.cjs`)

**Directories:**
- Feature-named: workflows, agents, hooks, scripts, templates
- SDK follows flat `src/` with focused subdirectories such as `query/` for handler registry and `compile/` for compiler/audit modules
- No barrel `index.ts` files except `sdk/src/index.ts` (public API), `sdk/src/query/index.ts` (registry), and `sdk/src/compile/index.ts` (compile public API)

**Classes/Types:**
- PascalCase classes: `GSD`, `PhaseRunner`, `InitRunner`, `GSDTools`, `GSDEventStream`, `ContextEngine`, `QueryRegistry`, `CLITransport`, `WSTransport`
- Enum names: `PhaseType`, `PhaseStepType`, `GSDEventType`, `ErrorClassification`
- Interfaces: `GSDConfig`, `ParsedPlan`, `PlanTask`, `GSDOptions`, `SessionOptions`, `PhaseRunnerDeps`

## Where to Add New Code

**New slash command:**
- Add `commands/gsd/<command-name>.md` with YAML frontmatter + `<objective>` + `<execution_context>` referencing `@~/.claude/get-shit-done/workflows/<command-name>.md`
- Add matching `get-shit-done/workflows/<command-name>.md` with detailed instructions
- Run `bin/install.js` to deploy

**New agent definition:**
- Add `agents/gsd-<role>.md` with YAML frontmatter (`tools:`, `model:`, `description:`) and `<role>` block
- Reference from commands via `agent: gsd-<role>` frontmatter key

**New SDK query handler:**
- Add handler function in `sdk/src/query/<domain>.ts` returning `QueryResult`
- Add co-located `sdk/src/query/<domain>.test.ts`
- Register in `sdk/src/query/index.ts` via `registry.register('<command-key>', handlerFn)`
- Add to `sdk/src/golden/registry-canonical-commands.ts` if golden coverage required

**New SDK compile module:**
- Add module in `sdk/src/compile/<domain>.ts` importing shared contracts from `./types.js`
- Add co-located `sdk/src/compile/<domain>.test.ts`
- Export only public contracts/utilities from `sdk/src/compile/index.ts`; keep compiler orchestrator, inventory, billing, and baseline internals private until intentionally promoted

**New phase step:**
- Extend `PhaseStepType` enum in `sdk/src/types.ts`
- Add step handling in `PhaseRunner.run()` in `sdk/src/phase-runner.ts`
- Add prompt template to `sdk/src/phase-prompt.ts` `PHASE_WORKFLOW_MAP`
- Add tool set to `sdk/src/tool-scoping.ts` `PHASE_DEFAULT_TOOLS`

**New hook:**
- Add `hooks/gsd-<purpose>.(js|sh)` following the existing pattern (reads `CLAUDE_TOOL_*` env vars for PreToolUse)
- Wire in the install script if not auto-discovered

**New workflow step file:**
- Add to `get-shit-done/workflows/<workflow>/<step>.md`
- Reference via `@` include in the parent workflow `.md`

**Utilities:**
- Shared SDK helpers: `sdk/src/query/helpers.ts` (path resolution, project root detection)
- SDK-wide utilities: `sdk/src/query/utils.ts` (slug generation, timestamp)
- Prompt utilities: `sdk/src/prompt-builder.ts` (agent def parsing, prompt assembly), `sdk/src/prompt-sanitizer.ts`

## Special Directories

**`.claude/worktrees/`:**
- Purpose: Git worktrees created per agent task when Claude Code spawns subagents
- Generated: Yes (auto-created at agent spawn time)
- Committed: No (`.gitignore`d)

**`sdk/dist/`:**
- Purpose: Compiled JavaScript output from TypeScript SDK build
- Generated: Yes (via `cd sdk && npm run build`)
- Committed: Yes (distributed in npm tarball for zero-build consumption)

**`.planning/`:**
- Purpose: Per-project GSD planning state (ROADMAP.md, STATE.md, CONTEXT.md, phases/, etc.)
- Generated: Yes (created by `/gsd:new-project` or `gsd-sdk init`)
- Committed: Yes (the planning artifacts are source of truth for project state)

**`.planning/codebase/`:**
- Purpose: Codebase map documents written by `gsd-map-codebase` command
- Generated: Yes (written by `gsd-codebase-mapper` agent)
- Committed: Yes (consumed by `gsd-plan-phase` and `gsd-execute-phase` for context)

---

*Structure analysis: 2026-04-27*
