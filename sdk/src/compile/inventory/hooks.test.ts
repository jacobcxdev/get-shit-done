import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompileDiagnostic, HookEntry } from '../types.js';
import { collectHooks, extractManagedHooks } from './hooks.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-hook-inventory-'));
  await mkdir(join(projectDir, 'hooks'), { recursive: true });
  await mkdir(join(projectDir, 'docs'), { recursive: true });
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeHook(fileName: string, content = '// hook\n'): Promise<void> {
  await writeFile(join(projectDir, 'hooks', fileName), content);
}

async function writeDistHook(fileName: string, content = '// dist hook\n'): Promise<void> {
  await mkdir(join(projectDir, 'hooks', 'dist'), { recursive: true });
  await writeFile(join(projectDir, 'hooks', 'dist', fileName), content);
}

async function writeManagedHooks(fileNames: string[]): Promise<void> {
  await writeHook(
    'gsd-check-update-worker.js',
    [
      'const MANAGED_HOOKS = [',
      ...fileNames.map((fileName) => `  '${fileName}',`),
      '];',
      '',
    ].join('\n'),
  );
}

async function writeHookDocs(fileNames: string[]): Promise<void> {
  const rows = fileNames.map((fileName) => `| \`${fileName}\` | Fixture | Hook fixture |`);
  await writeFile(
    join(projectDir, 'docs', 'INVENTORY.md'),
    ['# Inventory', '', '## Hooks', '', '| Hook | Event | Purpose |', '|------|-------|---------|', ...rows, ''].join(
      '\n',
    ),
  );
}

function comp04(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  return diagnostics.filter((d) => d.code === 'COMP-04');
}

function comp08(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  return diagnostics.filter((d) => d.code === 'COMP-08');
}

function byId(entries: HookEntry[], id: string): HookEntry {
  const entry = entries.find((hook) => hook.id === id);
  if (!entry) throw new Error(`missing hook ${id}`);
  return entry;
}

describe('extractManagedHooks', () => {
  it('parses MANAGED_HOOKS without requiring the worker file', async () => {
    await writeManagedHooks(['gsd-check-update.js', 'gsd-session-state.sh']);

    await expect(extractManagedHooks(projectDir)).resolves.toEqual([
      'gsd-check-update.js',
      'gsd-session-state.sh',
    ]);
  });
});

describe('collectHooks', () => {
  it('classifies JavaScript and shell hook kind and executability', async () => {
    await writeHook('gsd-context-monitor.js');
    await writeHook('gsd-session-state.sh', '#!/usr/bin/env bash\n');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-context-monitor.js', 'gsd-session-state.sh']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-context-monitor.js', 'gsd-session-state.sh']);

    const entries = await collectHooks(projectDir, []);

    expect(byId(entries, 'gsd-context-monitor')).toMatchObject({ kind: 'js', executable: false });
    expect(byId(entries, 'gsd-session-state')).toMatchObject({ kind: 'shell', executable: true });
  });

  it('infers worker, claude-hook, codex-hook, dist-only, and unknown install targets', async () => {
    await writeHook('gsd-check-update.js');
    await writeHook('gsd-context-monitor.js');
    await writeHook('gsd-custom.js');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-check-update.js', 'gsd-context-monitor.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-check-update.js', 'gsd-context-monitor.js']);
    await writeDistHook('gsd-extra.js');

    const entries = await collectHooks(projectDir, []);

    expect(byId(entries, 'gsd-check-update-worker').installTargetClass).toBe('worker');
    expect(byId(entries, 'gsd-context-monitor').installTargetClass).toBe('claude-hook');
    expect(byId(entries, 'gsd-check-update').installTargetClass).toBe('codex-hook');
    expect(byId(entries, 'gsd-extra').installTargetClass).toBe('dist-only');
    expect(byId(entries, 'gsd-custom').installTargetClass).toBe('unknown');
  });

  it('sets repo-relative distPath and true distExists when the dist artifact exists', async () => {
    await writeHook('gsd-test.js', '// source\n');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeDistHook('gsd-test.js', '// dist\n');

    const [entry] = (await collectHooks(projectDir, [])).filter((hook) => hook.id === 'gsd-test');

    expect(entry).toMatchObject({
      path: 'hooks/gsd-test.js',
      distPath: 'hooks/dist/gsd-test.js',
      distExists: true,
    });
    expect(isAbsolute(entry.distPath ?? '')).toBe(false);
    expect(entry.distPath).not.toContain('\\');
  });

  it('sets distExists false when hooks/dist exists without the source counterpart artifact', async () => {
    await writeHook('gsd-test.js');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-test.js']);
    await mkdir(join(projectDir, 'hooks', 'dist'), { recursive: true });

    const entry = byId(await collectHooks(projectDir, []), 'gsd-test');

    expect(entry.distPath).toBe('hooks/dist/gsd-test.js');
    expect(entry.distExists).toBe(false);
  });

  it('emits one COMP-04 warning when hooks/dist is absent', async () => {
    await writeHook('gsd-test.js');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-test.js']);
    const diagnostics: CompileDiagnostic[] = [];

    await collectHooks(projectDir, diagnostics);

    expect(comp04(diagnostics)).toEqual([
      expect.objectContaining({
        id: 'hooks/dist',
        message: expect.stringContaining('hooks/dist/ absent'),
        hint: expect.stringContaining('run npm run build:hooks'),
      }),
    ]);
  });

  it('does not emit the COMP-04 dist absence warning when hooks/dist exists', async () => {
    await writeHook('gsd-test.js');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-test.js']);
    await mkdir(join(projectDir, 'hooks', 'dist'), { recursive: true });
    const diagnostics: CompileDiagnostic[] = [];

    await collectHooks(projectDir, diagnostics);

    expect(comp04(diagnostics)).toEqual([]);
  });

  it('adds dist-only entries for dist artifacts without source counterparts', async () => {
    await writeManagedHooks(['gsd-check-update-worker.js']);
    await writeHookDocs(['gsd-check-update-worker.js']);
    await writeDistHook('gsd-extra.js');

    const entry = byId(await collectHooks(projectDir, []), 'gsd-extra');

    expect(entry).toMatchObject({
      path: 'hooks/dist/gsd-extra.js',
      distPath: 'hooks/dist/gsd-extra.js',
      distExists: true,
      installTargetClass: 'dist-only',
      executable: false,
    });
  });

  it('preserves source metadata when a matching dist artifact exists', async () => {
    await writeHook('gsd-test.js', '// source\n');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-test.js']);
    await writeDistHook('gsd-test.js', '// dist\n');

    const entry = byId(await collectHooks(projectDir, []), 'gsd-test');

    expect(entry.path).toBe('hooks/gsd-test.js');
    expect(entry.distPath).toBe('hooks/dist/gsd-test.js');
    expect(entry.distExists).toBe(true);
  });

  it('returns entries sorted by id with POSIX repo-relative paths', async () => {
    await writeHook('gsd-z.js');
    await writeHook('gsd-a.sh', '#!/usr/bin/env bash\n');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-z.js', 'gsd-a.sh']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-z.js', 'gsd-a.sh']);

    const entries = await collectHooks(projectDir, []);

    expect(entries.map((entry) => entry.id)).toEqual(['gsd-a', 'gsd-check-update-worker', 'gsd-z']);
    for (const entry of entries) {
      expect(isAbsolute(entry.path)).toBe(false);
      expect(entry.path).not.toContain('\\');
      expect(entry.distPath ? isAbsolute(entry.distPath) : false).toBe(false);
      expect(entry.distPath ?? '').not.toContain('\\');
      expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('emits COMP-08 when a live hook is absent from docs and MANAGED_HOOKS', async () => {
    await writeHook('gsd-undocumented.js');
    await writeManagedHooks(['gsd-check-update-worker.js']);
    await writeHookDocs(['gsd-check-update-worker.js']);
    const diagnostics: CompileDiagnostic[] = [];

    await collectHooks(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        id: 'gsd-undocumented',
        path: 'hooks/gsd-undocumented.js',
        message: expect.stringContaining('missing from hook docs or managed-hook manifest'),
      }),
    );
  });

  it('emits COMP-08 when docs or MANAGED_HOOKS reference a missing hook', async () => {
    await writeHook('gsd-live.js');
    await writeManagedHooks(['gsd-check-update-worker.js', 'gsd-live.js', 'gsd-stale.js']);
    await writeHookDocs(['gsd-check-update-worker.js', 'gsd-live.js', 'gsd-stale.js']);
    const diagnostics: CompileDiagnostic[] = [];

    await collectHooks(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        id: 'gsd-stale',
        message: expect.stringContaining('references missing hook file'),
      }),
    );
  });
});
