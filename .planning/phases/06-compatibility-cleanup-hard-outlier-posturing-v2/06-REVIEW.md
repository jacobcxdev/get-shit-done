---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - scripts/phase4-parity.cjs
  - sdk/package.json
  - sdk/src/advisory/outlier-postures/gsd-fast.yaml
  - sdk/src/advisory/outlier-postures/gsd-from-gsd2.yaml
  - sdk/src/advisory/outlier-postures/gsd-graphify.yaml
  - sdk/src/advisory/outlier-postures/gsd-review.yaml
  - sdk/src/advisory/outlier-postures/gsd-ultraplan-phase.yaml
  - sdk/src/compile/classification.test.ts
  - sdk/src/compile/classification.ts
  - sdk/src/compile/cli.ts
  - sdk/src/compile/compiler.ts
  - sdk/src/compile/inventory/workflows.ts
  - sdk/src/compile/outlier-postures.test.ts
  - sdk/src/compile/outlier-postures.ts
  - sdk/src/compile/slim-eligibility.test.ts
  - sdk/src/compile/slim-eligibility.ts
  - sdk/src/compile/slim-launcher.ts
  - sdk/src/compile/types.ts
  - sdk/src/generated/compile/command-classification.json
  - sdk/src/generated/compile/workflow-coverage.json
  - sdk/src/parity/hard-outlier-posture.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This phase introduces the hard-outlier posturing system: five seed hard-outlier commands each receive a YAML posture record (`gsd-*.yaml`), a new `outlier-postures.ts` loader/validator, wiring into `classifyCommands`, a `slim-eligibility.ts` four-gate evaluator, a `slim-launcher.ts` thin-launcher parser, and a parity test (`hard-outlier-posture.test.ts`). The generated baseline (`command-classification.json`) correctly reflects all five posture records.

The overall design is sound and the fail-closed posture is enforced correctly. However, five warnings and four info items require attention before shipping. The most significant are a workflowId mismatch between the parity test fixture and the canonical posture YAMLs for two command-only outliers (`/gsd-graphify`, `/gsd-from-gsd2`), an unguarded `process.argv` bounds access in the parity runner, a library function that mutates `process.exitCode` as a side-effect, and dead code in `agentTypesForCommand` that silently drops a planned distinction.

## Warnings

### WR-01: `EXPECTED_HARD_OUTLIERS` in parity test asserts non-null `workflowId` for command-only outliers

**File:** `sdk/src/parity/hard-outlier-posture.test.ts:19-20`

**Issue:** `EXPECTED_HARD_OUTLIERS` declares `/gsd-graphify` with `workflowId: '/workflows/graphify'` and `/gsd-from-gsd2` with `workflowId: '/workflows/from-gsd2'`. Both posture YAMLs record `workflowId: null`, and the generated `command-classification.json` shows `"workflowId": null` for both. The parity test dispatches the runner with these non-null IDs and asserts `result.record.workflowId` equals them — this assertion will fail (or pass vacuously against a stale runner fixture) because the canonical source of truth is `null`. The later reconciliation comment (lines 80–88) only checks `outlierPostureRecord.workflowId` in the classification baseline; the dispatch call at line 48 still passes the wrong ID to the runner.

**Fix:**
```typescript
const EXPECTED_HARD_OUTLIERS: Array<{ commandId: string; workflowId: string | null }> = [
  { commandId: '/gsd-graphify',       workflowId: null },
  { commandId: '/gsd-from-gsd2',      workflowId: null },
  { commandId: '/gsd-ultraplan-phase', workflowId: '/workflows/ultraplan-phase' },
  { commandId: '/gsd-review',          workflowId: '/workflows/review' },
  { commandId: '/gsd-fast',            workflowId: '/workflows/fast' },
];
// and in the dispatch call:
workflowId: outlier.workflowId ?? 'unknown',
// and in the assertion:
if (result.kind === 'posture') {
  expect(result.record.workflowId).toBe(outlier.workflowId);
}
```

---

### WR-02: `process.exitCode = 1` set inside library function `runCompiler`

**File:** `sdk/src/compile/compiler.ts:168`

**Issue:** `runCompiler` is exported as a library function (consumed by `cli.ts` and potentially programmatic callers). Setting `process.exitCode` is a process-global side-effect that violates the library/CLI boundary. A programmatic caller that catches errors, inspects the returned `CompileReport`, and decides not to exit will still have `process.exitCode` poisoned to `1`. The CLI layer (`cli.ts`) already inspects `errorCount` and sets `process.exitCode` itself; the in-library assignment is redundant and hazardous.

**Fix:**
```typescript
// compiler.ts — remove the process.exitCode mutation entirely:
// DELETE: if (report.diagnostics.some(...)) { process.exitCode = 1; }
return report;

// cli.ts already handles this correctly at line 127:
if (errorCount > 0) {
  process.exitCode = 1;
}
```

---

### WR-03: `process.argv[idx + 1]` unguarded when `--step` is the last argument

**File:** `scripts/phase4-parity.cjs:24`

**Issue:** When `--step` is the final element of `process.argv` (e.g. `node phase4-parity.cjs --step`), `process.argv[idx + 1]` is `undefined`. `stepFlag` becomes `undefined` (not `null`), the ternary `stepFlag ? steps.filter(...) : steps` evaluates the truthy branch (since `undefined` is falsy — this actually falls through to `steps`), and the script silently runs all steps instead of failing. More critically, if `--step` is followed by a non-step argument that `indexOf` could match, the filter produces an empty array and the script exits with the "Unknown --step" error, but `stepFlag` value is `undefined` which is printed as `"undefined"` — misleading diagnostics.

**Fix:**
```javascript
const stepFlag = (() => {
  const idx = process.argv.indexOf('--step');
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) {
    process.stderr.write('[PRTY-08] Error: --step requires a step name argument\n');
    process.exit(1);
  }
  return value;
})();
```

---

### WR-04: `validateLauncherMetadata` receives absolute `absPath` — `workflowId` check derives wrong stem on non-POSIX hosts

**File:** `sdk/src/compile/inventory/workflows.ts:200`

**Issue:** `validateLauncherMetadata(raw, absPath, diagnostics)` passes the absolute filesystem path (e.g. `/Users/jacob/.../workflows/add-phase.md`) as `filePath`. Inside `validateLauncherMetadata`, `basename(filePath, '.md')` is called to derive the expected `workflowId`. On POSIX this works. However the docstring states the path-derived check is a security mitigation (T-06-03-02) — it should use the repo-relative path for both diagnostics and the workflowId derivation, because the absolute path leaks local filesystem paths into error messages and is inconsistent with how all other diagnostics record `path`. The `toRepoRelative` call used at line 205 for the `WorkflowEntry.path` is not applied before the launcher validation call.

**Fix:**
```typescript
// inventory/workflows.ts — compute repo-relative path before validation
const repoRelPath = toRepoRelative(projectDir, absPath);
if (isLauncher) {
  const raw = parsePostureYaml(launcherBlock);
  validateLauncherMetadata(raw, repoRelPath, diagnostics);  // pass repo-relative, not absPath
}
```

---

### WR-05: `slim-eligibility.ts` casts `JSON.parse` result without array validation — non-array content is treated as valid

**File:** `sdk/src/compile/slim-eligibility.ts:205`

**Issue:** `parityEntries = JSON.parse(raw) as ParityWorkflowEntry[]` uses a type assertion without checking that the parsed value is actually an array. If `parity-workflow-index.json` contains a valid JSON object or `null`, the cast succeeds silently, `parityEntries.find(...)` throws a TypeError (`parityEntries.find is not a function`), the catch block was already exited, and the exception bubbles uncaught. The file is fail-closed on a read error but not on a parse-type error.

**Fix:**
```typescript
try {
  const raw = readFileSync(resolvedParityPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('parity index must be a JSON array');
  parityEntries = parsed as ParityWorkflowEntry[];
} catch {
  parityReadError = true;
}
```

---

## Info

### IN-01: `agentTypesForCommand` both branches return identical value — dead code

**File:** `sdk/src/compile/classification.ts:173-177`

**Issue:** Both arms of the ternary return `[command.agent]`, making `isAuditedDiskWriteAgent` a computed-but-unused boolean. This is dead code that appears to be an incomplete implementation: the intent was presumably to return different agent-type annotations for disk-write-mandate agents.

```typescript
function agentTypesForCommand(command: CommandEntry): string[] {
  if (!command.agent) return [];
  const isAuditedDiskWriteAgent = DISK_WRITE_MANDATE_AGENTS.has(command.agent);
  return isAuditedDiskWriteAgent ? [command.agent] : [command.agent];  // both arms identical
}
```

**Fix:** Either implement the intended distinction (e.g. tagging with a suffix like `${command.agent}:disk-write-mandate`) or collapse to a single return and remove the unused variable.

---

### IN-02: `validateLauncherMetadata` converts `schemaVersion` via `Number()` without NaN check

**File:** `sdk/src/compile/slim-launcher.ts:118`

**Issue:** `schemaVersion: Number(raw['schemaVersion'])` will produce `NaN` if the YAML field is a non-numeric string (e.g. `schemaVersion: v1`). The required-field check at line 68–83 only guards against `undefined`, `null`, and `''`, not non-numeric strings. `NaN` is silently stored in `LauncherMetadata.schemaVersion` and propagates to callers.

**Fix:**
```typescript
const sv = Number(raw['schemaVersion']);
if (Number.isNaN(sv) || !Number.isFinite(sv) || sv <= 0) {
  diagnostics.push(mkError('SLIM-02', 'slim', idForDiag, filePath,
    `launcher schemaVersion must be a positive number, got: ${raw['schemaVersion']}`,
    { field: 'schemaVersion' }));
  return null;
}
// then:
schemaVersion: sv,
```

---

### IN-03: Misleading test title in `outlier-postures.test.ts`

**File:** `sdk/src/compile/outlier-postures.test.ts:195`

**Issue:** The test is titled `'returns empty Map when posture directory is absent (no OUTL-01 from loader for missing dir)'` but the body immediately asserts `expect(outl01Diags.length).toBe(5)` — i.e. the loader *does* emit 5 OUTL-01 diagnostics. The parenthetical in the title directly contradicts the assertion. The inline comments also acknowledge this. This creates confusion about the contract: does the loader emit OUTL-01 on missing directory or not?

**Fix:** Update the test title to accurately reflect the implementation:
```typescript
it('emits 5 OUTL-01 diagnostics and returns empty Map when posture directory is absent', async () => {
```

---

### IN-04: `slim-launcher.ts` re-exports `parsePostureYaml` from `outlier-postures.ts` — unnecessary coupling

**File:** `sdk/src/compile/slim-launcher.ts:126`

**Issue:** `export { parsePostureYaml }` re-exports the function from `outlier-postures.ts` through the slim-launcher module. The only known consumer (`inventory/workflows.ts`) already imports `parsePostureYaml` directly from `outlier-postures.ts` (line 14 of `inventory/workflows.ts` imports from `slim-launcher.ts` which then re-exports it). This creates a transitive import chain (`workflows → slim-launcher → outlier-postures → classification`) that increases coupling without benefit. The re-export is also not documented in the module header and may confuse future readers about which module owns the YAML parser.

**Fix:** Remove the re-export from `slim-launcher.ts` and have consumers import `parsePostureYaml` directly from `outlier-postures.ts`.

---

_Reviewed: 2026-04-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
