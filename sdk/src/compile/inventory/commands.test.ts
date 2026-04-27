import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompileDiagnostic } from '../types.js';
import { collectCommands } from './commands.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-command-inventory-'));
  await mkdir(join(projectDir, 'commands', 'gsd'), { recursive: true });
  await mkdir(join(projectDir, 'docs'), { recursive: true });
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeCommand(fileName: string, content: string): Promise<void> {
  await writeFile(join(projectDir, 'commands', 'gsd', fileName), content);
}

async function writeDocsInventory(commandIds: string[]): Promise<void> {
  const rows = commandIds.map((id) => `| \`${id}\` | fixture |`).join('\n');
  await writeFile(join(projectDir, 'docs', 'INVENTORY.md'), `# Inventory\n\n${rows}\n`);
}

async function writeManifest(commandIds: string[]): Promise<void> {
  await writeFile(
    join(projectDir, 'docs', 'INVENTORY-MANIFEST.json'),
    JSON.stringify({ families: { commands: commandIds, workflows: [] } }),
  );
}

function comp07(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  return diagnostics.filter((d) => d.code === 'COMP-07');
}

function comp08(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  return diagnostics.filter((d) => d.code === 'COMP-08');
}

describe('collectCommands', () => {
  it('extracts frontmatter fields and marks confidence as extracted', async () => {
    await writeDocsInventory(['/gsd-test-command']);
    await writeCommand(
      'test-command.md',
      `---
name: gsd:test-command
agent: gsd-planner
allowed-tools: Read Write
workflow: get-shit-done/workflows/plan-phase.md
---
`,
    );
    const diagnostics: CompileDiagnostic[] = [];

    const entries = await collectCommands(projectDir, diagnostics, new Set(['/workflows/plan-phase']));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: '/gsd-test-command',
      name: 'gsd:test-command',
      agent: 'gsd-planner',
      allowedTools: ['Read', 'Write'],
      workflowRef: '/workflows/plan-phase',
      confidence: 'extracted',
    });
    expect(entries[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derives id from the filename and marks confidence as unknown when frontmatter is absent', async () => {
    await writeDocsInventory(['/gsd-debug']);
    await writeCommand('debug.md', 'no frontmatter here\n');

    const entries = await collectCommands(projectDir, []);

    expect(entries[0].id).toBe('/gsd-debug');
    expect(entries[0].confidence).toBe('unknown');
  });

  it('records a known workflow reference as the primary association without COMP-07', async () => {
    await writeDocsInventory(['/gsd-plan-phase']);
    await writeCommand('plan-phase.md', '@~/.claude/get-shit-done/workflows/plan-phase.md\n');
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = await collectCommands(projectDir, diagnostics, new Set(['/workflows/plan-phase']));

    expect(entry.workflowRef).toBe('/workflows/plan-phase');
    expect(entry.workflowRefs).toEqual([
      {
        workflowId: '/workflows/plan-phase',
        rawRef: '@~/.claude/get-shit-done/workflows/plan-phase.md',
        source: 'body',
        primary: true,
      },
    ]);
    expect(comp07(diagnostics)).toEqual([]);
  });

  it('emits COMP-07 when a referenced workflow is not in knownWorkflowIds', async () => {
    await writeDocsInventory(['/gsd-plan-phase']);
    await writeCommand('plan-phase.md', '@~/.claude/get-shit-done/workflows/plan-phase.md\n');
    const diagnostics: CompileDiagnostic[] = [];

    await collectCommands(projectDir, diagnostics, new Set(['/workflows/other']));

    expect(comp07(diagnostics)).toEqual([
      expect.objectContaining({
        kind: 'command',
        id: '/gsd-plan-phase',
        field: 'workflowRefs',
      }),
    ]);
    expect(comp07(diagnostics)[0].hint).toContain('@~/.claude/get-shit-done/workflows/plan-phase.md');
  });

  it.each([
    ['@~/.claude/get-shit-done/workflows/plan-phase.md', '/workflows/plan-phase'],
    ['@$HOME/.claude/get-shit-done/workflows/plan-review-convergence.md', '/workflows/plan-review-convergence'],
    ['$HOME/.claude/get-shit-done/workflows/research-phase.md', '/workflows/research-phase'],
    ['~/.claude/get-shit-done/workflows/discuss-phase.md', '/workflows/discuss-phase'],
    ['@get-shit-done/workflows/add-todo.md', '/workflows/add-todo'],
    ['get-shit-done/workflows/execute-phase.md', '/workflows/execute-phase'],
  ])('normalizes representative workflow reference form %s', async (rawRef, workflowId) => {
    await writeDocsInventory(['/gsd-sample']);
    await writeCommand('sample.md', `Use ${rawRef} for this command.\n`);

    const [entry] = await collectCommands(projectDir, [], new Set([workflowId]));

    expect(entry.workflowRef).toBe(workflowId);
    expect(entry.workflowRefs[0].rawRef).toBe(rawRef);
  });

  it('ignores GSD references and templates that are not workflow references', async () => {
    await writeDocsInventory(['/gsd-debug']);
    await writeCommand(
      'debug.md',
      [
        '@~/.claude/get-shit-done/references/ui-brand.md',
        '@$HOME/.claude/get-shit-done/templates/project.md',
      ].join('\n'),
    );

    const [entry] = await collectCommands(projectDir, []);

    expect(entry.workflowRef).toBeNull();
    expect(entry.workflowRefs).toEqual([]);
  });

  it('records live discuss-phase mode routing without an ambiguity error', async () => {
    await writeDocsInventory(['/gsd-discuss-phase']);
    await writeCommand(
      'discuss-phase.md',
      `<process>
DISCUSS_MODE=$(gsd-sdk query config-get workflow.discuss_mode 2>/dev/null || echo "discuss")

If DISCUSS_MODE is "assumptions":
Read and execute ~/.claude/get-shit-done/workflows/discuss-phase-assumptions.md end-to-end.

If DISCUSS_MODE is "discuss" (or unset, or any other value):
Read and execute ~/.claude/get-shit-done/workflows/discuss-phase.md end-to-end.
</process>
`,
    );
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = await collectCommands(
      projectDir,
      diagnostics,
      new Set(['/workflows/discuss-phase', '/workflows/discuss-phase-assumptions']),
    );

    expect(entry.workflowRef).toBe('/workflows/discuss-phase');
    expect(entry.workflowRefs.map((ref) => ref.workflowId).sort()).toEqual([
      '/workflows/discuss-phase',
      '/workflows/discuss-phase-assumptions',
    ]);
    expect(entry.workflowRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: '/workflows/discuss-phase-assumptions',
          source: 'mode-routing',
          branch: expect.objectContaining({ condition: expect.stringContaining('DISCUSS_MODE is "assumptions"') }),
        }),
        expect.objectContaining({
          workflowId: '/workflows/discuss-phase',
          primary: true,
          source: 'mode-routing',
          branch: expect.objectContaining({ sourceText: expect.stringContaining('any other value') }),
        }),
      ]),
    );
    expect(comp07(diagnostics)).toEqual([]);
  });

  it('emits COMP-07 for two unconditioned workflow references', async () => {
    await writeDocsInventory(['/gsd-ambiguous']);
    await writeCommand(
      'ambiguous.md',
      [
        '@~/.claude/get-shit-done/workflows/plan-phase.md',
        '@~/.claude/get-shit-done/workflows/research-phase.md',
      ].join('\n'),
    );
    const diagnostics: CompileDiagnostic[] = [];

    await collectCommands(projectDir, diagnostics, new Set(['/workflows/plan-phase', '/workflows/research-phase']));

    expect(comp07(diagnostics)).toEqual([
      expect.objectContaining({
        id: '/gsd-ambiguous',
        field: 'workflowRefs',
        message: expect.stringContaining('ambiguous'),
        hint: expect.stringContaining('plan-phase.md'),
      }),
    ]);
    expect(comp07(diagnostics)[0].hint).toContain('research-phase.md');
  });

  it('emits COMP-07 when a workflow-backed command has no workflow reference', async () => {
    await writeDocsInventory(['/gsd-plan-phase']);
    await writeCommand('plan-phase.md', 'missing workflow reference\n');
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = await collectCommands(projectDir, diagnostics);

    expect(entry.workflowRef).toBeNull();
    expect(comp07(diagnostics)).toEqual([
      expect.objectContaining({
        id: '/gsd-plan-phase',
        field: 'workflowRefs',
        message: expect.stringContaining('missing workflow reference'),
      }),
    ]);
  });

  it('allows known command-only utilities to omit workflow references without COMP-07 or COMP-08', async () => {
    await writeDocsInventory(['/gsd-graphify']);
    await writeManifest(['/gsd-graphify']);
    await writeCommand('graphify.md', 'command-only utility\n');
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = await collectCommands(projectDir, diagnostics);

    expect(entry.workflowRef).toBeNull();
    expect(entry.workflowRefs).toEqual([]);
    expect(comp07(diagnostics)).toEqual([]);
    expect(comp08(diagnostics)).toEqual([]);
  });

  it('infers same-name workflow associations when commands omit explicit refs', async () => {
    await writeDocsInventory(['/gsd-sync-skills']);
    await writeManifest(['/gsd-sync-skills']);
    await writeCommand('sync-skills.md', 'Routes to the sync-skills workflow.\n');
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = await collectCommands(projectDir, diagnostics, new Set(['/workflows/sync-skills']));

    expect(entry.workflowRef).toBe('/workflows/sync-skills');
    expect(entry.workflowRefs).toEqual([
      {
        workflowId: '/workflows/sync-skills',
        rawRef: 'get-shit-done/workflows/sync-skills.md',
        source: 'inferred',
        primary: true,
      },
    ]);
    expect(entry.confidence).toBe('inferred');
    expect(comp07(diagnostics)).toEqual([]);
  });

  it.each(['add-backlog', 'join-discord', 'review-backlog'])(
    'allows live inline command-only command %s to omit workflow references',
    async (id) => {
      await writeDocsInventory([`/gsd-${id}`]);
      await writeManifest([`/gsd-${id}`]);
      await writeCommand(`${id}.md`, 'inline command-only workflow prose\n');
      const diagnostics: CompileDiagnostic[] = [];

      const [entry] = await collectCommands(projectDir, diagnostics, new Set());

      expect(entry.workflowRef).toBeNull();
      expect(entry.workflowRefs).toEqual([]);
      expect(comp07(diagnostics)).toEqual([]);
    },
  );

  it('emits a COMP-08 warning when a live command is absent from docs inventory', async () => {
    await writeDocsInventory([]);
    await writeManifest([]);
    await writeCommand('debug.md', 'command-only utility\n');
    const diagnostics: CompileDiagnostic[] = [];

    await collectCommands(projectDir, diagnostics);

    expect(comp08(diagnostics)).toEqual([
      expect.objectContaining({
        kind: 'command',
        id: '/gsd-debug',
        message: expect.stringContaining('missing from docs inventory'),
      }),
    ]);
  });

  it('emits a COMP-08 warning when docs inventory references a missing command', async () => {
    await writeDocsInventory(['/gsd-debug', '/gsd-stale']);
    await writeCommand('debug.md', 'command-only utility\n');
    const diagnostics: CompileDiagnostic[] = [];

    await collectCommands(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        kind: 'command',
        id: '/gsd-stale',
        message: expect.stringContaining('missing command'),
      }),
    );
  });

  it('returns POSIX relative paths and sorted entries by id', async () => {
    await writeDocsInventory(['/gsd-a', '/gsd-b']);
    await writeCommand('b.md', 'command-only utility\n');
    await writeCommand('a.md', 'command-only utility\n');

    const entries = await collectCommands(projectDir, []);

    expect(entries.map((entry) => entry.id)).toEqual(['/gsd-a', '/gsd-b']);
    for (const entry of entries) {
      expect(entry.path).not.toContain('\\');
      expect(isAbsolute(entry.path)).toBe(false);
      expect(entry.path).not.toContain(projectDir);
    }
  });
});
