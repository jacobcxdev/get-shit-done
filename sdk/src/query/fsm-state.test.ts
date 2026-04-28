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

  it('dispatches fsm.run-id and fsm run-id aliases with identical output', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    const dotted = await registry.dispatch('fsm.run-id', [], projectDir);
    const spaced = await registry.dispatch('fsm run-id', [], projectDir);

    expect(dotted).toEqual({ data: { runId: 'run-1', workstream: null } });
    expect(spaced).toEqual(dotted);
  });

  it('dispatches fsm.transition and fsm transition aliases as one atomic history entry', async () => {
    for (const command of ['fsm.transition', 'fsm transition']) {
      const registry = createRegistry();
      await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

      const result = await registry.dispatch(command, ['', 'p4-compliance', 'success'], projectDir);

      expect(result.data).toMatchObject({
        fromState: 'verify',
        toState: 'p4-compliance',
        outcome: 'success',
        runId: 'run-1',
        workstream: null,
      });
      expect((result.data as { timestamp?: string }).timestamp)
        .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
      const state = JSON.parse(raw) as {
        currentState: string;
        transitionHistory: Array<Record<string, unknown>>;
      };
      expect(state.currentState).toBe('p4-compliance');
      expect(state.transitionHistory).toHaveLength(1);
      expect(state.transitionHistory[0]).toMatchObject({
        fromState: 'verify',
        toState: 'p4-compliance',
        outcome: 'success',
        runId: 'run-1',
      });
      expect(state.transitionHistory[0]?.timestamp)
        .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('dispatches fsm.history and fsm history aliases in chronological order', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);
    await registry.dispatch('fsm.transition', ['', 'p4-compliance', 'success'], projectDir);
    await registry.dispatch('fsm.transition', ['', 'advance', 'success'], projectDir);

    const dotted = await registry.dispatch('fsm.history', [], projectDir);
    const spaced = await registry.dispatch('fsm history', [], projectDir);

    expect(spaced).toEqual(dotted);
    const history = (dotted.data as { history: Array<Record<string, unknown>> }).history;
    expect(history.map(entry => entry.toState)).toEqual(['p4-compliance', 'advance']);
    expect(history.map(entry => entry.outcome)).toEqual(['success', 'success']);
    expect(Date.parse(history[0].timestamp as string))
      .toBeLessThanOrEqual(Date.parse(history[1].timestamp as string));
  });

  it('dispatches fsm.confidence as full before provider metadata exists', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    await expect(registry.dispatch('fsm.confidence', [], projectDir))
      .resolves.toEqual({ data: { confidence: 'full', workstream: null } });
  });

  it('rejects malformed fsm.transition without mutating transitionHistory.length', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    await expect(registry.dispatch('fsm.transition', ['', '', 'success'], projectDir))
      .rejects.toThrow(/toState/);

    const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
    const state = JSON.parse(raw) as { transitionHistory: unknown[] };
    expect(state.transitionHistory.length).toBe(0);
  });

  it('restricts phase.edit and phase edit aliases to mutable phase fields', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    await expect(registry.dispatch('phase.edit', ['arbitrary.path', 'ignored'], projectDir))
      .rejects.toThrow(/arbitrary\.path/);

    await expect(registry.dispatch('phase.edit', ['currentState', 'p4-compliance'], projectDir))
      .resolves.toMatchObject({ data: { field: 'currentState', value: 'p4-compliance', workstream: null } });
    await expect(registry.dispatch('phase edit', ['currentState', 'advance'], projectDir))
      .resolves.toMatchObject({ data: { field: 'currentState', value: 'advance', workstream: null } });

    const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
    expect(JSON.parse(raw).currentState).toBe('advance');
  });
});
