import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRegistry, QUERY_MUTATION_COMMANDS } from './index.js';

describe('FSM query handlers', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'gsd-fsm-query-'));
    await mkdir(join(projectDir, '.planning'), { recursive: true });
    await writeFile(join(projectDir, '.planning', 'config.json'), JSON.stringify({
      workflow: { auto_advance: false },
      codex_model: 'gpt-5.5',
    }), 'utf-8');
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('dispatches fsm.state.init and fsm state aliases', async () => {
    const registry = createRegistry();
    const init = await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'start'], projectDir);

    expect(init.data).toMatchObject({
      runId: 'run-1',
      stateSchemaVersion: 1,
      workstream: null,
      currentState: 'start',
    });

    const read = await registry.dispatch('fsm state', [], projectDir);
    expect(read.data).toMatchObject({
      runId: 'run-1',
      workflowId: 'workflow-1',
      workstream: null,
      currentState: 'start',
    });
  });

  it('dispatches fsm.auto-mode.set and fsm auto-mode set aliases', async () => {
    const registry = createRegistry();

    await expect(registry.dispatch('fsm.auto-mode.set', ['true', 'auto_chain'], projectDir))
      .resolves.toMatchObject({ data: { active: true, source: 'auto_chain', workstream: null } });

    await expect(registry.dispatch('fsm auto-mode set', ['false', 'none'], projectDir))
      .resolves.toMatchObject({ data: { active: false, source: 'none', workstream: null } });

    const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
    expect(JSON.parse(raw).autoMode).toEqual({ active: false, source: 'none' });
  });

  it('dispatches lock.status and lock status aliases', async () => {
    const registry = createRegistry();

    await expect(registry.dispatch('lock.status', [], projectDir))
      .resolves.toMatchObject({ data: { holder: null, acquiredAt: null, ageSeconds: null, stale: false } });
    await expect(registry.dispatch('lock status', [], projectDir))
      .resolves.toMatchObject({ data: { holder: null, acquiredAt: null, ageSeconds: null, stale: false } });
  });

  it('supports workstream-scoped init and read through positional workstream args', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-2', 'workflow-2', 'start', 'demo'], projectDir);

    const read = await registry.dispatch('fsm.state', ['demo'], projectDir);

    expect(read.data).toMatchObject({
      runId: 'run-2',
      workflowId: 'workflow-2',
      workstream: 'demo',
    });
  });

  it('registers FSM write commands as mutations', () => {
    expect(QUERY_MUTATION_COMMANDS.has('fsm.state.init')).toBe(true);
    expect(QUERY_MUTATION_COMMANDS.has('fsm state init')).toBe(true);
    expect(QUERY_MUTATION_COMMANDS.has('fsm.auto-mode.set')).toBe(true);
    expect(QUERY_MUTATION_COMMANDS.has('fsm auto-mode set')).toBe(true);
  });
});
