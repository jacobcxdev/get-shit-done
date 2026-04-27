import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompileDiagnostic } from '../types.js';
import { collectWorkflows } from './workflows.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-workflow-inventory-'));
  await mkdir(join(projectDir, 'get-shit-done', 'workflows'), { recursive: true });
  await mkdir(join(projectDir, 'docs'), { recursive: true });
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeWorkflow(fileName: string, content: string): Promise<void> {
  await writeFile(join(projectDir, 'get-shit-done', 'workflows', fileName), content);
}

async function writeDocsInventory(workflowIds: string[]): Promise<void> {
  const rows = workflowIds.map((id) => `| \`${id}\` | fixture |`).join('\n');
  await writeFile(join(projectDir, 'docs', 'INVENTORY.md'), `# Inventory\n\n${rows}\n`);
}

async function writeManifest(workflowIds: string[]): Promise<void> {
  await writeFile(
    join(projectDir, 'docs', 'INVENTORY-MANIFEST.json'),
    JSON.stringify({ families: { workflows: workflowIds } }),
  );
}

function comp08(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  return diagnostics.filter((d) => d.code === 'COMP-08');
}

describe('collectWorkflows', () => {
  it('collects top-level markdown files and excludes subdirectory markdown files', async () => {
    await writeDocsInventory(['/workflows/top-level']);
    await writeManifest(['/workflows/top-level']);
    await writeWorkflow('top-level.md', '<step name="one"></step>\n');
    await mkdir(join(projectDir, 'get-shit-done', 'workflows', 'subdir'));
    await writeFile(join(projectDir, 'get-shit-done', 'workflows', 'subdir', 'nested.md'), '<step></step>\n');

    const entries = await collectWorkflows(projectDir, []);

    expect(entries.map((entry) => entry.id)).toEqual(['/workflows/top-level']);
  });

  it('builds WorkflowEntry ids, hashes, and inferred fields from the file stem', async () => {
    await writeDocsInventory(['/workflows/execute-plan']);
    await writeManifest(['/workflows/execute-plan']);
    await writeWorkflow(
      'execute-plan.md',
      `<step name="first"></step>
## Second Step
## Third Step
Use gsd-sdk advisory language.
`,
    );

    const [entry] = await collectWorkflows(projectDir, []);

    expect(entry).toMatchObject({
      id: '/workflows/execute-plan',
      path: 'get-shit-done/workflows/execute-plan.md',
      stepCount: { value: 2, inferred: true },
      runnerType: { value: 'standalone', inferred: true },
      determinism: { inferred: true },
      semanticFeatures: { inferred: true },
      semanticManifest: {
        workflowId: '/workflows/execute-plan',
        semantics: [],
      },
      isTopLevel: true,
    });
    expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('marks runnerType, determinism, and semantic features as inferred', async () => {
    await writeDocsInventory(['/workflows/phase']);
    await writeManifest(['/workflows/phase']);
    await writeWorkflow('phase.md', 'PhaseRunner\n');

    const [entry] = await collectWorkflows(projectDir, []);

    expect(entry.runnerType.inferred).toBe(true);
    expect(entry.determinism.inferred).toBe(true);
    expect(entry.semanticFeatures.inferred).toBe(true);
  });

  it('infers dynamic determinism from branch and polling markers', async () => {
    await writeDocsInventory(['/workflows/dynamic']);
    await writeManifest(['/workflows/dynamic']);
    await writeWorkflow('dynamic.md', 'while polling for lock files, use mode --auto branches and Task(agent)\n');

    const [entry] = await collectWorkflows(projectDir, []);

    expect(entry.determinism).toEqual({ value: 'dynamic', inferred: true });
  });

  it('detects semantic feature patterns', async () => {
    await writeDocsInventory(['/workflows/features']);
    await writeManifest(['/workflows/features']);
    await writeWorkflow(
      'features.md',
      [
        'Mode dispatch supports --auto and --reviews flags.',
        'AskUserQuestion checkpoints require human verification.',
        'Provider fallback enters reduced-confidence multi-model mode.',
        'Spawn agents with Task(gsd-executor).',
        'Write .planning/STATE.md after each transition and lock update.',
      ].join('\n'),
    );

    const [entry] = await collectWorkflows(projectDir, []);

    expect(entry.semanticFeatures.values).toEqual(
      expect.arrayContaining(['mode-dispatch', 'hitl', 'provider-fallback', 'task-spawn', 'state-write']),
    );
  });

  it('attaches structured semantic manifests to workflow entries', async () => {
    await writeDocsInventory(['/workflows/semantic']);
    await writeManifest(['/workflows/semantic']);
    await writeWorkflow('semantic.md', 'Use --auto mode, checkpoint, workflow.auto_advance, and SUMMARY evidence.\n');

    const [entry] = await collectWorkflows(projectDir, []);

    expect(entry.semanticManifest.workflowId).toBe('/workflows/semantic');
    expect(entry.semanticManifest.semantics).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'mode-dispatch' }),
      expect.objectContaining({ family: 'hitl' }),
      expect.objectContaining({ family: 'config-gate' }),
      expect.objectContaining({ family: 'completion-marker' }),
      expect.objectContaining({ family: 'evidence-requirement' }),
    ]));
  });

  it('returns POSIX relative paths', async () => {
    await writeDocsInventory(['/workflows/path-check']);
    await writeManifest(['/workflows/path-check']);
    await writeWorkflow('path-check.md', '<step></step>\n');

    const [entry] = await collectWorkflows(projectDir, []);

    expect(entry.path).not.toContain('\\');
    expect(isAbsolute(entry.path)).toBe(false);
    expect(entry.path).not.toContain(projectDir);
  });

  it('sorts entries by id ascending', async () => {
    await writeDocsInventory(['/workflows/a', '/workflows/b']);
    await writeManifest(['/workflows/a', '/workflows/b']);
    await writeWorkflow('b.md', '<step></step>\n');
    await writeWorkflow('a.md', '<step></step>\n');

    const entries = await collectWorkflows(projectDir, []);

    expect(entries.map((entry) => entry.id)).toEqual(['/workflows/a', '/workflows/b']);
  });

  it('returns an empty array for an empty workflow directory', async () => {
    await writeDocsInventory([]);
    await writeManifest([]);

    await expect(collectWorkflows(projectDir, [])).resolves.toEqual([]);
  });

  it('emits a COMP-08 warning when a live workflow is absent from docs inventory', async () => {
    await writeDocsInventory([]);
    await writeManifest([]);
    await writeWorkflow('missing-docs.md', '<step></step>\n');
    const diagnostics: CompileDiagnostic[] = [];

    await collectWorkflows(projectDir, diagnostics);

    expect(comp08(diagnostics)).toEqual([
      expect.objectContaining({
        kind: 'workflow',
        id: '/workflows/missing-docs',
        message: expect.stringContaining('missing from docs inventory'),
      }),
    ]);
  });

  it('emits a COMP-08 warning when docs inventory references a missing workflow', async () => {
    await writeDocsInventory(['/workflows/live', '/workflows/stale']);
    await writeManifest(['/workflows/live', '/workflows/stale']);
    await writeWorkflow('live.md', '<step></step>\n');
    const diagnostics: CompileDiagnostic[] = [];

    await collectWorkflows(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        kind: 'workflow',
        id: '/workflows/stale',
        message: expect.stringContaining('missing workflow'),
      }),
    );
  });
});
