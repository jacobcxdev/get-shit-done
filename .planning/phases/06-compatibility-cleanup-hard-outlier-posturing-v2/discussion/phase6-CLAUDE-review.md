# Phase 6 Claude Cross-Review

## Summary of First-Pass Positions

| Gray Area | Claude | Codex | Gemini |
|---|---|---|---|
| Posture record storage | YAML files under `sdk/src/advisory/outlier-postures/` | Fields list only (no location stated) | TypeScript data in `sdk/src/generated/compile/outliers.ts` + generated `docs/ARCHITECTURE-OUTLIERS.md` |
| Slim transition sequencing | Strict two-step: launcher commit then archive commit (separate commits) | Atomic per-workflow pass/fail; no commit sequencing stated | Atomic file I/O: move original + write thin proxy simultaneously |
| Eligibility/parity gate mechanics | New flag `--check-slim-eligibility` post-processing compiler output; extend `phase4-parity.cjs` conditionally | Same flag as gate authority; extend `phase4-parity.cjs` with CI | Flag delegates entirely to Phase 4 parity logic (shared library or CJS invocation); `--ci-enforce-slim` on parity script |
| Hard outliers ever slimmed | Not addressed explicitly (posture records document them; no slimming implied) | No — documented/classified only, not migrated | Raised as open question; implied no (bypass FSM lifecycle) |

---

## Position-by-Position Review

### 1. Posture Record Storage

**Claude (YAML under advisory)** vs. **Gemini (TypeScript generated data)**

Claude's YAML-under-advisory approach is endorsed over Gemini's TypeScript-generated approach for the following reasons:

- The compiler already has a `ClassificationEntry.outlierPosture?: string` field and a `SEED_HARD_OUTLIERS` constant in `classification.ts`. The natural extension is to populate that field from a discoverable artifact, not to introduce a new generated file layer.
- Gemini's `sdk/src/generated/` path implies build-time generation, which creates a chicken-and-egg problem: the posture data must exist for `compile` to classify correctly, but `compile` would also be responsible for generating the documentation. A YAML source file read directly during `classifyCommands()` is simpler and has no generation dependency.
- Human-authored rationale (particularly for `/gsd-ultraplan-phase` and `/gsd-from-gsd2` where the rationale requires editorial judgment) belongs in a diffable source file, not in a TypeScript constant that is harder to review in isolation.
- Codex does not specify a storage location but lists required fields (commandId, classification, rationale, migration status, owner, evidence, review date). These fields are compatible with YAML frontmatter and should be incorporated into the YAML schema.

**Revised decision:** YAML files at `sdk/src/advisory/outlier-postures/<command-id>.yaml`. Required fields: `commandId`, `classifiedAs: hard-outlier`, `migrationDisposition`, `rationale`, `emitsPacket: false`, `reviewedAt`, and `owner`. The compiler globs these during `classifyCommands()` and populates `ClassificationEntry.outlierPosture`. Gemini's documentation output is accepted as an additive output: `compile --json` can include posture data in the manifest, and a separate `docs/ARCHITECTURE-OUTLIERS.md` can be generated from that output as a CI artifact — but the TypeScript generated file is not the source of truth.

**Tag: [majority: Claude+Codex fields, Claude storage location]**

---

### 2. Slim Transition Sequencing

**Claude (separate commits, two-step)** vs. **Gemini (atomic file I/O, single operation)**

Claude's two-step commit sequencing is endorsed. Gemini's "atomic file I/O" addresses the wrong level of atomicity — it conflates filesystem atomicity (correct: the launcher must exist before the original is removed from the working directory) with commit atomicity (incorrect: bundling both into one commit eliminates the intermediate checkable state).

Key considerations:
- CI runs on commits. If step 1 (launcher reduction) and step 2 (archive move) are in a single commit, a CI failure has no recoverable intermediate state in the git history. Separate commits means the parity gate can confirm the launcher-only state is valid before the archive commit is accepted.
- Gemini's concern about Git staging conflicts is real but is a tooling concern, not a reason to collapse the two logical steps. The plan should specify that the launcher file must be written and committed before the `git mv` to `docs/archive/` is staged.
- Codex says "atomic per-workflow pass/fail" — this is about eligibility granularity (each workflow is independently eligible), not commit sequencing. This position is compatible with Claude's two-step sequencing.

**Revised decision:** Two-step sequencing stands. Step 1 commit: launcher-only Markdown written (SLIM-02 posture). Step 2 commit: original moved to `docs/archive/` (SLIM-01 posture). The filesystem move in step 2 must be a `git mv` so history is preserved. Each step has its own plan entry under `.planning/phases/06-.../`. Eligibility JSON precondition artifact (`.planning/compile/slim-eligibility-<workflow-id>.json`) must be present and green before step 1 is committed.

**Tag: [majority: Claude+Codex direction, Gemini filesystem concern noted as tooling guidance]**

---

### 3. Eligibility/Parity Gate Mechanics

All three models agree on the core: `gsd-sdk compile --check-slim-eligibility <workflow-id>` is the eligibility authority, and the Phase 4 parity gate (`phase4-parity.cjs`) must not be bypassed. The disagreement is on how to wire them together.

- **Claude:** Extend `phase4-parity.cjs` with a conditional step that globs eligibility JSON files and runs `--check-slim-eligibility` for each.
- **Codex:** Same direction — add to `phase4-parity.cjs`; CI fails on non-zero result.
- **Gemini:** Introduce `--ci-enforce-slim` flag on the parity script, which scans for thin launchers and asserts their FSM states pass parity gates. The eligibility check should share logic with Phase 4 parity (shared library or CJS invocation).

Gemini raises a valid structural concern: if `--check-slim-eligibility` reimplements parity logic independently, it will drift from `phase4-parity.cjs`. The solution is not to make the eligibility flag call the CJS script (fragile, circular), but to ensure the eligibility flag's four criteria (typed transitions, packet sequencing, provider routing, parity coverage) are derived from the same compiler outputs that the parity script validates — not from a separate validation pass.

Gemini's `--ci-enforce-slim` concept (scan thin launchers, assert parity) is architecturally sound but is better implemented as Claude's conditional step within `phase4-parity.cjs` rather than a new flag, keeping the single-gate model intact.

**Revised decision:** Extend `phase4-parity.cjs` with a new conditional step (no new flag needed) that: (a) globs `.planning/compile/slim-eligibility-*.json`, (b) for each, runs `gsd-sdk compile --check-slim-eligibility <workflow-id>`, (c) fails CI on any non-zero result. The eligibility flag itself reuses `runCompiler()` output and applies per-workflow filtering — it does not re-invoke the parity CJS script. This preserves the single-gate model and avoids circular invocation. The step is a no-op when no eligibility JSON files exist, preserving Phase 1–5 guarantees.

**Tag: [consensus on gate being in phase4-parity.cjs; majority Claude+Codex on no new flag; Gemini's shared-logic concern addressed architecturally]**

---

### 4. Hard Outliers: Should They Ever Be Slimmed?

Claude did not address this explicitly. Codex is unambiguous: Phase 6 documents and classifies them, does not migrate them. Gemini raised it as an open question but the framing implies no (they "bypass the standard FSM lifecycle").

**Decision:** Hard outliers must not be slimmed in Phase 6 or any future phase without an explicit reclassification plan. The `migrationDisposition` field in the posture YAML captures whether slimming is a future possibility (`possible-future-migration`) or permanently excluded (`permanent-exclusion`). The compiler must reject any attempt to apply `--check-slim-eligibility` to a workflow classified as `hard-outlier`, emitting a diagnostic that references the posture file.

**Tag: [consensus]**

---

## Additional Questions Raised Across All Three Models

The following novel questions were raised and are within Phase 6 scope:

**Q1 (Claude): Pilot set vs. all 84 workflows in Phase 6 v2+**
Recommend: a bounded pilot set of 3–5 workflows with the most complete semantic manifests. This is a planning constraint, not a gray area — the plan should state the pilot set explicitly rather than leaving scope open.

**Q2 (Codex): Required posture record fields**
Resolved above: `commandId`, `classifiedAs`, `migrationDisposition`, `rationale`, `emitsPacket`, `reviewedAt`, `owner`. This should be enforced by a schema check in the compiler (e.g., using a Zod schema or a hand-written field validator in `classifyCommands()`).

**Q3 (Codex): Archive path convention — preserve relative paths vs. flat naming**
Decision: Flat naming under `docs/archive/<command-id>.md` is preferred. Preserving relative paths (`docs/archive/get-shit-done/workflows/foo.md`) adds directory nesting with no indexability benefit, and `command-id` is already the canonical identifier used by the compiler and posture records.

**Tag: [majority: Claude+Codex; Gemini path concern acknowledged]**

**Q4 (Codex): Slim eligibility in CI — all workflows vs. only touched workflows**
Decision: Only workflows with a corresponding `.planning/compile/slim-eligibility-*.json` file are checked. This is the conditional-step design already endorsed above.

**Q5 (Gemini): Launcher advisory invocation syntax**
This must be resolved before any launcher is written. Recommend: a fenced code block tagged ` ```gsd-advisory ``` ` containing a YAML payload with `commandId`, `invokePhase`, and `sdkVersion`. This is machine-parseable and visually distinct from prose. The plan must define this schema and include a test that rejects launchers without a valid advisory block.

**Q6 (Gemini): Rollback mechanism for slimmed workflows**
The two-step commit sequencing already provides rollback via `git revert` of the step-2 commit (archive move), which restores the original file. `gsd-sdk undo` should reference the step-2 commit SHA stored in the step-2 plan manifest. No additional rollback command is required beyond what git provides.

**Q7 (Claude): `docs/archive/` and existing test inventory**
Must audit before any archive commit: `tests/workflow-compat.test.cjs`, `tests/commands-doc-parity.test.cjs`, `tests/workflow-size-budget.test.cjs`, `tests/workflow-guard-registration.test.cjs`. Each archive plan must include a sub-task updating affected tests. This is a sequencing hard requirement.

**Q8 (Claude): Seed set vs. YAML as authoritative source for hard outlier set**
Decision: `SEED_HARD_OUTLIERS` in `classification.ts` remains the canonical hard-coded compile-time set. The YAML posture files are required for any entry in `SEED_HARD_OUTLIERS` but do not dynamically extend the set. Adding a new hard outlier requires both a code change to `classification.ts` and a new posture YAML file. This keeps the compiler's behaviour auditable without requiring a filesystem glob to determine which workflows are hard outliers at startup.

**Tag: [consensus]**

---

## Three-Way Splits Requiring User Escalation

**None.** All four primary gray areas reached majority or consensus positions after cross-review. No three-way split was observed.

---

## Final Recommended Decisions for CONTEXT.md

| Decision | Tag |
|---|---|
| Posture records: YAML at `sdk/src/advisory/outlier-postures/<command-id>.yaml`; fields: commandId, classifiedAs, migrationDisposition, rationale, emitsPacket, reviewedAt, owner | [majority: Claude+Codex] |
| Slim transition: two-step separate commits — step 1 launcher-only, step 2 `git mv` to `docs/archive/`; eligibility JSON precondition required | [majority: Claude+Codex; Gemini filesystem concern as tooling note] |
| Eligibility gate: `--check-slim-eligibility` flag on `compile`, extended conditionally into `phase4-parity.cjs`; no separate gate script; no circular CJS invocation | [consensus direction; majority Claude+Codex on implementation] |
| Hard outliers: never slimmed; `--check-slim-eligibility` rejects hard-outlier workflows with a diagnostic; `migrationDisposition` field captures future possibility | [consensus] |
| `SEED_HARD_OUTLIERS` remains canonical; YAML posture files required but do not extend the set dynamically | [consensus] |
| Archive path: flat `docs/archive/<command-id>.md` | [majority: Claude+Codex] |
| Launcher syntax: ` ```gsd-advisory ``` ` fenced YAML block; machine-parseable; schema-validated in tests | [majority: Claude+Gemini structure; Codex compatibility] |
| Phase 6 v2+ pilot set: 3–5 workflows, not all 84 | [majority: Claude+Codex scope discipline] |
| Test inventory audit required before any archive commit | [consensus] |
