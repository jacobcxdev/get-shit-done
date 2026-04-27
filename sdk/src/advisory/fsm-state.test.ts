import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  CURRENT_FSM_STATE_SCHEMA_VERSION,
  FsmStateError,
  acquireFsmLock,
  createInitialFsmRunState,
  fsmStatePath,
  readFsmLockStatus,
  releaseFsmLock,
  writeFsmState,
  type FsmRunState,
} from './fsm-state.js';

describe('FSM state paths', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'gsd-fsm-state-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('derives flat and workstream state paths under .planning', () => {
    expect(fsmStatePath(projectDir)).toBe(join(projectDir, '.planning', 'fsm-state.json'));
    expect(fsmStatePath(projectDir, 'demo')).toBe(join(
      projectDir,
      '.planning',
      'workstreams',
      'demo',
      'fsm-state.json',
    ));
  });

  it('rejects invalid workstream names before path derivation', () => {
    for (const value of ['../escape', '/absolute', 'bad/name']) {
      expect(() => fsmStatePath(projectDir, value)).toThrow(FsmStateError);
      expect(() => fsmStatePath(projectDir, value)).toThrow('Invalid workstream name');
    }
  });
});

describe('FSM first writes', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'gsd-fsm-write-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('serializes first-write fields with an explicit flat workstream null', async () => {
    const state = makeState({ workstream: null });
    await writeFsmState(projectDir, undefined, state);

    const raw = await readFile(fsmStatePath(projectDir), 'utf-8');
    const parsed = JSON.parse(raw) as FsmRunState;

    expect(raw.endsWith('\n')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'workstream')).toBe(true);
    expect(parsed.workstream).toBeNull();
    expect(parsed.runId).toBe('run-1');
    expect(parsed.stateSchemaVersion).toBe(CURRENT_FSM_STATE_SCHEMA_VERSION);
    expect(parsed.workflowId).toBe('workflow-1');
    expect(parsed.currentState).toBe('start');
    expect(parsed.transitionHistory).toEqual([]);
    expect(parsed.migration).toEqual({ status: 'none' });
    expect(parsed.resume).toEqual({ status: 'new' });
    expect(parsed.autoMode).toEqual({ active: false, source: 'none' });
  });

  it('serializes workstream-scoped first writes with the concrete workstream', async () => {
    const state = makeState({ workstream: 'demo' });
    await writeFsmState(projectDir, 'demo', state);

    const parsed = JSON.parse(await readFile(fsmStatePath(projectDir, 'demo'), 'utf-8')) as FsmRunState;

    expect(Object.prototype.hasOwnProperty.call(parsed, 'workstream')).toBe(true);
    expect(parsed.workstream).toBe('demo');
  });

  it('uses deterministic trailing-newline JSON output', async () => {
    const state = makeState({ workstream: null });
    await writeFsmState(projectDir, undefined, state);
    const first = await readFile(fsmStatePath(projectDir), 'utf-8');
    await writeFsmState(projectDir, undefined, state);
    const second = await readFile(fsmStatePath(projectDir), 'utf-8');

    expect(second).toBe(first);
    expect(second).toBe(`${JSON.stringify(JSON.parse(second), null, 2)}\n`);
  });

  it('rejects schemaVersion mismatches with a typed error', async () => {
    const state = {
      ...makeState({ workstream: null }),
      stateSchemaVersion: 2,
    } as unknown as FsmRunState;

    await expect(writeFsmState(projectDir, undefined, state))
      .rejects.toMatchObject({ code: 'schema-version-mismatch' });
  });
});

describe('FSM locks', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'gsd-fsm-lock-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('reports lock status without process details beyond holder and age', async () => {
    const path = fsmStatePath(projectDir);
    await mkdir(dirname(path), { recursive: true });
    const lockPath = await acquireFsmLock(path);
    try {
      const status = await readFsmLockStatus(path);
      expect(status.holder).toBe(String(process.pid));
      expect(status.acquiredAt).toEqual(expect.any(String));
      expect(status.ageSeconds).toEqual(expect.any(Number));
      expect(status.stale).toBe(false);
      expect(Object.keys(status).sort()).toEqual(['acquiredAt', 'ageSeconds', 'holder', 'stale']);
    } finally {
      await releaseFsmLock(lockPath);
    }
  });

  it('holds the FSM lock while syncStateMd runs and rejects concurrent writes', async () => {
    const path = fsmStatePath(projectDir);
    let releaseSync!: () => void;
    const releasePromise = new Promise<void>((release) => {
      releaseSync = release;
    });
    let firstWrite!: Promise<void>;
    const syncEntered = new Promise<void>((resolve) => {
      firstWrite = writeFsmState(projectDir, undefined, makeState({ workstream: null }), {
        syncStateMd: async () => {
          expect(existsSync(`${path}.lock`)).toBe(true);
          resolve();
          await releasePromise;
        },
      });
    });

    await syncEntered;

    await expect(writeFsmState(projectDir, undefined, {
      ...makeState({ workstream: null }),
      currentState: 'concurrent',
    })).rejects.toMatchObject({ code: 'lock-conflict' });

    releaseSync();
    await firstWrite;
  }, 7000);
});

function makeState(input: { workstream: string | null }): FsmRunState {
  return createInitialFsmRunState({
    runId: 'run-1',
    workflowId: 'workflow-1',
    workstream: input.workstream,
    currentState: 'start',
    config: { workflow: { auto_advance: false }, z: 1, a: 2 },
    now: '2026-04-27T00:00:00.000Z',
  });
}
