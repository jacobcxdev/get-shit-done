import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkBaselines, sortKeysDeep, writeBaselines } from './baselines.js';
import type { CompileDiagnostic } from './types.js';

async function makeDir(): Promise<string> {
  const dir = join(tmpdir(), `gsd-baselines-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('sortKeysDeep', () => {
  it('sorts nested object keys', () => {
    expect(sortKeysDeep({ z: 1, a: { d: 4, b: 2 } })).toEqual({ a: { b: 2, d: 4 }, z: 1 });
  });

  it('sorts arrays of strings alphabetically', () => {
    expect(sortKeysDeep(['z', 'a', 'm'])).toEqual(['a', 'm', 'z']);
  });

  it('sorts arrays of id objects by id', () => {
    expect(sortKeysDeep([{ id: 'z', value: 1 }, { id: 'a', value: 2 }])).toEqual([
      { id: 'a', value: 2 },
      { id: 'z', value: 1 },
    ]);
  });
});

describe('baseline read/write/check', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('writes sorted-key JSON files with a trailing newline', async () => {
    const generatedDir = await makeDir();
    dirs.push(generatedDir);

    await writeBaselines(generatedDir, { demo: { z: 1, a: 2 } });

    await expect(readFile(join(generatedDir, 'demo.json'), 'utf-8')).resolves.toBe(
      '{\n  "a": 2,\n  "z": 1\n}\n',
    );
  });

  it('does not emit diagnostics when committed content matches live content', async () => {
    const projectDir = await makeDir();
    dirs.push(projectDir);
    const generatedDir = join(projectDir, 'sdk', 'src', 'generated', 'compile');
    await writeBaselines(generatedDir, { demo: [{ id: 'a' }] });
    const diagnostics: CompileDiagnostic[] = [];

    await checkBaselines(projectDir, 'sdk/src/generated/compile', { demo: [{ id: 'a' }] }, diagnostics);

    expect(diagnostics).toEqual([]);
  });

  it('emits COMP-10 for a missing baseline file', async () => {
    const projectDir = await makeDir();
    dirs.push(projectDir);
    const diagnostics: CompileDiagnostic[] = [];

    await checkBaselines(projectDir, 'sdk/src/generated/compile', { demo: [] }, diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'COMP-10',
      id: 'demo',
      path: 'sdk/src/generated/compile/demo.json',
    }));
  });

  it('normalises absolute generatedDir diagnostics to repo-relative POSIX paths', async () => {
    const projectDir = await makeDir();
    dirs.push(projectDir);
    const diagnostics: CompileDiagnostic[] = [];

    await checkBaselines(projectDir, join(projectDir, 'sdk', 'src', 'generated', 'compile'), { demo: [] }, diagnostics);

    expect(diagnostics[0]?.path).toBe('sdk/src/generated/compile/demo.json');
    expect(diagnostics[0]?.path.startsWith(projectDir)).toBe(false);
  });

  it('emits ID-aware +id/-id hints for baseline drift', async () => {
    const projectDir = await makeDir();
    dirs.push(projectDir);
    const generatedDir = join(projectDir, 'sdk', 'src', 'generated', 'compile');
    await mkdir(generatedDir, { recursive: true });
    await writeFile(join(generatedDir, 'demo.json'), '[\n  {\n    "id": "old"\n  }\n]\n');
    const diagnostics: CompileDiagnostic[] = [];

    await checkBaselines(projectDir, 'sdk/src/generated/compile', { demo: [{ id: 'new' }] }, diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'COMP-10',
      hint: '+new, -old',
    }));
  });
});
