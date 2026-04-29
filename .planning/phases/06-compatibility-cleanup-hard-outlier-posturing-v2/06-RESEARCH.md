# Phase 06 Research: Compatibility Cleanup + Hard Outlier Posturing

## Research Summary

Phase 6 should be planned as compiler and gate hardening first, with pilot slimming only after the new eligibility command proves all required evidence from compiler-owned data.

The current compiler already has most inventory surfaces needed for the first implementation slice:

- `sdk/src/compile/cli.ts` parses `gsd-sdk compile` flags and is the right place to add `--check-slim-eligibility <workflow-id>`.
- `sdk/src/compile/compiler.ts` builds the authoritative `CompileReport` and generated baseline records.
- `sdk/src/compile/classification.ts` owns the hard-coded hard-outlier set.
- `sdk/src/compile/inventory/workflows.ts` owns workflow coverage and semantic inference from live workflow Markdown.
- `sdk/src/compile/workflow-semantics.ts` owns structured workflow semantic metadata and provider routing augmentation.
- `sdk/src/compile/packet-contracts.ts` validates packet shape, atomicity, agent contracts, allowed tools, and expected evidence, but only for explicit packet candidates today.
- `sdk/src/parity/generate-fixtures.ts` derives parity coverage from generated compile manifests.
- `scripts/phase4-parity.cjs` is the existing hermetic cleanup gate and should be extended conditionally, not replaced.

The main planning risk is that current workflow coverage and semantic manifests are still inferred from the live Markdown workflow body. If a workflow file becomes a thin `gsd-advisory` launcher, the next compile will otherwise see fewer steps, fewer semantic features, and weaker parity inputs. Therefore, do not plan an archive move until the plan also creates a durable compiler-owned slim evidence source or proves one already exists for that exact workflow.

Live/generated data available during research:

- Plain `node bin/gsd-sdk.js compile` exits zero and reports 86 commands, 84 workflows, 33 agents, 11 hooks, and 5 outliers.
- Existing `.planning/compile/compile-report.json` has the same counts, 0 errors, and 125 warnings.
- Generated `sdk/src/generated/parity/parity-workflow-index.json` currently has parity tiers: 16 deterministic, 12 dynamic-branch, 34 hitl, 18 query-native, and 6 hard-outlier-tier entries.
- The 6 hard-outlier-tier parity entries are not the same as the 5 seed hard outliers: `/gsd-review-backlog` is `dynamic-branch` with `workflowId: null` and is tiered as `hard-outlier` by the parity fixture generator. Phase 6 must distinguish classification hard outliers from parity-tier fallback.

## Relevant Existing Surfaces

### Compile CLI and Report

Current compile CLI flow:

- `sdk/src/cli.ts` has a permissive top-level parser for `compile` and passes compile-specific argv into `runCompileCommand()`.
- `sdk/src/compile/cli.ts` uses `parseArgs(... strict: true, allowPositionals: false)` for compile-specific flags.
- Supported compile flags are currently `--json`, `--check`, `--write`, `--check-billing-boundary`, `--project-dir`, `-h`, and `--help`.
- `runCompileCommand()` writes `.planning/compile/compile-report.json` when `--json`, `--check`, `--write`, or hard errors are present. A plain compile with no errors prints counts and does not write the report file.
- `--check` compares generated manifests against committed baselines under `sdk/src/generated/compile/`.
- `--write` regenerates those baselines.

Current `CompileReport` shape in `sdk/src/compile/types.ts`:

- `counts`: commands, workflows, agents, hooks.
- `manifests`: commands, workflows, workflowSemantics, agents, hooks, classification, billing.
- `diagnostics`: stable diagnostics with `code`, `severity`, `kind`, `id`, `path`, optional `field`, and optional `hint`.

`DiagnosticKind` currently has `command`, `workflow`, `agent`, `hook`, `billing`, `baseline`, `extension`, `packet`, and `state`. Phase 6 can either reuse `workflow`/`command` for SLIM/OUTL diagnostics or add dedicated `slim`/`outlier` kinds and update type tests.

### Compiler Orchestration

`sdk/src/compile/compiler.ts` performs this sequence:

1. `collectWorkflows(projectDir, diagnostics)`.
2. `collectCommands(projectDir, diagnostics, knownWorkflowIds)`.
3. `collectAgents(projectDir, diagnostics)`.
4. `collectHooks(projectDir, diagnostics)`.
5. `classifyCommands(commands, diagnostics)`.
6. `readProviderConfig(projectDir)` from `.planning/config.json`.
7. `collectPacketDefinitionCandidates({ explicit: opts.packetDefinitions })`.
8. Validate duplicates, packet budgets, packet contracts, packet atomicity, workflow semantics, extension deps, billing boundary, transform ordering, generated artifact declarations, state references, and generated artifact existence.
9. Emit `CompileReport`.
10. Optionally write/check baselines.

Important gap: `collectPacketDefinitionCandidates()` currently returns only explicit packet candidates passed in compiler options. The live repo compile path passes none. This means packet sequencing is not currently discoverable from live compile output. A Phase 6 plan must not mark packet sequencing as proven just because `packet-contracts.ts` exists.

### Command Classification

`sdk/src/compile/classification.ts` owns the current taxonomy:

- `core-lifecycle`
- `composite`
- `query-utility`
- `single-agent-bounded`
- `dynamic-branch`
- `hard-outlier`

Hard outliers are currently hard-coded in `SEED_HARD_OUTLIERS`:

- `/gsd-graphify`
- `/gsd-from-gsd2`
- `/gsd-ultraplan-phase`
- `/gsd-review`
- `/gsd-fast`

Current manifest representation for seed hard outliers:

- `category: "hard-outlier"`
- `isHardOutlier: true`
- `migrationDisposition: "manual-posture-required"`
- `outlierPosture: "seed-outlier"`

Generated data shows:

- `/gsd-fast` has `workflowId: "/workflows/fast"`.
- `/gsd-review` has `workflowId: "/workflows/review"`.
- `/gsd-ultraplan-phase` has `workflowId: "/workflows/ultraplan-phase"`.
- `/gsd-graphify` has `workflowId: null`.
- `/gsd-from-gsd2` has `workflowId: null`.

`sdk/src/compile/inventory/commands.ts` also has `COMMAND_ONLY_IDS` containing `/gsd-graphify` and `/gsd-from-gsd2`; this is why those commands have no workflow association.

### Workflow Manifests

`sdk/src/compile/inventory/workflows.ts`:

- Traverses only top-level `get-shit-done/workflows/*.md`.
- Nested files under workflow subdirectories are support assets and are not counted as workflows.
- Workflow ID is `/workflows/<filename-without-md>`.
- `stepCount` is inferred from `<step` tags or `##` headings.
- `runnerType` is inferred from body text.
- `determinism` is inferred from body text.
- `semanticFeatures` are inferred from regexes over body text.
- `semanticManifest` is produced by `inferWorkflowSemanticManifest(workflowId, content)`.
- Hash is the hash of the live workflow file contents.

Slim launcher impact:

- A launcher-only file will likely have `stepCount: 0`, `runnerType: "unknown"`, `determinism: "unknown"`, and sparse/no semantic features unless the compiler is taught to use non-prose evidence.
- The workflow hash will change.
- `workflow-coverage.json`, `workflow-semantics.json`, parity fixtures, and compile baselines will change.
- If the archived original prose is not used by the compiler, all semantic evidence must come from another structured source.

This is the biggest implementation finding for the planner.

### Workflow Semantics and Provider Routing

`sdk/src/compile/workflow-semantics.ts`:

- Infers semantic families such as `mode-dispatch`, `hitl`, `config-gate`, `parallel-wave`, `filesystem-fallback`, `sentinel-polling`, `runtime-type-branch`, `completion-marker`, `fallback-posture`, and `evidence-requirement`.
- Validates semantic manifests through `sdk/src/advisory/workflow-semantics.ts`.
- Adds `mandatoryProviders` to semantic entries through `emitWorkflowSemanticMetadata()`.
- Provider augmentation reads `.planning/config.json` `agent_routing` and classification `agentTypes`.

`sdk/src/advisory/routing.ts`:

- Runtime route values support `codex:<low|medium|high|xhigh>`, `gemini`, and Claude aliases `opus`, `sonnet`, `haiku`.
- Step-scoped route keys currently use `agentId::workflowId::stepId` via `ROUTING_STEP_DELIMITER = "::"`.
- `resolveRoutingTarget()` checks step-scoped routes first, then agent defaults.

Planning implication:

- The SLIM provider-routing gate can use workflow semantics and route validation as evidence only if the workflow has concrete agent types and route metadata.
- Many command classification entries have empty `agentTypes` because command frontmatter may not declare `agent`. Empty agent types make provider routing indeterminate for Phase 6 unless the plan defines that "no provider-specific route required" is an explicit pass condition.

### Packet Outputs and Sequencing

`sdk/src/advisory/workflow-runner.ts`:

- Builds a support matrix from command classification, workflow coverage, and workflow semantics.
- Hard outliers return posture before workflow existence is required.
- Query utilities and composites return posture, not packets.
- Dynamic branches require valid `branchId`.
- Normal packet-template workflows return a generic `AdvisoryPacket` from `packetFor()`.
- Packets include required fields and `expectedEvidence`, but the generic packet instruction is not a per-workflow step sequence.

`sdk/src/compile/packet-contracts.ts`:

- Validates packet schema through `validateAdvisoryPacket()`.
- Enforces packet atomicity through `validatePacketAtomicity()`.
- Enforces disk-write agent/tool requirements and completion marker/output artifact expected evidence.

Current gap:

- Live compile does not collect emitted packet sequences for each workflow.
- Existing parity tests prove runner dispatch can produce packets for parity tiers, but not that a workflow's full original Markdown sequence is represented as typed packet steps.

Planning implication:

- The SLIM packet-sequencing gate should be treated as indeterminate until Phase 6 adds a compiler-owned packet sequence evidence surface or explicitly maps existing parity fixtures to acceptable sequence evidence.
- Do not let `WorkflowRunner.packetFor()` alone satisfy packet sequencing; it emits a generic packet for arbitrary `stepId`.

### Parity Outputs

`sdk/src/parity/generate-fixtures.ts`:

- Reads `sdk/src/generated/compile/command-classification.json`.
- Reads `sdk/src/generated/compile/workflow-semantics.json`.
- Builds `sdk/src/generated/parity/parity-workflow-index.json`.
- Builds `sdk/src/generated/parity/disposition-manifest.json`.
- `--check` compares generated parity fixtures against committed generated files.

Parity tier logic:

- `hard-outlier` tier when `entry.isHardOutlier`, category is `hard-outlier`, or a `dynamic-branch` entry lacks a workflow or branch IDs.
- `query-native` tier when category is `query-utility`.
- `dynamic-branch` tier when category is `dynamic-branch` and branch IDs exist.
- `hitl` tier when workflow semantics contain suspension points.
- Otherwise `deterministic`.

Parity tests:

- `sdk/src/parity/deterministic-workflows.test.ts` dispatches all non-composite deterministic workflow-backed entries and asserts packet required fields.
- `sdk/src/parity/dynamic-branch-workflows.test.ts` dispatches every branch ID and invalid branch cases.
- `sdk/src/parity/hitl-workflows.test.ts` tests suspension and resume paths.
- `sdk/src/parity/hard-outlier-posture.test.ts` asserts all 5 seed hard outliers return posture, not packet.
- `sdk/src/parity/provider-fallback.test.ts` validates provider metadata behavior.
- `sdk/src/parity/retirement-gate.test.ts` and related tests protect `gsd-post-update` retirement.

Important parity nuance:

- `hard-outlier-posture.test.ts` has an `EXPECTED_HARD_OUTLIERS` list with workflow IDs for graphify/from-gsd2 even though generated command classification has `workflowId: null` for those commands. The test checks parity index membership by command ID and passes the expected workflow ID into runner dispatch. Phase 6 posture work should tighten this so posture records and generated manifests agree on command-only outliers.

### Phase 4 Gate Script

`scripts/phase4-parity.cjs` defines ordered gate steps:

1. `wave0-hardening`
2. `hook-build`
3. `hook-install-tests`
4. `sdk-compile-check`
5. `staleness-gate`
6. `parity-suite`
7. `skip-ban`
8. `offline-scan`
9. `retirement-scan`

It supports `--step <name>` and exits on first failing step. It currently has no slim step.

Best insertion point:

- Add a conditional slim eligibility step after `staleness-gate` and before `parity-suite`, or after `parity-suite` before `skip-ban`.
- The earlier placement catches slimmed/evidence drift before running the full parity suite.
- The later placement lets parity prove its normal gate first, then checks slim-specific evidence.
- Either is defensible, but the step must be conditional and no-op when there are no thin launchers, no archive files, and no slim evidence files.

Detection should be data-driven:

- Thin launcher present: top-level `get-shit-done/workflows/*.md` content is exactly one fenced `gsd-advisory` YAML block.
- Archive evidence present: files under `docs/archive/*.md`.
- Optional explicit evidence present: a future compiler-owned slim evidence directory, if Phase 6 creates one.

The script must not shell from SDK into the parity script. The allowed direction is script to SDK: `scripts/phase4-parity.cjs` can call `node bin/gsd-sdk.js compile --check-slim-eligibility <workflow-id>`.

## Implementation Findings

### Add Slim Eligibility as a Compiler-Owned Surface

Likely files to modify:

- `sdk/src/compile/types.ts`
- `sdk/src/compile/cli.ts`
- `sdk/src/compile/compiler.ts`
- New `sdk/src/compile/slim-eligibility.ts`
- New/updated tests in `sdk/src/compile/cli.test.ts`, `sdk/src/compile/compiler.test.ts`, and a new `sdk/src/compile/slim-eligibility.test.ts`
- Possibly `sdk/src/compile/index.ts` for exported helpers used by tests

Recommended shape:

```ts
export type SlimEligibilityGate =
  | 'typed-transitions'
  | 'packet-sequencing'
  | 'provider-routing'
  | 'parity-coverage';

export type SlimEligibilityVerdict = {
  workflowId: string;
  commandId?: string;
  eligible: boolean;
  status: 'pass' | 'fail' | 'indeterminate';
  gates: Array<{
    gate: SlimEligibilityGate;
    status: 'pass' | 'fail' | 'indeterminate';
    evidence: string[];
    diagnostics: CompileDiagnostic[];
  }>;
};
```

CLI behavior:

- Add `checkSlimEligibility?: string` to `ParsedCompileArgs`.
- Add `--check-slim-eligibility <workflow-id>` to usage text.
- Keep strict parsing.
- When present, run the normal compiler pipeline, evaluate the workflow, print the structured verdict as JSON, and set non-zero exit for `fail` or `indeterminate`.
- Unknown workflow IDs should be `fail`, not `indeterminate`.
- Hard outlier workflows/commands should be `fail` with an OUTL diagnostic referencing the posture record.
- If the workflow maps to multiple commands, report that explicitly and either require a command-disambiguation field later or fail closed.

Do not implement `--apply-slim` in Phase 6 unless a later plan explicitly needs it.

### Eligibility Gate Evidence

Suggested gate definitions based on current code:

`typed-transitions`:

- Evidence candidates: `workflowSemantics` entry exists, validates cleanly, has required families for the workflow's classification, and runner support matrix disposition is packet-template/dynamic-branch/hitl as appropriate.
- Current weakness: semantic families are regex-inferred from Markdown, not durable typed transitions. Treat as indeterminate unless Phase 6 creates a structured non-prose transition evidence source.

`packet-sequencing`:

- Evidence candidates: packet definitions collected and validated by `packet-contracts.ts`, or runner/parity output proving the actual workflow sequence.
- Current weakness: live compile has no packet candidates. Treat as indeterminate until implemented.

`provider-routing`:

- Evidence candidates: workflow semantics include `mandatoryProviders` when config routing implies providers; `validateRoutingConfig()` is clean; route keys resolve for step-scoped/agent routes where applicable.
- Current weakness: many classification entries have no `agentTypes`; no provider-specific route may be a valid pass only if the gate defines that explicitly.

`parity-coverage`:

- Evidence candidates: `sdk/src/generated/parity/parity-workflow-index.json` has a matching workflow entry whose tier is compatible with the workflow classification and not fallback hard-outlier-tier caused by missing branch IDs.
- Current weakness: parity tier proves dispatch coverage, not full Markdown sequence equivalence.

The planner should require the implementation to record why each gate passed. A boolean-only eligibility result will not be enough for future slimming reviews.

### Hard Outlier Posture Records

Likely files to modify:

- `sdk/src/compile/classification.ts`
- `sdk/src/compile/types.ts`
- New `sdk/src/compile/outlier-postures.ts`
- New YAML files under `sdk/src/advisory/outlier-postures/`
- `sdk/src/advisory/workflow-runner.ts`
- `sdk/src/compile/classification.test.ts`
- `sdk/src/compile/compiler.integration.test.ts`
- `sdk/src/parity/hard-outlier-posture.test.ts`
- Generated baseline `sdk/src/generated/compile/command-classification.json` after implementation

Required posture schema from context:

- `commandId`
- `classifiedAs: hard-outlier`
- `migrationDisposition`
- `rationale`
- `emitsPacket: false`
- `reviewedAt`
- `owner`

Recommended additional schema fields for clarity:

- `workflowId` as string or null, matching generated classification.
- `sourcePath` or `posturePath`, so diagnostics can reference the YAML file.

Filename convention:

- Use normalized filenames such as `gsd-graphify.yaml`, `gsd-from-gsd2.yaml`, etc.
- The YAML content should still contain the canonical slash command ID, for example `commandId: /gsd-graphify`.
- Do not use the literal leading slash from `/gsd-graphify` in the filename.

Parser approach:

- The repo has no YAML dependency.
- Existing `sdk/src/query/frontmatter.ts` contains a narrow YAML/frontmatter parser, but its parser function is private and optimized for frontmatter.
- For Phase 6, either expose a narrow shared parser intentionally or implement a small strict parser for the flat posture schema. A strict flat parser is lower risk than adding a new dependency.

Classification behavior:

- `SEED_HARD_OUTLIERS` remains canonical and hard-coded.
- YAML posture files are required for every seed outlier.
- YAML posture files must not dynamically add new hard outliers.
- If a YAML posture file exists for a non-seed command, emit a hard diagnostic unless the code set was intentionally updated.
- Replace or extend `ClassificationEntry.outlierPosture` from the current string `"seed-outlier"` to a posture object, or add a separate `outlierPostureRecord` field.
- If changing `outlierPosture` from string to object, update `WorkflowRunner.reasonForDisposition()` to use `rationale`.

### Thin Launcher Validation

Likely files to modify:

- New `sdk/src/compile/slim-launcher.ts` or include in `slim-eligibility.ts`.
- `sdk/src/compile/inventory/workflows.ts` if launcher metadata must affect workflow manifest behavior.
- Root CJS tests under `tests/` for workflow artifact rules.
- Possibly `tests/workflow-size-budget.test.cjs` only if slimmed workflows need a separate assertion group.

Launcher constraints from context:

- Original workflow path remains.
- File contains only one fenced `gsd-advisory` YAML block.
- No prose, branching logic, runtime semantics, packet definitions, or hidden compatibility instructions.

Recommended minimal launcher schema:

```yaml
schemaVersion: 1
workflowId: /workflows/add-phase
commandId: /gsd-add-phase
runner: sdk-advisory
archivePath: docs/archive/gsd-add-phase.md
```

Validation should assert:

- Entire file matches exactly one fenced block.
- Fence info string is exactly `gsd-advisory`.
- Required fields are present and non-empty.
- `workflowId` matches the path stem.
- `commandId` exists in command classification and maps to the workflow.
- `archivePath` exists once the archive move is performed.
- No extra text before or after the fenced block except whitespace.
- Hard outlier workflows are rejected even if launcher metadata exists.

Planning caveat:

- If `collectWorkflows()` continues to infer semantics from the launcher body, slimmed workflow manifests will regress. Plan a compiler change that either:
  - preserves slimmed workflow semantic evidence from a structured manifest, or
  - explicitly treats launcher metadata as a pointer to a durable generated FSM contract, not to archived prose.

Do not make the compiler use archived prose as the primary semantic source unless the team accepts that the archive is still an executable/golden input in practice. That would undermine the cleanup goal.

### Archive Sequencing

Likely files to touch during a pilot, only after eligibility passes:

- `get-shit-done/workflows/<pilot>.md` becomes launcher-only.
- `docs/archive/<command-id>.md` receives the original prose.
- Generated compile and parity baselines may change if workflow hashes or manifest data changes.

Plan sequencing should be split:

1. Implement eligibility and posture machinery.
2. Run eligibility on candidate workflows.
3. If no workflow passes, stop with machinery/posture only.
4. If 3 to 5 workflows pass, archive original prose and write launcher files in a separate step.
5. Run compile check and Phase 4 parity gate after the archive move.

### Candidate Pilot Selection Approach

Do not choose pilot workflows until `--check-slim-eligibility` exists and emits pass verdicts.

A safe prefilter from current generated data:

- Exclude every command with `isHardOutlier: true`.
- Exclude `parityTier: "query-native"` because many have no workflow or do not emit packets.
- Exclude `parityTier: "hard-outlier"` because it includes both seed hard outliers and dynamic fallback cases such as `/gsd-review-backlog`.
- Prefer `parityTier: "deterministic"` with non-null `workflowId` and category not `composite`.
- Cross-check `workflow-coverage.json` for low step count, deterministic posture, no HITL, no task-spawn, no provider fallback, and no mode-dispatch.
- Then run `gsd-sdk compile --check-slim-eligibility <workflow-id>` and require `status: "pass"` before selection.

Current evidence supports only a prefilter, not final pilot choices:

- Generated parity data contains deterministic, workflow-backed, non-outlier candidates.
- Current compile data does not prove packet sequencing from live packet definitions.
- Current workflow semantics are Markdown-derived, so slimming would remove part of the evidence unless Phase 6 adds a durable replacement.

Therefore, planner should be ready for the "machinery + posture only" outcome.

### Tests That May Need Updates

Tests that enumerate or derive workflow/command inventory:

- `tests/inventory-counts.test.cjs`
- `tests/inventory-source-parity.test.cjs`
- `tests/inventory-manifest-sync.test.cjs`
- `sdk/src/compile/compiler.integration.test.ts`
- `sdk/src/compile/baselines.test.ts`
- Generated baseline checks through `node bin/gsd-sdk.js compile --check`

Tests called out in Phase 6 context:

- `tests/workflow-compat.test.cjs`: recursively scans workflow/command/agent Markdown for deprecated `--no-input`.
- `tests/commands-doc-parity.test.cjs`: enumerates every `commands/gsd/*.md` file and docs references.
- `tests/workflow-size-budget.test.cjs`: enumerates top-level workflows and has content-specific assertions for `discuss-phase` mode files and parent dispatch.
- `tests/workflow-guard-registration.test.cjs`: not directly about workflow slimming, but part of workflow guard safety inventory.

Parity tests that will react to manifest changes:

- `sdk/src/parity/generate-fixtures.ts`
- `sdk/src/parity/deterministic-workflows.test.ts`
- `sdk/src/parity/dynamic-branch-workflows.test.ts`
- `sdk/src/parity/hitl-workflows.test.ts`
- `sdk/src/parity/hard-outlier-posture.test.ts`
- `scripts/phase4-parity.cjs`

Other broad scanner/content tests to keep in mind when selecting pilots:

- `tests/agent-frontmatter.test.cjs`
- `tests/windows-robustness.test.cjs`
- `tests/planner-language-regression.test.cjs`
- `tests/prompt-injection-scan.test.cjs`
- Command-specific tests such as `tests/audit-fix-command.test.cjs`, `tests/secure-phase.test.cjs`, `tests/ai-evals.test.cjs`, and `tests/gsd-settings-advanced.test.cjs`

Pilot selection should avoid workflows with dedicated content assertions unless eligibility evidence is strong and the test update is explicitly part of the plan.

## Validation Architecture

Planner should require these new/changed unit tests:

- `sdk/src/compile/cli.test.ts`
  - Parses `--check-slim-eligibility <workflow-id>`.
  - Rejects missing workflow ID.
  - Usage text documents the flag.
  - Running the flag prints structured JSON and exits non-zero on fail/indeterminate.

- New `sdk/src/compile/slim-eligibility.test.ts`
  - Unknown workflow fails.
  - Seed hard outlier fails and diagnostic references posture record.
  - Missing typed transitions is indeterminate or fail per chosen policy.
  - Missing packet sequencing is indeterminate.
  - Missing provider routing evidence is indeterminate unless explicitly not required.
  - Missing parity coverage fails.
  - All gates passing yields `eligible: true`.

- New `sdk/src/compile/outlier-postures.test.ts`
  - Reads all five seed posture YAML files.
  - Rejects missing required fields.
  - Rejects `emitsPacket: true`.
  - Rejects `classifiedAs` other than `hard-outlier`.
  - Rejects posture file for non-seed command unless code set includes it.
  - Validates command ID in filename/content.

- `sdk/src/compile/classification.test.ts`
  - Seed hard outliers now require posture records.
  - `ClassificationEntry` includes posture data from YAML.
  - Non-seed hard outliers still fail.

- New launcher tests
  - Valid launcher contains only fenced `gsd-advisory` YAML.
  - Extra prose before/after block fails.
  - Wrong `workflowId` for path fails.
  - Hard outlier launcher fails.
  - Archive path missing fails only after archive-required mode is active, or is reported as indeterminate before archive.

Planner should require these integration and generated-fixture checks:

- `node bin/gsd-sdk.js compile`
- `node bin/gsd-sdk.js compile --check`
- `node bin/gsd-sdk.js compile --check-slim-eligibility <workflow-id>` for:
  - one known hard outlier
  - one unknown workflow
  - any pilot candidate before slimming
  - any pilot candidate after launcher/archive move
- `cd sdk && npm run test:unit -- src/compile/cli.test.ts src/compile/compiler.test.ts src/compile/classification.test.ts src/compile/workflow-semantics.test.ts src/compile/packet-contracts.test.ts`
- `cd sdk && npm run test:integration -- src/compile/compiler.integration.test.ts`
- `cd sdk && npm run test:unit -- src/parity/deterministic-workflows.test.ts src/parity/dynamic-branch-workflows.test.ts src/parity/hitl-workflows.test.ts src/parity/hard-outlier-posture.test.ts`
- `node scripts/phase4-parity.cjs`
- Root inventory/doc tests:
  - `node --test tests/inventory-counts.test.cjs tests/inventory-source-parity.test.cjs tests/inventory-manifest-sync.test.cjs`
  - `node --test tests/workflow-compat.test.cjs tests/commands-doc-parity.test.cjs tests/workflow-size-budget.test.cjs tests/workflow-guard-registration.test.cjs`

Planner should require Phase 4 gate changes:

- Add conditional slim step to `scripts/phase4-parity.cjs`.
- Step is a no-op when no thin launcher/archive/slim evidence exists.
- Step discovers slimmed workflow IDs from launcher metadata, not from filenames alone.
- Step calls `node bin/gsd-sdk.js compile --check-slim-eligibility <workflow-id>` for each target.
- Any failed or indeterminate verdict exits non-zero.
- The script remains hermetic and offline.

Planner should require generated-data validation:

- If generated compile/parity baselines change, the plan must include a deliberate `--write`/fixture refresh step and show why changes are expected.
- Baseline changes caused only by file hash are acceptable after a launcher move; changes that reduce semantic evidence are not acceptable unless the new structured evidence replaces it.

## Planning Guidance

Recommended plan order:

1. Add posture YAML parser and posture records for the five seed hard outliers.
2. Wire posture records into command classification and generated manifests.
3. Add slim eligibility types, evaluator, and CLI flag.
4. Add thin launcher parser/validator, but do not slim any workflow yet.
5. Extend `scripts/phase4-parity.cjs` with a conditional slim eligibility step.
6. Run eligibility over the deterministic non-outlier prefilter.
7. If no workflow passes, stop Phase 6 after machinery, posture records, and gate wiring.
8. If 3 to 5 workflows pass, perform a bounded pilot with archive plus launcher edits and rerun all gates.

Implementation boundaries:

- Do not make SDK call `scripts/phase4-parity.cjs`.
- Do not add a competing Phase 6 gate script.
- Do not make YAML posture files dynamically extend `SEED_HARD_OUTLIERS`.
- Do not weaken existing parity assertions to make slimming pass.
- Do not use archived Markdown prose as the hidden executable golden unless the plan explicitly accepts that tradeoff.
- Do not slim hard outliers.

Suggested diagnostic codes:

- `SLIM-01`: eligibility gate failed or indeterminate.
- `SLIM-02`: thin launcher schema violation or archive/launcher mismatch.
- `SLIM-03`: parity coverage missing or cleanup gate failure.
- `OUTL-01`: missing/invalid hard-outlier posture record.
- `OUTL-02`: hard outlier classification/manifest mismatch.

Suggested report fields for `--check-slim-eligibility`:

- `workflowId`
- `commandId`
- `eligible`
- `status`
- `isHardOutlier`
- `posturePath`
- `gates`
- `diagnostics`

The planner should require fail-closed behavior: any missing source, ambiguous mapping, missing gate, stale generated fixture, or hard outlier posture mismatch blocks slimming.

## Risks and Blockers

- Current workflow semantics are inferred from Markdown. Slimming without a replacement source will degrade `workflow-coverage.json`, `workflow-semantics.json`, and parity tier generation.
- Current live compile has no packet sequence inventory. Packet sequencing is not proven by existing compile output.
- Current `WorkflowRunner.packetFor()` emits generic packets. It is useful parity scaffolding but not by itself proof that original workflow sequencing is fully represented.
- Provider routing evidence may be empty for workflows with no classified `agentTypes`. The plan must define whether "no route needed" is a pass or indeterminate.
- Graphify and from-gsd2 are command-only hard outliers with `workflowId: null`; existing hard-outlier parity tests pass synthetic workflow IDs into runner dispatch. OUTL implementation should reconcile this.
- Parity tier `hard-outlier` includes non-seed fallback cases such as `/gsd-review-backlog`; do not use parity tier alone to identify seed hard outliers.
- Changing `ClassificationEntry.outlierPosture` from string to object will affect generated manifests, WorkflowRunner reason strings, parity fixtures, and tests.
- No YAML dependency exists. Adding one would expand package surface; a strict local parser is probably better for this flat schema.
- `scripts/phase4-parity.cjs` is a script with top-level execution, so unit-testing internal helper logic may require careful extraction or black-box `--step` tests.
- `node bin/gsd-sdk.js compile --check` writes `.planning/compile/compile-report.json`; plans should account for this generated planning artifact behavior during validation.
- The worktree is currently dirty with many unrelated planning/SDK changes. Phase 6 implementation plans must avoid reverting or mixing unrelated changes.

## RESEARCH COMPLETE

This research identifies the implementation surfaces, current data flow, existing gaps, pilot-selection prefilter, and validation architecture needed to plan Phase 6 without weakening Phase 1-5 guarantees.
