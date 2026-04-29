import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  migrateFsmState,
  rollbackFsmState,
} from './fsm-rollback.js';
import type { FsmRunState } from './fsm-state.js';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function makeSeedState(overrides: Partial<FsmRunState> = {}): FsmRunState {
  return {
    runId: 'run-001',
    stateSchemaVersion: 1,
    workflowId: 'wf-test',
    workstream: null,
    currentState: 'plan',
    configSnapshotHash: 'abc123',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    transitionHistory: [],
    migration: { status: 'none' },
    resume: { status: 'active' },
    autoMode: { active: false, source: 'none' },
    ...overrides,
  };
}

async function seedState(projectDir: string, state: FsmRunState | object): Promise<void> {
  await mkdir(join(projectDir, '.planning'), { recursive: true });
  await writeFile(
    join(projectDir, '.planning', 'fsm-state.json'),
    JSON.stringify(state, null, 2) + '\n',
    'utf-8',
  );
}

async function readState(projectDir: string): Promise<FsmRunState> {
  const raw = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
  return JSON.parse(raw) as FsmRunState;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-fsm-rollback-'));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// rollbackFsmState
// ---------------------------------------------------------------------------

describe('rollbackFsmState', () => {
  it('restores currentState to checkpoint toState and appends rollback entry', async () => {
    const checkpointEntry = {
      entryId: 'entry-chk-001',
      timestamp: '2026-01-01T01:00:00Z',
      fromState: 'plan',
      toState: 'execute',
      runId: 'run-001',
      outcome: 'success',
      configSnapshotHash: 'abc123',
      checkpoint: true,
    };
    const postCheckpointEntry = {
      entryId: 'entry-002',
      timestamp: '2026-01-01T02:00:00Z',
      fromState: 'execute',
      toState: 'verify',
      runId: 'run-001',
      outcome: 'success',
      configSnapshotHash: 'abc123',
    };
    const seed = makeSeedState({
      currentState: 'verify',
      transitionHistory: [checkpointEntry, postCheckpointEntry],
    });
    await seedState(projectDir, seed);

    const result = await rollbackFsmState({ projectDir });

    expect(result).not.toHaveProperty('kind'); // not a control event
    const after = await readState(projectDir);
    expect(after.currentState).toBe('execute'); // restored to checkpoint.toState
    expect(after.transitionHistory).toHaveLength(3); // original 2 + rollback entry
    const rollbackEntry = after.transitionHistory[2];
    expect(rollbackEntry).toBeDefined();
    expect(rollbackEntry!.outcome).toBe('rollback');
    expect(rollbackEntry!.rollbackEntry).toEqual({
      rollbackToEntryId: 'entry-chk-001',
      rolledBackEntryIds: ['entry-002'],
    });
  });

  it('returns RollbackBlockedEvent when no checkpoint entry exists', async () => {
    const seed = makeSeedState({
      transitionHistory: [
        {
          entryId: 'entry-001',
          timestamp: '2026-01-01T01:00:00Z',
          fromState: 'plan',
          toState: 'execute',
          runId: 'run-001',
          outcome: 'success',
          configSnapshotHash: 'abc123',
        },
      ],
    });
    await seedState(projectDir, seed);

    const result = await rollbackFsmState({ projectDir });

    expect(result).toMatchObject({
      kind: 'control',
      event: 'rollback-blocked',
      reason: 'no-checkpoint',
    });
  });

  it('returns RollbackBlockedEvent when history is empty', async () => {
    await seedState(projectDir, makeSeedState({ transitionHistory: [] }));

    const result = await rollbackFsmState({ projectDir });

    expect(result).toMatchObject({ kind: 'control', event: 'rollback-blocked' });
  });

  it('appends rollback entry with correct entryId (new UUID) and does not delete prior entries', async () => {
    const entries = [
      {
        entryId: 'entry-chk-001',
        timestamp: '2026-01-01T01:00:00Z',
        fromState: 'plan',
        toState: 'execute',
        runId: 'run-001',
        outcome: 'success',
        configSnapshotHash: 'abc123',
        checkpoint: true,
      },
      {
        entryId: 'entry-002',
        timestamp: '2026-01-01T02:00:00Z',
        fromState: 'execute',
        toState: 'verify',
        runId: 'run-001',
        outcome: 'success',
        configSnapshotHash: 'abc123',
      },
    ];
    await seedState(projectDir, makeSeedState({ currentState: 'verify', transitionHistory: entries }));

    await rollbackFsmState({ projectDir });

    const after = await readState(projectDir);
    // All prior entries preserved
    expect(after.transitionHistory[0]).toMatchObject({ entryId: 'entry-chk-001' });
    expect(after.transitionHistory[1]).toMatchObject({ entryId: 'entry-002' });
    // Rollback entry has a new UUID (non-empty, not a prior entryId)
    const rollbackEntry = after.transitionHistory[2];
    expect(rollbackEntry).toBeDefined();
    expect(typeof rollbackEntry!.entryId).toBe('string');
    expect(rollbackEntry!.entryId.length).toBeGreaterThan(0);
    expect(rollbackEntry!.entryId).not.toBe('entry-chk-001');
    expect(rollbackEntry!.entryId).not.toBe('entry-002');
  });

  it('uses last checkpoint entry when multiple checkpoint entries exist', async () => {
    const entries = [
      {
        entryId: 'entry-chk-001',
        timestamp: '2026-01-01T01:00:00Z',
        fromState: 'plan',
        toState: 'execute',
        runId: 'run-001',
        outcome: 'success',
        configSnapshotHash: 'abc123',
        checkpoint: true,
      },
      {
        entryId: 'entry-chk-002',
        timestamp: '2026-01-01T02:00:00Z',
        fromState: 'execute',
        toState: 'verify',
        runId: 'run-001',
        outcome: 'success',
        configSnapshotHash: 'abc123',
        checkpoint: true,
      },
      {
        entryId: 'entry-003',
        timestamp: '2026-01-01T03:00:00Z',
        fromState: 'verify',
        toState: 'complete',
        runId: 'run-001',
        outcome: 'success',
        configSnapshotHash: 'abc123',
      },
    ];
    await seedState(projectDir, makeSeedState({ currentState: 'complete', transitionHistory: entries }));

    await rollbackFsmState({ projectDir });

    const after = await readState(projectDir);
    // Must restore to last checkpoint (entry-chk-002, toState='verify')
    expect(after.currentState).toBe('verify');
    const rollbackEntry = after.transitionHistory[3];
    expect(rollbackEntry!.rollbackEntry).toMatchObject({
      rollbackToEntryId: 'entry-chk-002',
      rolledBackEntryIds: ['entry-003'],
    });
  });

  it('does not delete any entries — history only grows', async () => {
    const entries = [
      {
        entryId: 'entry-chk-001',
        timestamp: '2026-01-01T01:00:00Z',
        fromState: 'plan',
        toState: 'execute',
        runId: 'run-001',
        outcome: 'success',
        configSnapshotHash: 'abc123',
        checkpoint: true,
      },
    ];
    await seedState(projectDir, makeSeedState({ currentState: 'execute', transitionHistory: entries }));

    await rollbackFsmState({ projectDir });

    const after = await readState(projectDir);
    expect(after.transitionHistory).toHaveLength(2);
    expect(after.transitionHistory[0]).toMatchObject({ entryId: 'entry-chk-001' });
  });
});

// ---------------------------------------------------------------------------
// migrateFsmState
// ---------------------------------------------------------------------------

describe('migrateFsmState', () => {
  it('backfills entryId on v0 history entries and sets stateSchemaVersion to 1', async () => {
    const v0State = {
      runId: 'run-001',
      stateSchemaVersion: 0,
      workflowId: 'wf-test',
      workstream: null,
      currentState: 'plan',
      configSnapshotHash: 'abc123',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      transitionHistory: [
        {
          // no entryId — this is the pre-migration format
          timestamp: '2026-01-01T01:00:00Z',
          fromState: 'plan',
          toState: 'execute',
          runId: 'run-001',
          outcome: 'success',
          configSnapshotHash: 'abc123',
        },
        {
          timestamp: '2026-01-01T02:00:00Z',
          fromState: 'execute',
          toState: 'verify',
          runId: 'run-001',
          outcome: 'success',
          configSnapshotHash: 'abc123',
        },
      ],
      migration: { status: 'none' },
      resume: { status: 'active' },
      autoMode: { active: false, source: 'none' },
    };
    await seedState(projectDir, v0State);

    const result = await migrateFsmState({ projectDir });

    expect(result).not.toHaveProperty('kind'); // not a control event
    expect(result).toMatchObject({
      sourceVersion: 0,
      targetVersion: 1,
      entriesBackfilled: 2,
    });
    const after = await readState(projectDir);
    expect(after.stateSchemaVersion).toBe(1);
    expect(after.transitionHistory).toHaveLength(2);
    for (const entry of after.transitionHistory) {
      expect(typeof entry.entryId).toBe('string');
      expect(entry.entryId.length).toBeGreaterThan(0);
    }
  });

  it('returns already-current for v1 state without writing', async () => {
    const v1State = makeSeedState({
      transitionHistory: [
        {
          entryId: 'entry-001',
          timestamp: '2026-01-01T01:00:00Z',
          fromState: 'plan',
          toState: 'execute',
          runId: 'run-001',
          outcome: 'success',
          configSnapshotHash: 'abc123',
        },
      ],
    });
    await seedState(projectDir, v1State);
    const beforeMtime = (await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8'));

    const result = await migrateFsmState({ projectDir });

    expect(result).toMatchObject({ kind: 'already-current' });
    const afterContent = await readFile(join(projectDir, '.planning', 'fsm-state.json'), 'utf-8');
    expect(afterContent).toBe(beforeMtime); // file unchanged
  });

  it('returns ResumeBlockedEvent for state with stateSchemaVersion > 1', async () => {
    const futureState = {
      ...makeSeedState(),
      stateSchemaVersion: 99,
    };
    await seedState(projectDir, futureState);

    const result = await migrateFsmState({ projectDir });

    expect(result).toMatchObject({
      kind: 'control',
      event: 'resume-blocked',
    });
  });

  it('preserves all history entries in order during migration (MIGR-03)', async () => {
    const v0State = {
      runId: 'run-001',
      stateSchemaVersion: 0,
      workflowId: 'wf-test',
      workstream: null,
      currentState: 'verify',
      configSnapshotHash: 'abc123',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      transitionHistory: [
        { timestamp: '2026-01-01T01:00:00Z', fromState: 'plan', toState: 'execute', runId: 'run-001', outcome: 'success', configSnapshotHash: 'abc123' },
        { timestamp: '2026-01-01T02:00:00Z', fromState: 'execute', toState: 'verify', runId: 'run-001', outcome: 'success', configSnapshotHash: 'abc123' },
        { timestamp: '2026-01-01T03:00:00Z', fromState: 'verify', toState: 'complete', runId: 'run-001', outcome: 'success', configSnapshotHash: 'abc123' },
      ],
      migration: { status: 'none' },
      resume: { status: 'active' },
      autoMode: { active: false, source: 'none' },
    };
    await seedState(projectDir, v0State);

    await migrateFsmState({ projectDir });

    const after = await readState(projectDir);
    expect(after.transitionHistory).toHaveLength(3);
    expect(after.transitionHistory[0]).toMatchObject({ fromState: 'plan', toState: 'execute' });
    expect(after.transitionHistory[1]).toMatchObject({ fromState: 'execute', toState: 'verify' });
    expect(after.transitionHistory[2]).toMatchObject({ fromState: 'verify', toState: 'complete' });
  });

  it('migrates state with missing stateSchemaVersion field (detectedVersion -1)', async () => {
    const noVersionState = {
      runId: 'run-001',
      workflowId: 'wf-test',
      workstream: null,
      currentState: 'plan',
      configSnapshotHash: 'abc123',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      transitionHistory: [],
      migration: { status: 'none' },
      resume: { status: 'active' },
      autoMode: { active: false, source: 'none' },
    };
    await seedState(projectDir, noVersionState);

    const result = await migrateFsmState({ projectDir });

    expect(result).toMatchObject({
      sourceVersion: -1,
      targetVersion: 1,
      entriesBackfilled: 0,
    });
    const after = await readState(projectDir);
    expect(after.stateSchemaVersion).toBe(1);
  });
});
