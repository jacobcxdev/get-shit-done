import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRegistry } from './index.js';

const HASH_PATTERN = /^[a-f0-9]{64}$/;

describe('config.snapshot-hash', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gsd-config-snapshot-'));
    await mkdir(join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('hashes the canonical effective config, not raw file bytes', async () => {
    const registry = createRegistry();
    const configPath = join(tmpDir, '.planning', 'config.json');

    await writeFile(configPath, JSON.stringify({
      agent_routing: {
        'gsd-planner': 'codex:high',
        'gsd-planner::/workflows/plan.phase.md::check': 'sonnet',
      },
      codex_model: 'gpt-5.5',
      codex_config: { sandbox: 'workspace-write' },
      gemini_model: 'gemini-3.1-pro-preview',
    }, null, 2));

    const first = await registry.dispatch('config.snapshot-hash', [], tmpDir);
    const firstHash = (first.data as { hash: string }).hash;

    await writeFile(configPath, [
      '{',
      '  "gemini_model": "gemini-3.1-pro-preview",',
      '  "codex_config": { "sandbox": "workspace-write" },',
      '  "codex_model": "gpt-5.5",',
      '  "agent_routing": {',
      '    "gsd-planner::/workflows/plan.phase.md::check": "sonnet",',
      '    "gsd-planner": "codex:high"',
      '  }',
      '}',
      '',
    ].join('\n'));

    const second = await registry.dispatch('config snapshot-hash', [], tmpDir);
    const secondHash = (second.data as { hash: string }).hash;

    await writeFile(configPath, JSON.stringify({
      agent_routing: {
        'gsd-planner': 'codex:high',
        'gsd-planner::/workflows/plan.phase.md::check': 'sonnet',
      },
      codex_model: 'gpt-5.4',
      codex_config: { sandbox: 'workspace-write' },
      gemini_model: 'gemini-3.1-pro-preview',
    }, null, 2));

    const third = await registry.dispatch('config.snapshot-hash', [], tmpDir);
    const thirdHash = (third.data as { hash: string }).hash;

    expect(firstHash).toMatch(HASH_PATTERN);
    expect(secondHash).toMatch(HASH_PATTERN);
    expect(thirdHash).toMatch(HASH_PATTERN);
    expect(secondHash).toBe(firstHash);
    expect(thirdHash).not.toBe(firstHash);
  });
});
