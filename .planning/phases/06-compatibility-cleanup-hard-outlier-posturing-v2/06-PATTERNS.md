# Phase 6: Compatibility Cleanup + Hard Outlier Posturing (v2) — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/compile/cli.ts` | utility/CLI | request-response | `sdk/src/compile/cli.ts` (self — extend) | exact |
| `sdk/src/compile/types.ts` | model | CRUD | `sdk/src/compile/types.ts` (self — extend) | exact |
| `sdk/src/compile/classification.ts` | service | transform | `sdk/src/compile/classification.ts` (self — extend) | exact |
| `sdk/src/compile/outlier-postures.ts` | service | file-I/O + transform | `sdk/src/compile/billing-boundary.ts` | role-match |
| `sdk/src/compile/slim-eligibility.ts` | service | transform | `sdk/src/compile/packet-contracts.ts` | role-match |
| `sdk/src/compile/slim-launcher.ts` | utility | transform | `sdk/src/compile/diagnostics.ts` + `sdk/src/query/frontmatter.ts` | role-match |
| `sdk/src/advisory/outlier-postures/*.yaml` | config | file-I/O | (no prior YAML posture files — see No Analog section) | no analog |
| `sdk/src/compile/outlier-postures.test.ts` | test | CRUD | `sdk/src/compile/classification.test.ts` | exact |
| `sdk/src/compile/slim-eligibility.test.ts` | test | CRUD | `sdk/src/compile/diagnostics.test.ts` + `sdk/src/compile/workflow-semantics.test.ts` | role-match |
| `sdk/src/compile/slim-launcher.test.ts` | test | transform | `sdk/src/compile/packet-contracts.test.ts` | role-match |
| `sdk/src/compile/cli.test.ts` | test | request-response | `sdk/src/compile/cli.test.ts` (self — extend) | exact |
| `sdk/src/parity/hard-outlier-posture.test.ts` | test | CRUD | `sdk/src/parity/hard-outlier-posture.test.ts` (self — extend) | exact |
| `scripts/phase4-parity.cjs` | config/script | batch | `scripts/phase4-parity.cjs` (self — extend) | exact |
| `tests/workflow-size-budget.test.cjs` | test | file-I/O | `tests/workflow-size-budget.test.cjs` (self — extend, conditional) | exact |

---

## Pattern Assignments

### `sdk/src/compile/cli.ts` — extend: add `--check-slim-eligibility`

**Analog:** `sdk/src/compile/cli.ts` (self)

**Imports pattern** (lines 1–7):
```typescript
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
```

**ParsedCompileArgs extension pattern** (lines 9–16 — add one field):
```typescript
export interface ParsedCompileArgs {
  projectDir: string;
  json: boolean;
  check: boolean;
  write: boolean;
  checkBillingBoundary: boolean;
  checkSlimEligibility?: string;   // <-- add: workflow ID string or undefined
  help: boolean;
}
```

**parseArgs option pattern** (lines 39–48 — add one entry in `options` map):
```typescript
'check-slim-eligibility': { type: 'string' },   // positional value, no default
```

**COMPILE_USAGE addition pattern** (lines 18–34):
```
  --check-slim-eligibility <workflow-id>
                    Evaluate slim eligibility for a single workflow; prints
                    structured JSON verdict and exits non-zero on fail/indeterminate
```

**runCompileCommand dispatch pattern** (lines 61–126 — add a branch after `args.help`):
```typescript
if (args.checkSlimEligibility) {
  const { evaluateSlimEligibility } = await import('./slim-eligibility.js');
  const verdict = await evaluateSlimEligibility(args.checkSlimEligibility, report);
  console.log(JSON.stringify(verdict, null, 2));
  if (verdict.status !== 'pass') {
    process.exitCode = 1;
  }
  return;
}
```

**Error/exit pattern** (lines 107–109):
```typescript
if (errorCount > 0) {
  process.exitCode = 1;
}
```

---

### `sdk/src/compile/types.ts` — extend: new types for slim and outlier posture

**Analog:** `sdk/src/compile/types.ts` (self)

**DiagnosticKind extension pattern** (lines 12–20 — add two values):
```typescript
export type DiagnosticKind =
  | 'command'
  | 'workflow'
  | 'agent'
  | 'hook'
  | 'billing'
  | 'baseline'
  | 'extension'
  | 'packet'
  | 'state'
  | 'slim'      // <-- add
  | 'outlier';  // <-- add
```

**ClassificationEntry extension pattern** (lines 137–146 — replace `outlierPosture?: string`):
```typescript
export type OutlierPostureRecord = {
  commandId: string;
  classifiedAs: 'hard-outlier';
  migrationDisposition: string;
  rationale: string;
  emitsPacket: false;
  reviewedAt: string;
  owner: string;
  workflowId: string | null;
  posturePath: string;
};

export type ClassificationEntry = {
  commandId: string;
  category: CommandCategory;
  workflowId: string | null;
  agentTypes: string[];
  determinismPosture: 'deterministic' | 'dynamic' | 'unknown';
  migrationDisposition: string;
  isHardOutlier: boolean;
  outlierPosture?: string;             // keep for backward compat during migration
  outlierPostureRecord?: OutlierPostureRecord; // <-- add
};
```

**New slim eligibility types** (add after ClassificationEntry):
```typescript
export type SlimEligibilityGate =
  | 'typed-transitions'
  | 'packet-sequencing'
  | 'provider-routing'
  | 'parity-coverage';

export type SlimEligibilityGateResult = {
  gate: SlimEligibilityGate;
  status: 'pass' | 'fail' | 'indeterminate';
  evidence: string[];
  diagnostics: CompileDiagnostic[];
};

export type SlimEligibilityVerdict = {
  workflowId: string;
  commandId?: string;
  eligible: boolean;
  status: 'pass' | 'fail' | 'indeterminate';
  isHardOutlier: boolean;
  posturePath?: string;
  gates: SlimEligibilityGateResult[];
  diagnostics: CompileDiagnostic[];
};
```

---

### `sdk/src/compile/classification.ts` — extend: wire posture records

**Analog:** `sdk/src/compile/classification.ts` (self)

**Import addition** (lines 10–12):
```typescript
import type { ClassificationEntry, CommandCategory, CommandEntry, CompileDiagnostic, OutlierPostureRecord } from './types.js';
// Add:
import { loadOutlierPostureRecords } from './outlier-postures.js';
```

**classifyCommands signature extension** (line 179 — add optional param):
```typescript
export function classifyCommands(
  commands: CommandEntry[],
  diagnostics: CompileDiagnostic[],
  rules: Array<{ category: CommandCategory; ids: ReadonlySet<string> }> = CATEGORY_RULES,
  postureRecords?: Map<string, OutlierPostureRecord>,  // <-- add
): ClassificationEntry[]
```

**Posture wiring pattern** (lines 228–237 — replace the conditional spread):
```typescript
const postureRecord = postureRecords?.get(command.id);
if (isHardOutlier && SEED_HARD_OUTLIERS.has(command.id) && !postureRecord) {
  diagnostics.push(
    mkError('OUTL-01', 'outlier', command.id, command.path,
      `hard-outlier ${command.id} is missing a posture record`,
      { hint: 'add sdk/src/advisory/outlier-postures/<command-id>.yaml' }),
  );
}

return {
  commandId: command.id,
  category,
  workflowId: command.workflowRef ?? null,
  agentTypes: agentTypesForCommand(command),
  determinismPosture: DETERMINISM_BY_CATEGORY[category],
  migrationDisposition: MIGRATION_DISPOSITION_BY_CATEGORY[category],
  isHardOutlier,
  ...(SEED_HARD_OUTLIERS.has(command.id) ? { outlierPosture: 'seed-outlier' } : {}),
  ...(postureRecord ? { outlierPostureRecord: postureRecord } : {}),
};
```

---

### `sdk/src/compile/outlier-postures.ts` — new file

**Analog:** `sdk/src/compile/billing-boundary.ts` (compiler validator that reads external files and emits diagnostics)

**File structure pattern** (copy from `billing-boundary.ts` lines 1–10):
```typescript
/**
 * Hard-outlier posture record loader and validator for gsd-sdk compile.
 * Reads YAML posture files from sdk/src/advisory/outlier-postures/.
 * No external YAML dependency — uses a narrow flat-field parser.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mkError } from './diagnostics.js';
import type { CompileDiagnostic, OutlierPostureRecord } from './types.js';
import { SEED_HARD_OUTLIERS } from './classification.js';
```

**Flat YAML parser pattern** (model on `sdk/src/query/frontmatter.ts` `parseFrontmatterYamlLines`, lines 68–153, but strict/flat only):
```typescript
// Parse a flat key: value YAML object. No nesting, no arrays.
// Strips surrounding quotes from values. Returns Record<string, string | boolean>.
function parsePostureYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of yaml.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)/);
    if (!m) continue;
    const key = m[1];
    const raw = m[2].trim().replace(/^["']|["']$/g, '');
    if (raw === 'true') result[key] = true;
    else if (raw === 'false') result[key] = false;
    else result[key] = raw;
  }
  return result;
}
```

**Validator pattern** (model on `classification.ts` `classifyCommands` diagnostic emission):
```typescript
export function validatePostureRecord(
  raw: Record<string, unknown>,
  posturePath: string,
  diagnostics: CompileDiagnostic[],
): OutlierPostureRecord | null {
  const REQUIRED = ['commandId','classifiedAs','migrationDisposition','rationale','emitsPacket','reviewedAt','owner'];
  for (const field of REQUIRED) {
    if (raw[field] === undefined || raw[field] === '') {
      diagnostics.push(mkError('OUTL-01', 'outlier', String(raw.commandId ?? posturePath), posturePath,
        `posture record missing required field: ${field}`));
      return null;
    }
  }
  if (raw.classifiedAs !== 'hard-outlier') {
    diagnostics.push(mkError('OUTL-01', 'outlier', String(raw.commandId), posturePath,
      `classifiedAs must be 'hard-outlier', got: ${raw.classifiedAs}`));
    return null;
  }
  if (raw.emitsPacket !== false) {
    diagnostics.push(mkError('OUTL-01', 'outlier', String(raw.commandId), posturePath,
      `emitsPacket must be false for hard-outlier posture records`));
    return null;
  }
  // Non-seed posture file is an error
  const commandId = String(raw.commandId);
  if (!SEED_HARD_OUTLIERS.has(commandId)) {
    diagnostics.push(mkError('OUTL-02', 'outlier', commandId, posturePath,
      `posture file exists for non-seed hard outlier: ${commandId}`));
    return null;
  }
  return { ...raw, posturePath } as OutlierPostureRecord;
}
```

**Loader pattern** (model on `billing-boundary.ts` async collector style):
```typescript
export async function loadOutlierPostureRecords(
  sdkSrcDir: string,
  diagnostics: CompileDiagnostic[],
): Promise<Map<string, OutlierPostureRecord>> {
  const postureDir = join(sdkSrcDir, 'advisory', 'outlier-postures');
  let files: string[];
  try {
    files = (await readdir(postureDir)).filter(f => f.endsWith('.yaml'));
  } catch {
    // Directory not present yet — each seed outlier will get OUTL-01 from classifyCommands
    return new Map();
  }
  const records = new Map<string, OutlierPostureRecord>();
  for (const file of files) {
    const posturePath = join(postureDir, file);
    const content = await readFile(posturePath, 'utf-8');
    const raw = parsePostureYaml(content);
    const record = validatePostureRecord(raw, posturePath, diagnostics);
    if (record) records.set(record.commandId, record);
  }
  // Check all seed outliers have a record
  for (const id of SEED_HARD_OUTLIERS) {
    if (!records.has(id)) {
      diagnostics.push(mkError('OUTL-01', 'outlier', id,
        join(postureDir, `${id.replace('/gsd-', 'gsd-')}.yaml`),
        `seed hard outlier ${id} has no posture YAML file`));
    }
  }
  return records;
}
```

---

### `sdk/src/compile/slim-eligibility.ts` — new file

**Analog:** `sdk/src/compile/packet-contracts.ts` (compiler validator that evaluates structured data and emits diagnostics; returns a result object)

**File header pattern** (model on `packet-contracts.ts` lines 1–10):
```typescript
/**
 * Slim eligibility evaluator for gsd-sdk compile.
 * Evaluates the four SLIM-01 gates for a candidate workflow.
 * All evidence is derived from compiler-owned data — no prose parsing at evaluation time.
 */

import { mkError } from './diagnostics.js';
import type {
  CompileReport,
  CompileDiagnostic,
  SlimEligibilityGate,
  SlimEligibilityGateResult,
  SlimEligibilityVerdict,
} from './types.js';
```

**Gate evaluator pattern** (model on `packet-contracts.ts` per-packet loop):
```typescript
function evaluateGate(
  gate: SlimEligibilityGate,
  evidence: string[],
  diagnostics: CompileDiagnostic[],
): SlimEligibilityGateResult {
  if (diagnostics.some(d => d.severity === 'error')) {
    return { gate, status: 'fail', evidence, diagnostics };
  }
  if (evidence.length === 0) {
    return { gate, status: 'indeterminate', evidence, diagnostics };
  }
  return { gate, status: 'pass', evidence, diagnostics };
}
```

**Top-level evaluator pattern** (model on `classifyCommands` public API shape):
```typescript
export function evaluateSlimEligibility(
  workflowId: string,
  report: CompileReport,
): SlimEligibilityVerdict {
  const diag: CompileDiagnostic[] = [];
  // ...gate logic using report.manifests.*...
  // Hard outlier short-circuit:
  const classEntry = report.manifests.classification.find(e => e.workflowId === workflowId);
  if (classEntry?.isHardOutlier) {
    const posturePath = classEntry.outlierPostureRecord?.posturePath ?? 'sdk/src/advisory/outlier-postures/';
    diag.push(mkError('OUTL-01', 'outlier', classEntry.commandId, posturePath,
      `hard-outlier workflow ${workflowId} cannot be slimmed; see posture record`));
    return {
      workflowId, commandId: classEntry.commandId,
      eligible: false, status: 'fail', isHardOutlier: true,
      posturePath, gates: [], diagnostics: diag,
    };
  }
  // Unknown workflow short-circuit:
  const workflowEntry = report.manifests.workflows.find(w => w.id === workflowId);
  if (!workflowEntry) {
    diag.push(mkError('SLIM-01', 'slim', workflowId, workflowId,
      `workflow not found in compile manifest: ${workflowId}`));
    return { workflowId, eligible: false, status: 'fail', isHardOutlier: false, gates: [], diagnostics: diag };
  }
  // Per-gate evaluation...
  const gates: SlimEligibilityGateResult[] = [];
  // ... build each gate result using evaluateGate() ...
  const eligible = gates.every(g => g.status === 'pass');
  const status = eligible ? 'pass'
    : gates.some(g => g.status === 'fail') ? 'fail' : 'indeterminate';
  return { workflowId, commandId: classEntry?.commandId, eligible, status,
           isHardOutlier: false, gates, diagnostics: diag };
}
```

---

### `sdk/src/compile/slim-launcher.ts` — new file

**Analog:** `sdk/src/query/frontmatter.ts` (flat-field parser for structured Markdown content) + `sdk/src/compile/diagnostics.ts` (diagnostic emission pattern)

**Fenced block extraction pattern** (model on `extractFrontmatter` lines 184–191):
```typescript
// Detect whether a workflow file is a thin launcher:
// entire file is exactly one fenced ```gsd-advisory ... ``` block and nothing else.
export function extractLauncherBlock(content: string): string | null {
  const trimmed = content.trim();
  const m = trimmed.match(/^```gsd-advisory\r?\n([\s\S]+?)\r?\n```$/);
  if (!m) return null;
  // No text before or after the fence
  if (trimmed !== m[0]) return null;
  return m[1];
}
```

**Launcher schema validation pattern** (model on `validatePostureRecord` above):
```typescript
export type LauncherMetadata = {
  schemaVersion: number;
  workflowId: string;
  commandId: string;
  runner: string;
  archivePath: string;
};

export function validateLauncherMetadata(
  raw: Record<string, unknown>,
  filePath: string,
  diagnostics: CompileDiagnostic[],
): LauncherMetadata | null {
  const REQUIRED = ['schemaVersion', 'workflowId', 'commandId', 'runner', 'archivePath'];
  for (const field of REQUIRED) {
    if (!raw[field]) {
      diagnostics.push(mkError('SLIM-02', 'slim', String(raw.workflowId ?? filePath), filePath,
        `thin launcher missing required field: ${field}`));
      return null;
    }
  }
  return raw as unknown as LauncherMetadata;
}
```

**Integration with workflow inventory pattern** (model on how `workflows.ts` returns `WorkflowEntry`):
```typescript
// Call extractLauncherBlock(content) during collectWorkflows().
// If result is non-null, parse the YAML block with parsePostureYaml() (reuse from outlier-postures.ts)
// and validate with validateLauncherMetadata().
// Set a flag on WorkflowEntry (e.g. isLauncher: boolean) so the compiler can
// warn when workflow semantics degrade after a launcher move.
```

---

### `sdk/src/advisory/outlier-postures/*.yaml` — five YAML posture files

**No existing analog in the repo.** Use the schema from RESEARCH.md directly.

**Filename convention:** `gsd-graphify.yaml`, `gsd-from-gsd2.yaml`, `gsd-ultraplan-phase.yaml`, `gsd-review.yaml`, `gsd-fast.yaml`

**Required field schema** (from RESEARCH.md + D-13):
```yaml
commandId: /gsd-graphify
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: >
  <human-authored one-sentence rationale>
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: null          # or /workflows/<id> if workflow-backed
```

**Parsing note:** The parser in `outlier-postures.ts` must handle the `>` block-scalar for `rationale` as a plain string (strip the `>` and leading whitespace). The flat parser from `parseFrontmatterYamlLines` in `frontmatter.ts` (lines 68–153) does not support block scalars — use a simpler approach: if value is `>`, read the next indented line as the string value.

---

### `sdk/src/compile/outlier-postures.test.ts` — new test file

**Analog:** `sdk/src/compile/classification.test.ts` (Vitest unit tests for a compiler service; uses inline fixture factories, not real disk files)

**Test file structure pattern** (lines 1–12 of `classification.test.ts`):
```typescript
import { describe, expect, it } from 'vitest';
import { validatePostureRecord, loadOutlierPostureRecords } from './outlier-postures.js';
import { SEED_HARD_OUTLIERS } from './classification.js';
import type { CompileDiagnostic } from './types.js';
```

**Fixture factory pattern** (lines 14–24 of `classification.test.ts` — adapt for posture):
```typescript
function postureRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: '/gsd-graphify',
    classifiedAs: 'hard-outlier',
    migrationDisposition: 'manual-posture-required',
    rationale: 'Complex non-FSM graph rendering workflow',
    emitsPacket: false,
    reviewedAt: '2026-04-29',
    owner: 'jacob',
    workflowId: null,
    ...overrides,
  };
}
```

**Key test cases to cover** (per VALIDATION.md wave-0 requirements):
```typescript
it('accepts a valid posture record for a seed hard outlier')
it('rejects a record with a missing required field and emits OUTL-01')
it('rejects emitsPacket: true and emits OUTL-01')
it('rejects classifiedAs other than hard-outlier and emits OUTL-01')
it('rejects a posture file for a non-seed command and emits OUTL-02')
it('emits OUTL-01 for each seed outlier that lacks a posture file')
```

**Diagnostic assertion pattern** (lines 50–65 of `classification.test.ts`):
```typescript
expect(diagnostics).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      code: 'OUTL-01',
      kind: 'outlier',
      id: '/gsd-graphify',
      message: expect.stringContaining('missing required field'),
    }),
  ]),
);
```

---

### `sdk/src/compile/slim-eligibility.test.ts` — new test file

**Analog:** `sdk/src/compile/workflow-semantics.test.ts` and `sdk/src/compile/compiler.test.ts` (Vitest unit tests that build minimal CompileReport fixtures)

**Minimal report factory pattern** (model on `compiler.test.ts` `makeProject`):
```typescript
function makeReport(overrides: Partial<CompileReport> = {}): CompileReport {
  return {
    counts: { commands: 0, workflows: 0, agents: 0, hooks: 0 },
    manifests: {
      commands: [],
      workflows: [],
      workflowSemantics: [],
      agents: [],
      hooks: [],
      classification: [],
      billing: { entrypoints: [], violations: [], clean: true },
    },
    diagnostics: [],
    ...overrides,
  };
}
```

**Key test cases** (per VALIDATION.md 06-02-01):
```typescript
it('returns fail for an unknown workflow ID')
it('returns fail with OUTL-01 diagnostic for a seed hard-outlier workflow')
it('returns indeterminate when typed-transitions evidence is absent')
it('returns indeterminate when packet-sequencing evidence is absent')
it('returns pass when all four gates pass')
it('eligible is false for any gate with fail or indeterminate status')
```

---

### `sdk/src/compile/slim-launcher.test.ts` — new test file

**Analog:** `sdk/src/compile/packet-contracts.test.ts` (Vitest unit tests for a compile validator; uses inline content strings as fixtures)

**Inline fixture pattern** (model on `packet-contracts.test.ts`):
```typescript
const VALID_LAUNCHER = [
  '```gsd-advisory',
  'schemaVersion: 1',
  'workflowId: /workflows/add-phase',
  'commandId: /gsd-add-phase',
  'runner: sdk-advisory',
  'archivePath: docs/archive/gsd-add-phase.md',
  '```',
].join('\n');
```

**Key test cases** (per VALIDATION.md 06-03-01):
```typescript
it('accepts a valid launcher with exactly one fenced gsd-advisory block')
it('rejects a file with prose before the fenced block')
it('rejects a file with prose after the fenced block')
it('rejects a launcher with a missing required field')
it('rejects a launcher whose workflowId does not match the path stem')
it('extractLauncherBlock returns null for a full prose workflow file')
```

---

### `sdk/src/compile/cli.test.ts` — extend: add slim eligibility CLI tests

**Analog:** `sdk/src/compile/cli.test.ts` (self)

**New test case patterns** (model on existing `describe('compile CLI parsing')` block, lines 7–43):
```typescript
it('parses --check-slim-eligibility with a workflow ID', () => {
  expect(parseCompileArgs(['--check-slim-eligibility', '/workflows/add-phase']))
    .toMatchObject({ checkSlimEligibility: '/workflows/add-phase' });
});

it('rejects --check-slim-eligibility with no workflow ID in strict mode', () => {
  // parseArgs type: 'string' with no value will throw
  expect(() => parseCompileArgs(['--check-slim-eligibility'])).toThrow();
});

it('documents --check-slim-eligibility in usage text', () => {
  expect(COMPILE_USAGE).toContain('--check-slim-eligibility');
});
```

**runCompileCommand integration test pattern** (model on lines 77–93):
```typescript
it('exits non-zero and emits JSON for an unknown workflow ID', async () => {
  const projectDir = await makeMinimalProject();
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  process.exitCode = undefined;

  await runCompileCommand(['--check-slim-eligibility', '/workflows/nonexistent', '--project-dir', projectDir]);

  expect(process.exitCode).toBe(1);
  const output = JSON.parse(logSpy.mock.calls.flat().join(''));
  expect(output.status).toBe('fail');
  expect(output.eligible).toBe(false);
});
```

---

### `sdk/src/parity/hard-outlier-posture.test.ts` — extend: tighten posture record assertions

**Analog:** `sdk/src/parity/hard-outlier-posture.test.ts` (self)

**Existing EXPECTED_HARD_OUTLIERS pattern** (lines 17–23):
```typescript
const EXPECTED_HARD_OUTLIERS: Array<{ commandId: string; workflowId: string }> = [
  { commandId: '/gsd-graphify',        workflowId: '/workflows/graphify' },
  { commandId: '/gsd-from-gsd2',       workflowId: '/workflows/from-gsd2' },
  { commandId: '/gsd-ultraplan-phase', workflowId: '/workflows/ultraplan-phase' },
  { commandId: '/gsd-review',          workflowId: '/workflows/review' },
  { commandId: '/gsd-fast',            workflowId: '/workflows/fast' },
];
```

**Extension pattern — posture record from parity index** (add after existing runner dispatch loop):
```typescript
it('parity index hard-outlier entries have outlierPostureRecord populated', () => {
  const runner = createGeneratedWorkflowRunner();
  const classification: ClassificationEntry[] = JSON.parse(
    readFileSync(join(import.meta.dirname, '../generated/compile/command-classification.json'), 'utf8'),
  );
  for (const expected of EXPECTED_HARD_OUTLIERS) {
    const entry = classification.find(e => e.commandId === expected.commandId);
    expect(entry, `${expected.commandId} missing from classification`).toBeDefined();
    expect(entry?.outlierPostureRecord, `${expected.commandId} missing posture record`)
      .toMatchObject({ commandId: expected.commandId, classifiedAs: 'hard-outlier', emitsPacket: false });
  }
});
```

**Note on workflowId mismatch** (from RESEARCH.md lines 192–200): graphify and from-gsd2 have `workflowId: null` in generated classification but the test passes synthetic workflow IDs. Phase 6 OUTL implementation should add an assertion that reconciles this. The posture YAML `workflowId` field should match the generated classification value (`null` for command-only outliers).

---

### `scripts/phase4-parity.cjs` — extend: add conditional slim eligibility step

**Analog:** `scripts/phase4-parity.cjs` (self)

**`run()` helper pattern** (lines 10–18 — reuse as-is):
```javascript
function run(stepName, diagCode, bin, args, opts = {}) {
  process.stdout.write(`\n[${diagCode}] Running step: ${stepName}\n`);
  try {
    execFileSync(bin, args, { stdio: 'inherit', cwd: ROOT, ...opts });
    process.stdout.write(`[${diagCode}] PASS: ${stepName}\n`);
  } catch (err) {
    process.stderr.write(`\n[${diagCode}] FAIL: Step "${stepName}" failed — fix above errors before proceeding\n`);
    process.exit(err.status || 1);
  }
}
```

**Step entry pattern** (lines 27–39 — copy structure for the new slim step):
```javascript
{
  name: 'slim-eligibility',
  diag: 'SLIM-03',
  run: () => {
    const { readdirSync, readFileSync } = require('fs');
    process.stdout.write('\n[SLIM-03] Running step: slim-eligibility\n');

    // Detect thin launchers: top-level workflow files whose entire content
    // is a single ```gsd-advisory``` fenced block.
    const workflowsDir = join(ROOT, 'get-shit-done', 'workflows');
    let files;
    try { files = readdirSync(workflowsDir); } catch { files = []; }

    const launcherWorkflowIds = [];
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(workflowsDir, file), 'utf8');
      if (/^```gsd-advisory[\r\n][\s\S]+?[\r\n]```\s*$/m.test(content.trim()) &&
          content.trim() === content.trim().match(/^```gsd-advisory[\r\n][\s\S]+?[\r\n]```/)?.[0]) {
        // Parse workflowId from the block
        const m = content.match(/workflowId:\s*(\S+)/);
        if (m) launcherWorkflowIds.push(m[1].trim());
      }
    }

    if (launcherWorkflowIds.length === 0) {
      process.stdout.write('[SLIM-03] PASS: slim-eligibility (no thin launchers detected — no-op)\n');
      return;
    }

    for (const workflowId of launcherWorkflowIds) {
      run('slim-eligibility:' + workflowId, 'SLIM-03', node,
        [join(ROOT, 'bin', 'gsd-sdk.js'), 'compile', '--check-slim-eligibility', workflowId]);
    }
  },
},
```

**Insertion point:** After `staleness-gate` step (index 4) and before `parity-suite` step (index 5). This catches slim evidence drift before the full parity suite runs.

**`--step` flag compatibility** (lines 22–25 — no change needed): existing `stepFlag` mechanism already filters by `step.name`, so `--step slim-eligibility` works automatically.

---

## Shared Patterns

### Diagnostic construction
**Source:** `sdk/src/compile/diagnostics.ts` lines 9–30
**Apply to:** `outlier-postures.ts`, `slim-eligibility.ts`, `slim-launcher.ts`
```typescript
import { mkError, mkWarning } from './diagnostics.js';

// Error: mkError(code, kind, id, path, message, { field?, hint? })
// Warning: mkWarning(code, kind, id, path, message, { field?, hint? })
// Diagnostic code conventions for Phase 6:
//   OUTL-01 — missing/invalid hard-outlier posture record
//   OUTL-02 — posture/classification manifest mismatch
//   SLIM-01 — eligibility gate failed or indeterminate
//   SLIM-02 — thin launcher schema violation
//   SLIM-03 — parity coverage missing or cleanup gate failure
```

### Flat YAML parsing (no external dependency)
**Source:** `sdk/src/query/frontmatter.ts` `parseFrontmatterYamlLines` lines 68–153
**Apply to:** `outlier-postures.ts` (posture file parser), `slim-launcher.ts` (launcher block parser)

The existing `parseFrontmatterYamlLines` function is private and supports full nesting. For Phase 6, implement a simpler strict flat parser (key: scalar value only, no nesting, no arrays) to avoid coupling to the query module. The pattern to replicate is:
```typescript
// Strip surrounding quotes: value.replace(/^["']|["']$/g, '')
// Boolean coercion: 'true' → true, 'false' → false
// Skip blank lines and comment lines (startsWith('#'))
// Reject non-matching lines silently (no throws for unknown syntax)
```

### Vitest unit test structure
**Source:** `sdk/src/compile/classification.test.ts` lines 1–12 and `sdk/src/compile/cli.test.ts` lines 1–6
**Apply to:** all new `*.test.ts` files in `sdk/src/compile/`
```typescript
import { describe, expect, it } from 'vitest';
// afterEach with vi.restoreAllMocks() when mocking console or process.exitCode
// Inline fixture factories (not real disk reads) for unit tests
// Real temp directories (tmpdir + rm cleanup) only in integration/CLI tests
```

### Root CJS test structure (Node test runner)
**Source:** `tests/workflow-size-budget.test.cjs` lines 24–29
**Apply to:** Any new root-level `.test.cjs` tests (none planned in Phase 6, but workflow-size-budget.test.cjs may need a launcher-aware branch)
```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
```

### Generated fixture consumption
**Source:** `sdk/src/parity/deterministic-workflows.test.ts` lines 13–15 and `sdk/src/parity/hard-outlier-posture.test.ts` lines 13–15
**Apply to:** Any parity test reading generated JSON
```typescript
const parityIndex = JSON.parse(
  readFileSync(join(import.meta.dirname, '../generated/parity/parity-workflow-index.json'), 'utf8'),
);
```

### CompileReport structure consumption
**Source:** `sdk/src/compile/compiler.test.ts` lines 39–57
**Apply to:** `slim-eligibility.ts`, `slim-eligibility.test.ts`
```typescript
// Access manifests via report.manifests.classification, report.manifests.workflows,
// report.manifests.workflowSemantics, report.manifests.hooks
// Filter diagnostics by report.diagnostics.filter(d => d.severity === 'error')
```

### Compiler orchestration insertion point
**Source:** `sdk/src/compile/compiler.ts` (sequence described in RESEARCH.md lines 50–62)
**Apply to:** `outlier-postures.ts` loader call and `slim-eligibility.ts` evaluator
```
// Insert loadOutlierPostureRecords() after step 5 (classifyCommands) and
// before step 8 (validate* calls). Pass postureRecords into classifyCommands re-run
// or post-process ClassificationEntry array to attach records.
// evaluateSlimEligibility() is called only when --check-slim-eligibility is set,
// after the full CompileReport is built (runCompileCommand dispatch branch).
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `sdk/src/advisory/outlier-postures/*.yaml` | config | file-I/O | No structured YAML posture files exist anywhere in the repo; closest is `sdk/src/parity/behaviour-inventory.json` (JSON, not YAML) — use RESEARCH.md schema directly |

---

## Metadata

**Analog search scope:** `sdk/src/compile/`, `sdk/src/parity/`, `sdk/src/advisory/`, `sdk/src/query/`, `scripts/`, `tests/`
**Files scanned:** 26
**Pattern extraction date:** 2026-04-29
