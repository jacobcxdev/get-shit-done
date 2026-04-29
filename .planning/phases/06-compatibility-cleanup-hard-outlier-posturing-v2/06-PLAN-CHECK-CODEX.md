# Phase 6 Plan Verification — Codex Relay Report

**Verified:** 2026-04-29
**Scope:** 06-01-PLAN.md through 06-05-PLAN.md, cross-checked against 06-CONTEXT.md, 06-RESEARCH.md, 06-VALIDATION.md, 06-PATTERNS.md, REQUIREMENTS.md, and live codebase state.
**Verifier role:** Codex relay (independent analysis, no Codex MCP available in this environment — full manual verification performed)

---

## 1. Requirements Coverage

### SLIM-01 (eligibility gate)

- **06-02-PLAN.md** owns SLIM-01 end-to-end: `evaluateSlimEligibility`, `--check-slim-eligibility` CLI flag, four independent gates, fail-closed policy.
- **06-05-PLAN.md** enforces SLIM-01 at pilot execution: pre-flight re-check before any file write, BLOCKED path when no candidate passes.
- SLIM-01 is tracked in VALIDATION.md rows 06-02-01 and 06-02-02. Both rows have automated verify commands.
- **Coverage: COMPLETE**

### SLIM-02 (thin launcher schema)

- **06-03-PLAN.md** owns SLIM-02: `extractLauncherBlock`, `validateLauncherMetadata`, `WorkflowEntry.isLauncher`.
- **06-05-PLAN.md** uses the SLIM-02 surface when writing pilot launchers (gsd-advisory fenced block, no prose).
- VALIDATION.md rows 06-03-01 and 06-03-02 cover this with unit and root-artefact verify commands.
- **Coverage: COMPLETE**

### SLIM-03 (CI parity gate)

- **06-04-PLAN.md** owns SLIM-03: conditional `slim-eligibility` step added to `scripts/phase4-parity.cjs`, no-op when no launchers, fail-closed when launchers detected.
- VALIDATION.md rows 06-04-01 and 06-04-02 verify this via `node scripts/phase4-parity.cjs`.
- **Coverage: COMPLETE**

### OUTL-01 (posture record required)

- **06-01-PLAN.md** owns OUTL-01: five YAML posture files, `loadOutlierPostureRecords`, OUTL-01 diagnostic when any seed outlier lacks a YAML file.
- `classifyCommands` extended with `postureRecords` parameter; OUTL-01 emitted per missing seed.
- VALIDATION.md row 06-01-01 covers this with unit tests.
- **Coverage: COMPLETE**

### OUTL-02 (manifest mismatch)

- **06-01-PLAN.md** owns OUTL-02: `validatePostureRecord` emits OUTL-02 for any posture file whose `commandId` is not in `SEED_HARD_OUTLIERS`.
- Also tested in `outlier-postures.test.ts` via explicit non-seed rejection test.
- **Coverage: COMPLETE**

---

## 2. Decision Compliance (D-01 through D-17)

**D-01** — `gsd-sdk compile --check-slim-eligibility` is the sole eligibility authority, exits non-zero on fail/indeterminate.
- 06-02 Task 2 Step C: `if (verdict.status !== 'pass') { process.exitCode = 1; }` — COMPLIANT.

**D-02** — All four gates required; Phase 4 parity alone is not sufficient.
- 06-02 enumerates all four gates independently (`typed-transitions`, `packet-sequencing`, `provider-routing`, `parity-coverage`). No gate collapse. — COMPLIANT.

**D-03** — Eligibility must not shell out to `scripts/phase4-parity.cjs`; no circular SDK→CJS invocation.
- 06-01 STEP D explicitly states: "The compiler.ts code must NOT call node scripts/phase4-parity.cjs."
- 06-02 IMPORTANT constraints: "slim-eligibility.ts must NOT call scripts/phase4-parity.cjs."
- 06-04 CRITICAL constraint 2: direction is script → SDK only.
- 06-05 CONSTRAINTS block: "NEVER call scripts/phase4-parity.cjs from SDK code."
- **All five plans enforce this. COMPLIANT.**

**D-04** — Extend `scripts/phase4-parity.cjs` conditionally; do not add a competing gate script.
- 06-04 modifies exactly `scripts/phase4-parity.cjs` with a new conditional step; no new gate script introduced. — COMPLIANT.

**D-05** — Thin launcher keeps original workflow path.
- 06-03 and 06-05: launcher overwrites the original `.md` file at `get-shit-done/workflows/<stem>.md`. — COMPLIANT.

**D-06** — Thin launchers must contain only the `gsd-advisory` block; no workflow prose.
- 06-03 `extractLauncherBlock` requires file to be exactly one fenced block; `validateLauncherMetadata` enforces required fields.
- 06-05 Task 3 Step C: "The file must contain NOTHING else." — COMPLIANT.

**D-07** — Slimming is two-step: launcher first, then archive after eligibility is green.
- 06-05 sequences: STEP B (archive) then STEP C (write launcher), both only after a current `status:'pass'` verdict. The archive and launcher are written in a single Task 3 — two sub-steps within one gated task, not separate commits. This is compliant with the spirit of D-07 (separate steps) though both steps are atomic within the pilot task. The plan is clear that archive precedes the launcher overwrite. — COMPLIANT.

**D-08** — Archive paths use flat `docs/archive/<command-id>.md`.
- 06-05 interfaces block: "docs/archive/<commandId-without-slash>.md". Example: `/gsd-add-phase → docs/archive/gsd-add-phase.md`. — COMPLIANT.

**D-09** — Launcher syntax is a machine-parseable fenced `gsd-advisory` YAML block.
- 06-03 `extractLauncherBlock` uses the exact fence format; `validateLauncherMetadata` checks required fields. `LauncherMetadata` type is exported and schema-validated by tests. — COMPLIANT.

**D-10** — Pre-archive audit of tests that enumerate paths or counts.
- 06-CONTEXT.md and 06-RESEARCH.md identify `tests/workflow-compat.test.cjs`, `tests/commands-doc-parity.test.cjs`, `tests/workflow-size-budget.test.cjs`, `tests/workflow-guard-registration.test.cjs`.
- VALIDATION.md row 06-03-02 includes these four tests in the automated verify command.
- 06-05 Task 3 verification block and success_criteria both reference these tests.
- **However:** None of 06-01 through 06-04 explicitly state "run these tests before modifying workflow files." The audit is implicit in VALIDATION.md sampling and 06-05 verification. This is acceptable because 06-05 is the only plan that touches workflow Markdown, and it runs full gate checks before and after. Minor gap but not a blocker. — EFFECTIVELY COMPLIANT.

**D-11** — Five hard outliers remain hard outliers; not wrapped, packetised, or slimmed.
- 06-01 creates posture YAML files (documentation only). 06-02 `evaluateSlimEligibility` hard-outlier short-circuit.
- 06-03 `validateLauncherMetadata` rejects hard-outlier `commandId`.
- 06-05 CONSTRAINTS: "NEVER slim a hard-outlier workflow." — COMPLIANT.

**D-12** — `--check-slim-eligibility` must reject hard-outlier workflows with OUTL-01 referencing posture record.
- 06-02 Step B implementation sequence item 1: hard-outlier short-circuit emits `mkError('OUTL-01', 'outlier', ...)` with `posturePath`.
- 06-02 must_haves: "Hard-outlier workflows fail eligibility with OUTL-01 diagnostic referencing the posture record." — COMPLIANT.

**D-13** — Hard outlier posture records are YAML files under `sdk/src/advisory/outlier-postures/<command-id>.yaml` with required fields: `commandId`, `classifiedAs: hard-outlier`, `migrationDisposition`, `rationale`, `emitsPacket: false`, `reviewedAt`, `owner`.
- 06-01 STEP E specifies all five YAML files with all required fields explicitly spelled out.
- 06-PATTERNS.md `outlier-postures.ts` validator checks all required fields including `emitsPacket: false`. — COMPLIANT.

**D-14** — `SEED_HARD_OUTLIERS` remains canonical; YAML files must not dynamically extend it.
- 06-01 `validatePostureRecord`: "Non-seed posture file is an error" — emits OUTL-02.
- `loadOutlierPostureRecords` iterates SEED_HARD_OUTLIERS to check coverage; does not add to the set.
- Threat model T-06-01-01 explicitly mitigates this. — COMPLIANT.

**D-15** — Compiler populates `ClassificationEntry.outlierPosture` from posture YAML; fails with OUTL diagnostic when seed outlier lacks posture record.
- 06-01 adds `outlierPostureRecord?: OutlierPostureRecord` while keeping `outlierPosture?: string` for backward compat.
- OUTL-01 emitted when seed outlier has no posture record. — COMPLIANT.

**D-16** — Bounded pilot of 3–5 non-outlier workflows with strongest coverage.
- 06-05 limits pilot to 1–5 candidates from prefilter + pass-verdict set.
- Prefilter documented in 06-05 interfaces block with explicit exclusion rules. — COMPLIANT.

**D-17** — If no workflow passes eligibility, Phase 6 may still deliver machinery, CI enforcement, and outlier posture records; slimming remains blocked.
- 06-05 BLOCKED PATH is explicit: writes no workflow files, records the outcome, runs compile + parity gate to confirm all machinery is green.
- 06-05 must_haves: "If no workflow passes eligibility, Phase 6 stops here with machinery and posture complete; the pilot is recorded as BLOCKED." — COMPLIANT.

---

## 3. Critical Constraint Checks

### Fail-closed eligibility
- `evaluateSlimEligibility` returns `indeterminate` (not `pass`) when evidence arrays are empty. The `eligible` flag is derived as `gates.every(g => g.status === 'pass')` — any gate with `indeterminate` produces `eligible: false`.
- `typed-transitions` is hardcoded to `indeterminate` (comment: "Markdown-derived semantics are not durable").
- `packet-sequencing` is hardcoded to `indeterminate` (comment: "live compile has no packet sequence inventory").
- CLI exits non-zero for both `fail` and `indeterminate`.
- **PASS: Fail-closed semantics correctly enforced.**

### Hard outlier posture records
- Five YAML files authored in 06-01 STEP E with correct schema.
- OUTL-01 emitted when any seed outlier lacks a YAML file.
- OUTL-02 emitted when a YAML file exists for a non-seed command.
- `ClassificationEntry.outlierPostureRecord` populated from YAML.
- `hard-outlier-posture.test.ts` extended to assert posture record presence.
- **PASS: Hard outlier posture record machinery is complete.**

### No SDK→phase4 script invocation
- Verified in D-03 check above. All five plans include explicit prohibitions.
- 06-04 threat model T-06-04-02 explicitly mitigates "SDK calling scripts/phase4-parity.cjs."
- **PASS: Direction enforced as script → SDK only.**

### No hidden archived Markdown golden source
- 06-05 CONSTRAINTS: "NEVER make archived Markdown prose the hidden executable source of truth."
- 06-05 threat model T-06-05-02: "docs/archive/ files are write-once historical references; compiler infers semantics from launcher metadata and generated manifests, not archived prose."
- 06-RESEARCH.md: "Do not use archived Markdown prose as the primary semantic source unless the team accepts that the archive is still an executable/golden input in practice."
- **PASS: Archive treated as read-only historical reference only.**

### No hard-outlier slimming
- Enforced in three layers: `evaluateSlimEligibility` short-circuits, `validateLauncherMetadata` rejects hard-outlier `commandId`, and 06-05 CONSTRAINTS has an explicit "NEVER slim" list.
- **PASS.**

### Conditional phase4 gate (no-op without launchers)
- 06-04 step implementation: `if (launcherWorkflowIds.length === 0) { ... write no-op PASS message; return; }`.
- 06-04 must_haves: "The slim-eligibility step is a no-op (PASS) when no thin launcher files exist."
- **PASS.**

### Blocked pilot semantics if no workflow passes eligibility
- 06-05 Task 1 Step C: "If NO candidate has status:'pass': record the pilot as BLOCKED."
- 06-05 Task 3 BLOCKED PATH: no file writes, records reason in summary, runs compile + gate verification.
- RESEARCH.md note in 06-05: "it is expected that all verdicts will be INDETERMINATE or FAIL, making the pilot BLOCKED."
- **PASS.**

---

## 4. Executability Assessment

### Wave and dependency ordering
- Plan 01 (wave 1): no dependencies — foundation, correct.
- Plan 02 (wave 2): depends on 06-01 — correct; needs `OutlierPostureRecord` and `loadOutlierPostureRecords`.
- Plan 03 (wave 2): depends on 06-01 — correct; reuses `parsePostureYaml` from outlier-postures.ts.
- Plans 02 and 03 are declared parallel (disjoint file sets) — confirmed: no overlapping files.
- Plan 04 (wave 3): depends on 06-02 and 06-03 — correct; needs the CLI flag (02) and launcher detection (03).
- Plan 05 (wave 4): depends on 06-04 — correct; the full machinery must be green before pilot.

### TDD compliance
- Plans 01, 02, 03 are `type: tdd` with explicit Wave 0 (RED) tasks followed by Wave 1 (GREEN) tasks. This matches the VALIDATION.md Wave 0 requirements section.
- Plans 04 and 05 are `type: execute` — appropriate since they modify scripts/CJS and workflow files respectively.

### Verify commands
- All automated verify commands in VALIDATION.md use absolute paths consistent with the project root. No watch-mode flags detected.
- Feedback latency declared as 120 seconds — consistent with existing test suite runtimes.

### Baseline regeneration
- All three plans that could cause baseline drift (01, 02, 03) explicitly instruct: run `--write` if `--check` fails due to new fields, verify the diff contains only expected additions, then commit the baseline update as part of the task. This is correct and follows established Phase 1–5 patterns.

### CompileReport shape discrepancy
- Plans 02 and 03 use `makeReport()` factories with `workflowSemantics: []` field in `CompileManifests`. Confirmed against live `types.ts`: `CompileManifests` includes `workflowSemantics: WorkflowSemanticManifest[]`. — CONSISTENT.

### WorkflowEntry shape
- 06-03 adds `isLauncher: boolean` to `WorkflowEntry`. Live `types.ts` `WorkflowEntry` does not have this field yet — this is the additive extension plan 03 introduces. The plan correctly notes this will cause baseline drift in `workflow-coverage.json`. — EXECUTABLE.

### YAML block scalar handling
- 06-PATTERNS.md and 06-01 both specify that the flat YAML parser must handle `>` block scalars (used by `rationale` field in posture YAML files). The parser implementation in Task 2 STEP B handles this with a multi-line accumulation loop. — CORRECT.

---

## 5. Issues Found

### Issue 1 — Minor: `makeReport` factory missing `parity-workflow-index.json` path handling (06-02)

**Plan 02 Task 1** recommends that `evaluateSlimEligibility` accept an optional `parityIndexPath` parameter for testing. This is a good design. However, the `makeReport` factory in `slim-eligibility.test.ts` cannot fully exercise the `parity-coverage` gate without either (a) passing a `parityIndexPath` to a temp file, or (b) mocking `fs.readFileSync`. The plan recommends option (a) — preferred — but does not specify the exact API for writing the temp parity index in the test. This is implementation-detail ambiguity, not a correctness gap. The executor is guided well enough.

**Severity:** Low. Implementation discretion is sufficient.

### Issue 2 — Minor: `outlierPosture?: string` backward-compat field update path

**Plan 01** retains `outlierPosture?: string` on `ClassificationEntry` for backward compat per D-15. The PATTERNS.md pattern also keeps both fields. However, no plan updates `WorkflowRunner.reasonForDisposition()` (mentioned in RESEARCH.md: "If changing `outlierPosture` from string to object, update `WorkflowRunner.reasonForDisposition()` to use `rationale`"). Since `outlierPosture: 'seed-outlier'` is kept unchanged, `reasonForDisposition()` does not need updating in Phase 6 — this is consistent with D-15's intent to keep the string for backward compat. But the plan should acknowledge this deferral more explicitly to prevent a future executor from assuming it was handled.

**Severity:** Very low. The omission is safe because the string field is preserved.

### Issue 3 — Minor: workflowId lookup ambiguity in `evaluateSlimEligibility` for hard-outlier detection

**Plan 02** Step B item 1: `find ClassificationEntry whose workflowId === workflowId`. For hard outliers `/gsd-graphify` and `/gsd-from-gsd2`, the generated classification has `workflowId: null` (they are command-only outliers). If `--check-slim-eligibility /workflows/graphify` is called, the lookup `entry.workflowId === '/workflows/graphify'` will not match because `workflowId` is `null` in the classification. The hard-outlier short-circuit will be missed, and the code will fall through to the unknown-workflow short-circuit (which correctly returns `fail`, but without the `isHardOutlier:true` flag or `OUTL-01` diagnostic).

This means `--check-slim-eligibility /workflows/graphify` returns `{ status: 'fail', isHardOutlier: false }` rather than `{ status: 'fail', isHardOutlier: true }`. The outcome is still `fail` and exits non-zero, so slimming is correctly blocked. The `isHardOutlier` flag in the verdict would be incorrect, which is a metadata accuracy issue.

**Mitigation already partially present:** 06-RESEARCH.md notes that `/gsd-graphify` and `/gsd-from-gsd2` have `workflowId: null`. The posture YAML for these two commands also sets `workflowId: null`. The executor should resolve this by also checking for hard-outlier entries by commandId when the workflowId lookup fails (i.e., check if any `ClassificationEntry` has `isHardOutlier: true` and `workflowId` that matches OR that a posture record's `workflowId` matches the target).

**Severity:** Low-medium. The outcome (fail, non-zero exit) is correct. The `isHardOutlier` flag in the verdict JSON is the only inaccuracy. The plan's verification step uses `/workflows/fast` (which has `workflowId: '/workflows/fast'` in classification) so this case is not caught by the plan's own verification. Recommend the executor add a fallback lookup by iterating `outlierPostureRecord.workflowId` when the primary workflowId lookup misses.

### Issue 4 — Acceptable known gap: `typed-transitions` and `packet-sequencing` always indeterminate

Both gates are hardcoded to `indeterminate` in the current plan. This means `status` for any real workflow will be `indeterminate`, triggering the BLOCKED pilot outcome. This is the expected and correct behavior per D-17 and is explicitly documented in RESEARCH.md risks and in 06-05 Task 1 NOTE. The plan is honest about this limitation and the BLOCKED path is fully specified. — NOT AN ISSUE, EXPECTED.

---

## 6. Goal Completeness

Phase 6 goal as stated in CONTEXT.md: "deliver v2+ compatibility cleanup machinery and formalise the five hard outliers as documented, compiler-visible exceptions."

| Deliverable | Plan | Status |
|---|---|---|
| Hard-outlier posture YAML files (5) | 06-01 | Specified |
| `OutlierPostureRecord` type + loader | 06-01 | Specified |
| OUTL-01/OUTL-02 diagnostics | 06-01 | Specified |
| `ClassificationEntry.outlierPostureRecord` | 06-01 | Specified |
| `SlimEligibilityVerdict` types | 06-02 | Specified |
| `evaluateSlimEligibility` (four gates, fail-closed) | 06-02 | Specified |
| `--check-slim-eligibility` CLI flag | 06-02 | Specified |
| `extractLauncherBlock` + `validateLauncherMetadata` | 06-03 | Specified |
| `WorkflowEntry.isLauncher` | 06-03 | Specified |
| Conditional `slim-eligibility` step in phase4-parity.cjs | 06-04 | Specified |
| Pilot eligibility scan and BLOCKED/PASS outcome | 06-05 | Specified |
| Human-verify checkpoint before any file write | 06-05 | Specified |

**All Phase 6 deliverables are accounted for across the five plans.**

---

## 7. Summary

The five plans are internally consistent, correctly ordered by wave dependency, and compliant with all 17 context decisions. Requirements SLIM-01, SLIM-02, SLIM-03, OUTL-01, and OUTL-02 are fully covered. All critical constraints (fail-closed eligibility, hard-outlier posture records, no SDK→phase4 script invocation, no hidden archived Markdown golden source, no hard-outlier slimming, conditional phase4 gate, blocked pilot semantics) are enforced at multiple layers.

Three low-severity issues were identified:
1. Minor factory ambiguity for parity index in unit tests (implementation discretion sufficient).
2. `reasonForDisposition()` update is implicitly deferred (correct and safe).
3. Hard-outlier lookup by `workflowId` misses command-only outliers (`/gsd-graphify`, `/gsd-from-gsd2`) — the verdict's `isHardOutlier` flag would be `false` rather than `true`, though the outcome is still correctly `fail`. Recommend executor add a fallback posture-record lookup.

None of the issues block execution. The expected pilot outcome (BLOCKED due to `typed-transitions` and `packet-sequencing` always indeterminate) is correct, documented, and fully handled.

## VERIFICATION PASSED
