# Architecture

**Analysis Date:** 2026-04-27

## Pattern Overview

**Overall:** Layered orchestration system with a finite-state-machine phase lifecycle at its core, driven by a dual-surface architecture: an LLM-facing slash-command surface (markdown prompt files) and a programmatic TypeScript SDK surface.

**Key Characteristics:**
- Commands are markdown files with YAML frontmatter — they are prompts, not code
- The TypeScript SDK (`sdk/src/`) implements the same workflow programmatically via the Anthropic Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- State lives on disk in `.planning/` as markdown files (STATE.md, ROADMAP.md, CONTEXT.md, PLAN.md, etc.)
- A CJS tool binary (`get-shit-done/bin/gsd-tools.cjs`) provides state query/mutation operations; the TypeScript SDK re-implements many of these natively in `sdk/src/query/`
- Everything is agent-orchestrated: specialized agents (`agents/gsd-*.md`) are spawned per phase step

## Layers

**CLI Surface (Slash Commands):**
- Purpose: LLM-facing entry points for interactive Claude Code sessions
- Location: `commands/gsd/` (one `.md` file per command, e.g. `execute-phase.md`, `plan-phase.md`)
- Contains: YAML frontmatter (name, description, allowed-tools, agent), `<objective>`, `<execution_context>` blocks with `@file` references
- Depends on: Workflow prose files in `get-shit-done/workflows/`, agent definitions in `agents/`
- Used by: Claude Code's slash-command subsystem (installed via `bin/install.js`)

**Workflow Prose Layer:**
- Purpose: Detailed step-by-step instructions for each workflow, loaded by commands via `@` file references
- Location: `get-shit-done/workflows/` (mirrors the `commands/gsd/` set)
- Contains: Detailed orchestration instructions, step sequencing, flag handling rules, context budget guidance
- Key subdirs: `workflows/discuss-phase/modes/` (advisor, auto, batch, chain, default, power, text), `workflows/execute-phase/steps/`
- Depends on: `get-shit-done/contexts/`, `get-shit-done/references/`, `get-shit-done/templates/`
- Used by: Commands (via `@` includes), also loaded by `InitRunner` from disk

**Agent Definitions:**
- Purpose: Specialized agent roles with scoped tool access and role instructions
- Location: `agents/` (33 `gsd-*.md` files)
- Key agents: `gsd-executor.md`, `gsd-planner.md`, `gsd-verifier.md`, `gsd-phase-researcher.md`, `gsd-plan-checker.md`, `gsd-codebase-mapper.md`, `gsd-integration-checker.md`, `gsd-roadmapper.md`
- Pattern: Each `.md` has YAML frontmatter (`tools:`, `model:`) and a `<role>` block; the SDK parses these to configure `query()` calls
- Used by: `PhaseRunner` (maps phase type → agent via `PHASE_AGENT_MAP`), commands (via `agent:` frontmatter key)

**SDK Orchestration Layer (`sdk/src/`):**
- Purpose: Programmatic equivalents of slash-command workflows; enables autonomous `gsd-sdk run` / `gsd-sdk auto` execution
- Location: `sdk/src/`
- Key classes: `GSD` (facade, `index.ts`), `PhaseRunner` (`phase-runner.ts`), `InitRunner` (`init-runner.ts`)
- Data flow: `GSD.run()` → discover phases via `GSDTools.roadmapAnalyze()` → `GSD.runPhase()` per phase → `PhaseRunner.run()` state machine → `runPhaseStepSession()` per step → `query()` (Anthropic Claude Agent SDK)
- Depends on: `config.ts`, `gsd-tools.ts`, `event-stream.ts`, `context-engine.ts`, `phase-prompt.ts`, `tool-scoping.ts`, `prompt-builder.ts`, `session-runner.ts`

**Phase Lifecycle State Machine (`phase-runner.ts`):**
- Purpose: Drives the per-phase lifecycle: discuss → research → plan → plan_check → execute → verify → advance
- Location: `sdk/src/phase-runner.ts`
- Steps (enum `PhaseStepType`): `Discuss`, `Research`, `Plan`, `PlanCheck`, `Execute`, `Verify`, `Advance`
- Config gates: Each step can be skipped via `GSDConfig.workflow.*` flags (e.g. `skip_discuss`, `research`, `plan_check`, `verifier`)
- Human gate callbacks: `HumanGateCallbacks` (onDiscussApproval, onVerificationReview, onBlockerDecision) — defaults to auto-approve
- Depends on: `GSDTools`, `PromptFactory`, `ContextEngine`, `GSDEventStream`, `runPhaseStepSession()`

**Query Registry (`sdk/src/query/`):**
- Purpose: Native TypeScript implementations of state/config read and mutation commands; mirrors and gradually replaces `gsd-tools.cjs`
- Location: `sdk/src/query/` (~60+ files)
- Key modules: `fsm-state.ts`, `thread.ts`, `state.ts`, `state-mutation.ts`, `phase.ts`, `phase-lifecycle.ts`, `roadmap.ts`, `config-query.ts`, `config-mutation.ts`, `verify.ts`, `frontmatter.ts`, `frontmatter-mutation.ts`, `commit.ts`, `workspace.ts`, `workstream.ts`, `intel.ts`
- Registry pattern: `createRegistry()` in `sdk/src/query/index.ts` wires all handlers into a `QueryRegistry` (flat Map); `resolveQueryArgv()` matches longest-prefix argv tokens
- Dispatched via: `GSDTools.dispatch()` → native registry first, falls back to `gsd-tools.cjs` subprocess for unimplemented commands

**Compile/Audit Layer (`sdk/src/compile/`):**
- Purpose: SDK-owned compiler/audit foundation for the advisory FSM migration; exposed through top-level `gsd-sdk compile`
- Location: `sdk/src/compile/`
- Key modules: `cli.ts` (compile flag parser and late compiler dispatch), `compiler.ts` (typed Plan 02 shell), `baselines.ts` (typed Plan 02 baseline shell), `types.ts`, `diagnostics.ts`, `paths.ts`, `hash.ts`, `inventory/commands.ts`, `inventory/workflows.ts`, `inventory/agents.ts`, `inventory/hooks.ts`
- Billing boundary: `sdk/src/cli.ts` dispatches compile via dynamic import and model-backed `GSD` / `InitRunner` / transport imports stay inside run/auto/init branches only

**CJS Tool Binary (`get-shit-done/bin/gsd-tools.cjs`):**
- Purpose: Legacy/fallback state management CLI; same operations as the query registry but implemented in CommonJS
- Location: `get-shit-done/bin/gsd-tools.cjs` (+ `get-shit-done/bin/lib/*.cjs` modules)
- Invoked by: `GSDTools` when native registry has no match (subprocess via `execFile`), and directly by hooks
- Key lib modules: `state.cjs`, `phase.cjs`, `roadmap.cjs`, `config.cjs`, `verify.cjs`, `frontmatter.cjs`, `template.cjs`, `commit.cjs`, `workstream.cjs`, `intel.cjs`, `security.cjs`

**Context Engine (`sdk/src/context-engine.ts`):**
- Purpose: Resolves which `.planning/` state files are needed per phase type; reads, truncates, and delivers them to prompt construction
- Phase → files manifest: Execute needs `STATE.md` + `config.json`; Plan needs `STATE.md` + `ROADMAP.md` + `CONTEXT.md` + `RESEARCH.md` + `REQUIREMENTS.md`; Verify needs `STATE.md` + `ROADMAP.md` + `REQUIREMENTS.md` + `PLAN.md` + `SUMMARY.md`; Research needs `STATE.md` + `ROADMAP.md` + `CONTEXT.md`
- Truncation: `context-truncation.ts` narrows `ROADMAP.md` to current milestone; preserves headings/first paragraph per section

**Event Stream (`sdk/src/event-stream.ts`):**
- Purpose: Maps raw `@anthropic-ai/claude-agent-sdk` `SDKMessage` variants to typed `GSDEvent` discriminated union; distributes to registered transports
- Extends: `EventEmitter`
- Transports: `CLITransport` (`cli-transport.ts`) — prints to stdout; `WSTransport` (`ws-transport.ts`) — broadcasts over WebSocket
- Cost tracking: per-session `CostBucket` map + cumulative total via `CostTracker`

**Hooks Layer:**
- Purpose: Claude Code session lifecycle hooks (PreToolUse, PostToolUse, Stop)
- Location: `hooks/` (JS and shell)
- Key hooks: `gsd-workflow-guard.js` — blocks disallowed tool use, `gsd-read-guard.js` — prevents reads of forbidden files, `gsd-context-monitor.js` — warns on context window saturation, `gsd-prompt-guard.js` — prompt injection scanner, `gsd-phase-boundary.sh` — enforces phase transitions, `gsd-validate-commit.sh` — commit validation, `gsd-statusline.js` — session status display, `gsd-check-update.js` / `gsd-check-update-worker.js` — background update checks

## Data Flow

**Interactive Slash Command Flow:**

1. User invokes `/gsd:execute-phase <N>` in Claude Code
2. Claude loads `commands/gsd/execute-phase.md` (YAML frontmatter + objective)
3. `@` references load `workflows/execute-phase.md` (full instructions)
4. Orchestrator spawns `gsd-executor` subagent (via `Task` tool) for each plan in the wave
5. Executor reads plan file (`.planning/phases/NN-*/NN-*-PLAN.md`) and executes tasks
6. State mutations go through `gsd-tools.cjs` or hook-injected SDK calls
7. Verification subagent (`gsd-verifier`) checks completion; advance updates STATE.md

**Programmatic SDK Flow:**

1. `new GSD({ projectDir })` creates facade with event stream
2. `gsd.run(prompt)` → `tools.roadmapAnalyze()` → discovers incomplete phases from `.planning/ROADMAP.md`
3. Per phase: `gsd.runPhase(N)` → `new PhaseRunner(deps).run(N)`
4. `PhaseRunner` state machine steps through: discuss → research → plan → plan_check → execute → verify → advance
5. Per step: `ContextEngine.resolve(phaseType)` loads relevant `.planning/` files; `PromptFactory` builds step prompt; `runPhaseStepSession()` calls `query()` with scoped tools
6. `query()` streams `SDKMessage[]`; `GSDEventStream.mapMessage()` translates to typed `GSDEvent`; transports receive events
7. On completion: `GSDTools.phaseComplete()` mutates STATE.md; PhaseRunner advances to next step

**Init Flow (new project bootstrap):**

1. `gsd-sdk init @prd.md` → `InitRunner.run(input)`
2. Steps: setup → config → PROJECT.md → parallel research (4× `query()` sessions for STACK/FEATURES/ARCHITECTURE/PITFALLS) → synthesis → requirements → roadmap
3. Research sessions run concurrently via `Promise.all()`
4. Each step emits `InitStepStart` / `InitStepComplete` events

**State Management:**

- All state lives on disk in `.planning/` as markdown + JSON files
- Reads: via `ContextEngine` (SDK) or `gsd-tools.cjs state` subcommands
- Writes: via `query/state-mutation.ts` (SDK) or `gsd-tools.cjs` subprocess
- Workstreams route `.planning/` to `.planning/workstreams/<name>/`

## Key Abstractions

**ParsedPlan:**
- Purpose: Structured representation of a PLAN.md file (YAML frontmatter + XML task bodies)
- Examples: `sdk/src/plan-parser.ts`, `sdk/src/types.ts`
- Pattern: `parsePlanFile(path)` reads disk → returns `{ frontmatter, objective, tasks, context_refs, raw }`

**GSDConfig:**
- Purpose: Project-level configuration loaded from `.planning/config.json`; controls which workflow steps are enabled
- Examples: `sdk/src/config.ts`
- Pattern: `loadConfig(projectDir, workstream?)` merges disk JSON with defaults; `WorkflowConfig` controls step gating

**PhaseType / PhaseStepType:**
- Purpose: Enums distinguishing session types (Research, Execute, Plan, Verify, Discuss, Repair) from lifecycle steps (adds PlanCheck, Advance)
- Examples: `sdk/src/types.ts`
- Used by: `ContextEngine` (selects file manifest), `tool-scoping.ts` (selects allowed tools), `PhaseRunner` (state machine transitions)

**GSDEvent (discriminated union):**
- Purpose: Typed event bus connecting SDK internals to external consumers (CLI, WebSocket, tests)
- Examples: `sdk/src/types.ts`, `sdk/src/event-stream.ts`
- 30+ event types covering session, phase, wave, milestone, init, state mutation, git, and cost tracking

**QueryRegistry:**
- Purpose: Flat command dispatch table mapping string keys to typed handler functions
- Examples: `sdk/src/query/registry.ts`, `sdk/src/query/index.ts`
- Pattern: `createRegistry()` returns wired registry; `registry.dispatch(cmd, args, projectDir, ws?)` returns `QueryResult`

## Entry Points

**`bin/install.js`:**
- Location: `bin/install.js`
- Triggers: `npx get-shit-done-cc` or post-install
- Responsibilities: Copies `commands/`, `agents/`, `hooks/`, `get-shit-done/` into `~/.claude/` for Claude Code to discover

**`bin/gsd-sdk.js`:**
- Location: `bin/gsd-sdk.js`
- Triggers: `gsd-sdk <command>` CLI invocation
- Responsibilities: Entry shim that delegates to compiled `sdk/dist/cli.js`

**`sdk/src/cli.ts`:**
- Location: `sdk/src/cli.ts`
- Triggers: `gsd-sdk run|auto|init|query|compile` commands
- Responsibilities: Parses argv → validates workstream name → resolves project root → routes to `GSD.run()` / `InitRunner.run()` / `registry.dispatch()` / `runCompileCommand()`; wires `CLITransport` and optional `WSTransport` only for model-backed run/auto/init branches

**`sdk/src/index.ts` (`GSD` class):**
- Location: `sdk/src/index.ts`
- Triggers: Programmatic SDK consumers (`import { GSD } from '@gsd-build/sdk'`)
- Responsibilities: Facade composing `PhaseRunner`, `GSDTools`, `PromptFactory`, `ContextEngine`, `GSDEventStream`; exposes `executePlan()`, `runPhase()`, `run()`, `createTools()`, `addTransport()`

**`get-shit-done/bin/gsd-tools.cjs`:**
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Triggers: `node gsd-tools.cjs <command> [args]` from hooks, `GSDTools` subprocess fallback
- Responsibilities: Full state/config/phase/roadmap CRUD operations via CJS library modules

## Error Handling

**Strategy:** Classified errors with semantic exit codes; phase step failures are captured as `PhaseStepResult.error` strings rather than thrown; fatal errors propagate as `GSDError` or `GSDToolsError`

**Patterns:**
- `GSDError(message, ErrorClassification)` — base SDK error with classification-to-exit-code mapping (`errors.ts`): Validation=10, Blocked=11, Execution/Interruption=1
- `GSDToolsError` — wraps `gsd-tools.cjs` subprocess failures with command, args, exit code, stderr
- `PhaseRunnerError` — wraps per-step failures with phase number and step type
- Step failures in `PhaseRunner` are caught internally, recorded as `PhaseStepResult { success: false, error }`, and may trigger `onBlockerDecision` callback before stopping

## Cross-Cutting Concerns

**Logging:** `GSDLogger` (`sdk/src/logger.ts`) — structured log levels (debug/info/warn/error); consumed by `PhaseRunner` via optional dep injection

**Validation:** YAML frontmatter parsed by `plan-parser.ts` for plans; `config-schema.ts` / `sdk/src/query/config-schema.ts` validate config.json structure; `gsd-tools.cjs`-side validation via `validate.cjs`

**Authentication:** None in SDK; Anthropic API key consumed transparently by `@anthropic-ai/claude-agent-sdk`

**Workstreams:** All `.planning/` paths are routed through `relPlanningPath(workstream?)` (`workstream-utils.ts`) which injects `.planning/workstreams/<name>/` prefix when a workstream is active

**Tool Scoping:** `tool-scoping.ts` maps each `PhaseType` to a default allowed-tool set; agent definition frontmatter `tools:` overrides defaults

**Context Truncation:** `context-truncation.ts` truncates large markdown files to stay within model context limits; `ROADMAP.md` is narrowed to the current milestone section

---

*Architecture analysis: 2026-04-27*
