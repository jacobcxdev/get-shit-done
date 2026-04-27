/**
 * Unit tests for corpus validators.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandEntry, CompileDiagnostic, WorkflowEntry } from './types.js';
import {
  validateDuplicateIds,
  validateExtensionDeps,
  validateGeneratedArtifactDeclarations,
  validateGeneratedArtifacts,
  validatePacketBudgets,
  validateStateReferences,
  validateTransformOrdering,
} from './validators.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-validators-'));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

function command(id: string, path = `commands/gsd/${id.replace('/gsd-', '')}.md`): CommandEntry {
  return {
    id,
    path,
    hash: '0'.repeat(64),
    workflowRef: null,
    workflowRefs: [],
    confidence: 'extracted',
  };
}

function workflow(id: string, path = `get-shit-done/workflows/${id.replace('/workflows/', '')}.md`): WorkflowEntry {
  return {
    id,
    path,
    hash: '1'.repeat(64),
    stepCount: { value: 1, inferred: true },
    runnerType: { value: 'fixture', inferred: true },
    determinism: { value: 'deterministic', inferred: true },
    semanticFeatures: { values: [], inferred: true },
    semanticManifest: { workflowId: id, semantics: [] },
    isTopLevel: true,
  };
}

describe('validateDuplicateIds', () => {
  it('emits no diagnostics for unique IDs', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateDuplicateIds([command('/gsd-one'), command('/gsd-two')], diagnostics, [
      workflow('/workflows/one'),
      workflow('/workflows/two'),
    ]);

    expect(diagnostics).toEqual([]);
  });

  it('emits COMP-05 for duplicate command IDs and names both paths', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateDuplicateIds(
      [command('/gsd-dupe', 'commands/gsd/a.md'), command('/gsd-dupe', 'commands/gsd/b.md')],
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-05',
        kind: 'command',
        id: '/gsd-dupe',
        path: 'commands/gsd/a.md',
        message: expect.stringContaining('commands/gsd/a.md, commands/gsd/b.md'),
      }),
    ]);
  });

  it('emits COMP-05 for duplicate workflow IDs and names both paths', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateDuplicateIds([], diagnostics, [
      workflow('/workflows/dupe', 'get-shit-done/workflows/a.md'),
      workflow('/workflows/dupe', 'get-shit-done/workflows/b.md'),
    ]);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-05',
        kind: 'workflow',
        id: '/workflows/dupe',
        message: expect.stringContaining('get-shit-done/workflows/a.md, get-shit-done/workflows/b.md'),
      }),
    ]);
  });

  it('emits COMP-05 for duplicate packet IDs and names both paths', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateDuplicateIds([], diagnostics, [], [
      { id: 'packet-a', path: 'sdk/src/generated/compile/a.json' },
      { id: 'packet-a', path: 'sdk/src/generated/compile/b.json' },
    ]);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-05',
        kind: 'packet',
        id: 'packet-a',
        message: expect.stringContaining('sdk/src/generated/compile/a.json, sdk/src/generated/compile/b.json'),
      }),
    ]);
  });

  it('emits COMP-05 for duplicate extension IDs and names both paths', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateDuplicateIds([], diagnostics, [], [], [
      { id: 'extension-a', path: 'extensions/a.json' },
      { id: 'extension-a', path: 'extensions/b.json' },
    ]);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-05',
        kind: 'extension',
        id: 'extension-a',
        message: expect.stringContaining('extensions/a.json, extensions/b.json'),
      }),
    ]);
  });
});

describe('validatePacketBudgets', () => {
  it('reports zero checked for empty packet declarations', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(validatePacketBudgets([], diagnostics)).toEqual({ count: 0 });
    expect(diagnostics).toEqual([]);
  });

  it('emits COMP-06 when a packet exceeds its action budget', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(
      validatePacketBudgets(
        [{ workflowId: '/workflows/plan-phase', stepId: 'plan', actionCount: 4, budget: 3 }],
        diagnostics,
      ),
    ).toEqual({ count: 1 });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-06',
        kind: 'packet',
        id: '/workflows/plan-phase',
        path: '/workflows/plan-phase#plan',
        message: expect.stringContaining('4 actions > budget 3'),
      }),
    ]);
  });
});

describe('validateExtensionDeps', () => {
  it('reports zero checked for empty extension declarations', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(validateExtensionDeps([], diagnostics)).toEqual({ count: 0 });
    expect(diagnostics).toEqual([]);
  });

  it('emits COMP-09 with the cycle chain for cyclic dependencies', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(
      validateExtensionDeps(
        [
          { id: 'extension-a', dependsOn: ['extension-b'] },
          { id: 'extension-b', dependsOn: ['extension-a'] },
        ],
        diagnostics,
      ),
    ).toEqual({ count: 2 });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-09',
        kind: 'extension',
        message: expect.stringContaining('extension-a -> extension-b -> extension-a'),
      }),
    ]);
  });
});

describe('validateGeneratedArtifacts', () => {
  it('emits COMP-10 in check mode for a missing baseline file', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateGeneratedArtifacts(projectDir, 'sdk/src/generated/compile', ['command-coverage'], true, diagnostics);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        kind: 'baseline',
        id: 'command-coverage',
        path: 'sdk/src/generated/compile/command-coverage.json',
        message: expect.stringContaining('command-coverage.json'),
      }),
    ]);
  });

  it('normalizes absolute generatedDir diagnostic paths to repo-relative POSIX paths', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const absGeneratedDir = join(projectDir, 'sdk', 'src', 'generated', 'compile');

    validateGeneratedArtifacts(projectDir, absGeneratedDir, ['workflow-coverage'], true, diagnostics);

    expect(diagnostics[0]).toMatchObject({
      code: 'COMP-10',
      path: 'sdk/src/generated/compile/workflow-coverage.json',
    });
  });

  it('emits no COMP-10 errors in check mode when all requested baselines exist', async () => {
    const diagnostics: CompileDiagnostic[] = [];
    const generatedDir = join(projectDir, 'sdk', 'src', 'generated', 'compile');
    await mkdir(generatedDir, { recursive: true });
    await writeFile(join(generatedDir, 'agent-contracts.json'), '{}\n');

    validateGeneratedArtifacts(projectDir, generatedDir, ['agent-contracts'], true, diagnostics);

    expect(diagnostics).toEqual([]);
  });

  it('does not emit missing-baseline errors outside check mode', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateGeneratedArtifacts(projectDir, 'sdk/src/generated/compile', ['hook-install'], false, diagnostics);

    expect(diagnostics).toEqual([]);
  });
});

describe('validateTransformOrdering', () => {
  it('emits COMP-10 for duplicate transform order numbers', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateTransformOrdering(
      [
        { id: 'a', path: 'transforms/a.json', transformOrder: 1 },
        { id: 'b', path: 'transforms/b.json', transformOrder: 1 },
      ],
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        kind: 'baseline',
        id: 'b',
        field: 'transformOrder',
        message: expect.stringContaining('duplicate transform order 1'),
      }),
    ]);
  });

  it('emits COMP-10 for unknown before and after targets', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateTransformOrdering(
      [{ id: 'a', path: 'transforms/a.json', transformOrder: 1, before: ['missing-before'], after: ['missing-after'] }],
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        field: 'before',
        message: expect.stringContaining('missing-before'),
      }),
      expect.objectContaining({
        code: 'COMP-10',
        field: 'after',
        message: expect.stringContaining('missing-after'),
      }),
    ]);
  });

  it('emits COMP-10 for transform ordering cycles', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateTransformOrdering(
      [
        { id: 'a', path: 'transforms/a.json', transformOrder: 1, before: ['b'] },
        { id: 'b', path: 'transforms/b.json', transformOrder: 2, before: ['a'] },
      ],
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        field: 'transformOrder',
        message: expect.stringContaining('a -> b -> a'),
      }),
    ]);
  });
});

describe('validateStateReferences', () => {
  it('emits COMP-10 for unknown state references', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(
      validateStateReferences(
        [{ workflowId: '/workflows/execute-phase', stepId: 'dispatch', stateId: 'missing-state', path: 'workflow.md' }],
        new Set(['ready']),
        diagnostics,
      ),
    ).toEqual({ count: 1 });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        kind: 'state',
        id: 'missing-state',
        message: expect.stringContaining('execute-phase#dispatch'),
      }),
    ]);
  });
});

describe('validateGeneratedArtifactDeclarations', () => {
  it('emits COMP-10 when idempotency metadata is missing', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateGeneratedArtifactDeclarations(
      [{ id: 'command-coverage', path: 'sdk/src/generated/compile/command-coverage.json', atomicWrite: true }],
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        field: 'idempotent',
        message: expect.stringContaining('missing idempotency metadata'),
      }),
    ]);
  });

  it('emits COMP-10 when atomic-write declaration is missing', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateGeneratedArtifactDeclarations(
      [{ id: 'workflow-coverage', path: 'sdk/src/generated/compile/workflow-coverage.json', idempotent: true }],
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'COMP-10',
        field: 'atomicWrite',
        message: expect.stringContaining('missing atomic-write declaration'),
      }),
    ]);
  });
});
