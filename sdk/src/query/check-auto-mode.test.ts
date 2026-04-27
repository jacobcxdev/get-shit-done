/**
 * Unit tests for `check.auto-mode` (decision-routing audit §3.5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkAutoMode } from './check-auto-mode.js';
import { createRegistry } from './index.js';

describe('checkAutoMode', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(tmpdir(), `gsd-auto-mode-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(projectDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('returns defaults when config.json is missing', async () => {
    const { data } = await checkAutoMode([], projectDir);
    expect(data).toEqual({
      active: false,
      source: 'none',
      auto_chain_active: false,
      auto_advance: false,
    });
  });

  it('active true when only auto_advance is set', async () => {
    await writeFile(
      join(projectDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { auto_advance: true } }),
      'utf-8',
    );
    const { data } = await checkAutoMode([], projectDir);
    expect(data).toMatchObject({
      active: true,
      source: 'auto_advance',
      auto_advance: true,
      auto_chain_active: false,
    });
  });

  it('active true when FSM autoMode stores chain state', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.auto-mode.set', ['true', 'auto_chain'], projectDir);

    const { data } = await checkAutoMode([], projectDir);
    expect(data).toMatchObject({
      active: true,
      source: 'auto_chain',
      auto_advance: false,
      auto_chain_active: true,
    });
  });

  it('uses source both when FSM chain state and auto advance are true', async () => {
    await writeFile(
      join(projectDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { auto_advance: true } }),
      'utf-8',
    );
    const registry = createRegistry();
    await registry.dispatch('fsm.auto-mode.set', ['true', 'auto_chain'], projectDir);

    const { data } = await checkAutoMode([], projectDir);
    expect(data).toMatchObject({
      active: true,
      source: 'both',
      auto_advance: true,
      auto_chain_active: true,
    });
  });

  it('reads FSM autoMode from the requested workstream only', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.auto-mode.set', ['true', 'auto_chain', 'demo'], projectDir);

    await expect(checkAutoMode([], projectDir)).resolves.toMatchObject({
      data: { active: false, source: 'none', auto_chain_active: false },
    });
    await expect(checkAutoMode(['demo'], projectDir)).resolves.toMatchObject({
      data: { active: true, source: 'auto_chain', auto_chain_active: true },
    });
  });

  it('keeps the legacy flat chain key out of runtime and docs surfaces', async () => {
    const needle = ['_auto', 'chain', 'active'].join('_');
    const scanTargets = [
      join(process.cwd(), 'src'),
      join(process.cwd(), 'src', 'query', 'QUERY-HANDLERS.md'),
      join(process.cwd(), '..', 'get-shit-done', 'bin', 'lib'),
      join(process.cwd(), '..', 'get-shit-done', 'workflows'),
      join(process.cwd(), '..', 'get-shit-done', 'references', 'checkpoints.md'),
      join(process.cwd(), '..', 'get-shit-done', 'references', 'planning-config.md'),
    ];

    const offenders: string[] = [];
    for (const target of scanTargets) {
      for (const file of await collectFiles(target)) {
        const content = await readFile(file, 'utf-8');
        if (content.includes(needle)) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function collectFiles(target: string): Promise<string[]> {
  const s = await stat(target);
  if (s.isFile()) {
    return [target];
  }

  const files: string[] = [];
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}
