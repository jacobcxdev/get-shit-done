/**
 * Unit tests for slim-launcher.ts — Wave 0 RED tests.
 * These tests fail until Task 2 creates slim-launcher.ts and wires isLauncher into WorkflowEntry.
 * Covers: extractLauncherBlock, validateLauncherMetadata, WorkflowEntry.isLauncher integration.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — module does not exist yet (Wave 0 RED)
import { extractLauncherBlock, validateLauncherMetadata } from './slim-launcher.js';
import { collectWorkflows } from './inventory/workflows.js';
import type { CompileDiagnostic } from './types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_LAUNCHER = [
  '```gsd-advisory',
  'schemaVersion: 1',
  'workflowId: /workflows/add-phase',
  'commandId: /gsd-add-phase',
  'runner: sdk-advisory',
  'archivePath: docs/archive/gsd-add-phase.md',
  '```',
].join('\n');

const VALID_LAUNCHER_RAW = {
  schemaVersion: 1,
  workflowId: '/workflows/add-phase',
  commandId: '/gsd-add-phase',
  runner: 'sdk-advisory',
  archivePath: 'docs/archive/gsd-add-phase.md',
};

const PROSE_WORKFLOW = `# Add Phase Workflow

This is a full prose workflow with multiple sections.

## Step 1: Research

Do some research.

## Step 2: Plan

Make a plan.
`;

// ─── extractLauncherBlock ─────────────────────────────────────────────────────

describe('extractLauncherBlock', () => {
  it('returns inner YAML string when file contains exactly one fenced gsd-advisory block', () => {
    const result = extractLauncherBlock(VALID_LAUNCHER);
    expect(result).toBe(
      [
        'schemaVersion: 1',
        'workflowId: /workflows/add-phase',
        'commandId: /gsd-add-phase',
        'runner: sdk-advisory',
        'archivePath: docs/archive/gsd-add-phase.md',
      ].join('\n'),
    );
  });

  it('returns null for a full prose workflow (no fenced gsd-advisory block)', () => {
    const result = extractLauncherBlock(PROSE_WORKFLOW);
    expect(result).toBeNull();
  });

  it('returns null when there is prose before the fenced block', () => {
    const content = '# Heading\n\n' + VALID_LAUNCHER;
    const result = extractLauncherBlock(content);
    expect(result).toBeNull();
  });

  it('returns null when there is prose after the fenced block', () => {
    const content = VALID_LAUNCHER + '\n\nSome trailing prose.';
    const result = extractLauncherBlock(content);
    expect(result).toBeNull();
  });

  it('returns null when fence info string is plain "yaml" not "gsd-advisory"', () => {
    const content = ['```yaml', 'schemaVersion: 1', '```'].join('\n');
    const result = extractLauncherBlock(content);
    expect(result).toBeNull();
  });

  it('returns null when fence info string is "gsd-advisory extra" (trailing text)', () => {
    const content = ['```gsd-advisory extra', 'schemaVersion: 1', '```'].join('\n');
    const result = extractLauncherBlock(content);
    expect(result).toBeNull();
  });

  it('returns null for an empty file', () => {
    const result = extractLauncherBlock('');
    expect(result).toBeNull();
  });

  it('returns null when file has two fenced gsd-advisory blocks', () => {
    const content = VALID_LAUNCHER + '\n\n' + VALID_LAUNCHER;
    const result = extractLauncherBlock(content);
    expect(result).toBeNull();
  });
});

// ─── validateLauncherMetadata ─────────────────────────────────────────────────

describe('validateLauncherMetadata', () => {
  const FILE_PATH = '/some/project/get-shit-done/workflows/add-phase.md';

  it('returns LauncherMetadata for a fully valid raw object', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const result = validateLauncherMetadata(VALID_LAUNCHER_RAW, FILE_PATH, diagnostics);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      schemaVersion: 1,
      workflowId: '/workflows/add-phase',
      commandId: '/gsd-add-phase',
      runner: 'sdk-advisory',
      archivePath: 'docs/archive/gsd-add-phase.md',
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('returns null and emits SLIM-02 when schemaVersion is missing', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const raw = { ...VALID_LAUNCHER_RAW, schemaVersion: undefined };
    const result = validateLauncherMetadata(raw, FILE_PATH, diagnostics);
    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SLIM-02', kind: 'slim' })]),
    );
  });

  it('returns null and emits SLIM-02 when workflowId is missing', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const raw = { ...VALID_LAUNCHER_RAW, workflowId: undefined };
    const result = validateLauncherMetadata(raw, FILE_PATH, diagnostics);
    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SLIM-02', kind: 'slim' })]),
    );
  });

  it('returns null and emits SLIM-02 when commandId is missing', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const raw = { ...VALID_LAUNCHER_RAW, commandId: undefined };
    const result = validateLauncherMetadata(raw, FILE_PATH, diagnostics);
    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SLIM-02', kind: 'slim' })]),
    );
  });

  it('returns null and emits SLIM-02 when archivePath is missing', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const raw = { ...VALID_LAUNCHER_RAW, archivePath: undefined };
    const result = validateLauncherMetadata(raw, FILE_PATH, diagnostics);
    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SLIM-02', kind: 'slim' })]),
    );
  });

  it('returns null and emits SLIM-02 when commandId is a seed hard-outlier (/gsd-graphify)', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const raw = { ...VALID_LAUNCHER_RAW, commandId: '/gsd-graphify' };
    const result = validateLauncherMetadata(raw, FILE_PATH, diagnostics);
    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SLIM-02', kind: 'slim' })]),
    );
  });

  it('returns null and emits SLIM-02 when workflowId does not match file path stem', () => {
    const diagnostics: CompileDiagnostic[] = [];
    // workflowId says /workflows/other but the file is add-phase.md
    const raw = { ...VALID_LAUNCHER_RAW, workflowId: '/workflows/other' };
    const result = validateLauncherMetadata(raw, FILE_PATH, diagnostics);
    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SLIM-02', kind: 'slim' })]),
    );
  });
});

// ─── isLauncher integration (via collectWorkflows) ────────────────────────────

describe('WorkflowEntry.isLauncher integration', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it('produces isLauncher:true for a workflow file containing a valid thin launcher block', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-launcher-test-'));
    const workflowsDir = join(tmpDir, 'get-shit-done', 'workflows');
    await mkdir(workflowsDir, { recursive: true });
    const launcherContent = [
      '```gsd-advisory',
      'schemaVersion: 1',
      'workflowId: /workflows/my-workflow',
      'commandId: /gsd-my-workflow',
      'runner: sdk-advisory',
      'archivePath: docs/archive/gsd-my-workflow.md',
      '```',
    ].join('\n');
    await writeFile(join(workflowsDir, 'my-workflow.md'), launcherContent, 'utf-8');

    const diagnostics: CompileDiagnostic[] = [];
    const entries = await collectWorkflows(tmpDir, diagnostics);
    const entry = entries.find((e) => e.id === '/workflows/my-workflow');
    expect(entry).toBeDefined();
    expect(entry?.isLauncher).toBe(true);
  });

  it('produces isLauncher:false for a full prose workflow file', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-launcher-test-'));
    const workflowsDir = join(tmpDir, 'get-shit-done', 'workflows');
    await mkdir(workflowsDir, { recursive: true });
    await writeFile(join(workflowsDir, 'my-workflow.md'), PROSE_WORKFLOW, 'utf-8');

    const diagnostics: CompileDiagnostic[] = [];
    const entries = await collectWorkflows(tmpDir, diagnostics);
    const entry = entries.find((e) => e.id === '/workflows/my-workflow');
    expect(entry).toBeDefined();
    expect(entry?.isLauncher).toBe(false);
  });
});
