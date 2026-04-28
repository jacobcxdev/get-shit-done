import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('rejects unsupported FSM schema versions for read and edit queries without mutating the file', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);
    const statePath = join(projectDir, '.planning', 'fsm-state.json');
    const initialRaw = await readFile(statePath, 'utf-8');
    const state = JSON.parse(initialRaw) as Record<string, unknown>;
    state.stateSchemaVersion = 999;
    const unsupportedRaw = `${JSON.stringify(state, null, 2)}\n`;
    await writeFile(statePath, unsupportedRaw, 'utf-8');

    for (const command of ['fsm.state', 'fsm.history', 'fsm.confidence']) {
      await expect(registry.dispatch(command, [], projectDir))
        .rejects.toMatchObject({ code: 'schema-version-mismatch' });
    }

    await expect(registry.dispatch('phase.edit', ['currentState', 'advance'], projectDir))
      .rejects.toMatchObject({ code: 'schema-version-mismatch' });

    await expect(readFile(statePath, 'utf-8')).resolves.toBe(unsupportedRaw);
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

  it('uses fsm.transition public argument order [workstream, toState, outcome]', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify', 'demo'], projectDir);

    const result = await registry.dispatch('fsm.transition', ['demo', 'p4-compliance', 'success'], projectDir);

    expect(result.data).toMatchObject({
      fromState: 'verify',
      toState: 'p4-compliance',
      outcome: 'success',
      runId: 'run-1',
      workstream: 'demo',
    });

    const raw = await readFile(join(projectDir, '.planning', 'workstreams', 'demo', 'fsm-state.json'), 'utf-8');
    const state = JSON.parse(raw) as { currentState: string; transitionHistory: Array<Record<string, unknown>> };
    expect(state.currentState).toBe('p4-compliance');
    expect(state.transitionHistory).toHaveLength(1);
    expect(state.transitionHistory[0]).toMatchObject({
      fromState: 'verify',
      toState: 'p4-compliance',
      outcome: 'success',
      runId: 'run-1',
    });
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
    expect(history[0]).toMatchObject({
      timestamp: expect.any(String),
      fromState: 'verify',
      toState: 'p4-compliance',
      runId: 'run-1',
      outcome: 'success',
      configSnapshotHash: expect.any(String),
    });
    expect(history[1]).toMatchObject({
      timestamp: expect.any(String),
      fromState: 'p4-compliance',
      toState: 'advance',
      runId: 'run-1',
      outcome: 'success',
      configSnapshotHash: expect.any(String),
    });
  });

  it('dispatches fsm.confidence as full before provider metadata exists', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    await expect(registry.dispatch('fsm.confidence', [], projectDir))
      .resolves.toEqual({ data: { confidence: 'full', workstream: null } });
  });

  it('records reduced provider metadata atomically with fsm.transition history', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    const result = await registry.dispatch('fsm.transition', [
      '',
      'p4-compliance',
      'success',
      JSON.stringify({ providerConfidence: 'reduced', missingProviders: ['gemini'] }),
    ], projectDir);

    expect(result.data).toMatchObject({
      fromState: 'verify',
      toState: 'p4-compliance',
      outcome: 'success',
      reducedConfidence: true,
      missingProviders: ['gemini'],
      providerConfidence: 'reduced',
    });

    const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
    const state = JSON.parse(raw) as { transitionHistory: Array<Record<string, unknown>> };
    expect(state.transitionHistory).toHaveLength(1);
    expect(state.transitionHistory[0]).toMatchObject({
      fromState: 'verify',
      toState: 'p4-compliance',
      outcome: 'success',
      reducedConfidence: true,
      missingProvider: 'gemini',
      missingProviders: ['gemini'],
      providerConfidence: 'reduced',
    });

    await expect(registry.dispatch('fsm.confidence', [], projectDir))
      .resolves.toEqual({ data: { confidence: 'reduced:gemini', workstream: null } });
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

  it('parses every allowlisted phase.edit field before writing state', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);

    await expect(registry.dispatch('phase.edit', ['resume.status', 'active'], projectDir))
      .resolves.toMatchObject({ data: { field: 'resume.status', value: 'active', workstream: null } });
    await expect(registry.dispatch('phase.edit', ['autoMode.active', 'true'], projectDir))
      .resolves.toMatchObject({ data: { field: 'autoMode.active', value: true, workstream: null } });
    await expect(registry.dispatch('phase.edit', ['autoMode.source', 'both'], projectDir))
      .resolves.toMatchObject({ data: { field: 'autoMode.source', value: 'both', workstream: null } });

    await expect(registry.dispatch('phase.edit', ['resume.status', 'invalid'], projectDir))
      .rejects.toThrow(/resume\.status/);
    await expect(registry.dispatch('phase.edit', ['autoMode.active', 'yes'], projectDir))
      .rejects.toThrow(/autoMode\.active/);
    await expect(registry.dispatch('phase.edit', ['autoMode.source', 'manual'], projectDir))
      .rejects.toThrow(/autoMode\.source/);

    const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
    const state = JSON.parse(raw) as {
      resume: { status: string };
      autoMode: { active: boolean; source: string };
    };
    expect(state.resume).toEqual({ status: 'active' });
    expect(state.autoMode).toEqual({ active: true, source: 'both' });
  });

  it('does not mutate the parsed phase.edit state object before a failed write', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['run-1', 'workflow-1', 'verify'], projectDir);
    const statePath = join(projectDir, '.planning', 'fsm-state.json');
    const initialRaw = await readFile(statePath, 'utf-8');
    const parsedState = JSON.parse(initialRaw) as Record<string, unknown>;
    parsedState.stateSchemaVersion = 999;
    const unsupportedRaw = `${JSON.stringify(parsedState, null, 2)}\n`;
    await writeFile(statePath, unsupportedRaw, 'utf-8');

    const originalParse = JSON.parse;
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
      if (text === unsupportedRaw) {
        return parsedState;
      }
      return originalParse(text, reviver);
    });

    try {
      await expect(registry.dispatch('phase.edit', ['currentState', 'advance'], projectDir))
        .rejects.toMatchObject({ code: 'schema-version-mismatch' });
      expect(parsedState.currentState).toBe('verify');
      expect(parsedState.updatedAt).toBe((originalParse(unsupportedRaw) as Record<string, unknown>).updatedAt);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('dispatches thread metadata aliases from durable FSM state', async () => {
    const registry = createRegistry();
    await registry.dispatch('fsm.state.init', ['thread-run', 'workflow-1', 'verify', 'demo'], projectDir);

    const dottedId = await registry.dispatch('thread.id', ['demo'], projectDir);
    const spacedId = await registry.dispatch('thread id', ['demo'], projectDir);
    expect(spacedId).toEqual(dottedId);
    expect(dottedId).toEqual({ data: { threadId: 'thread-run', workstream: 'demo' } });

    const dottedWorkstream = await registry.dispatch('thread.workstream', ['demo'], projectDir);
    const spacedWorkstream = await registry.dispatch('thread workstream', ['demo'], projectDir);
    expect(spacedWorkstream).toEqual(dottedWorkstream);
    expect(dottedWorkstream).toEqual({ data: { workstream: 'demo', runId: 'thread-run' } });

    const dottedSession = await registry.dispatch('thread.session', ['demo'], projectDir);
    const spacedSession = await registry.dispatch('thread session', ['demo'], projectDir);
    expect(spacedSession).toEqual(dottedSession);
    expect(dottedSession).toEqual({
      data: { sessionId: 'thread-run', runId: 'thread-run', workstream: 'demo' },
    });
  });
});
