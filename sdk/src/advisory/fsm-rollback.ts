import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  CURRENT_FSM_STATE_SCHEMA_VERSION,
  FsmStateError,
  acquireFsmLock,
  fsmStatePath,
  parseFsmRunState,
  releaseFsmLock,
  writeFsmState,
  type FsmRunState,
  type FsmTransitionHistoryEntry,
} from './fsm-state.js';
import type { AdvisoryControlEvent, ResumeBlockedEvent, RollbackBlockedEvent } from './control-events.js';

// ============================================================
// Result types
// ============================================================

export type FsmRollbackResult = {
  rollbackToEntryId: string;
  rolledBackEntryIds: string[];
};

export type FsmMigrateResult = {
  sourceVersion: number;
  targetVersion: number;
  entriesBackfilled: number;
};

export type FsmAlreadyCurrentResult = {
  kind: 'already-current';
};

// ============================================================
// Internal helpers
// ============================================================

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function checkStateInitialized(statePath: string): Promise<void> {
  try {
    await stat(dirname(statePath));
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new FsmStateError('init-required', 'FSM state is not initialized; run fsm.state.init first');
    }
    throw new FsmStateError('read-failed', `Failed to inspect FSM state directory: ${String(error)}`);
  }
}

// ============================================================
// rollbackFsmState
// ============================================================

export async function rollbackFsmState(
  input: { projectDir: string; workstream?: string },
): Promise<FsmRollbackResult | RollbackBlockedEvent> {
  const path = fsmStatePath(input.projectDir, input.workstream);
  await checkStateInitialized(path);

  let lockPath: string | null = null;
  try {
    lockPath = await acquireFsmLock(path);

    let raw: string;
    try {
      raw = await readFile(path, 'utf-8');
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new FsmStateError('init-required', 'FSM state is not initialized; run fsm.state.init first');
      }
      throw new FsmStateError('read-failed', `Failed to read FSM state file: ${String(error)}`);
    }
    const state = parseFsmRunState(raw);

    // Find last checkpoint entry (reverse scan)
    const history = state.transitionHistory;
    let checkpointIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]!.checkpoint === true) {
        checkpointIdx = i;
        break;
      }
    }

    if (checkpointIdx === -1) {
      return {
        kind: 'control',
        event: 'rollback-blocked',
        statePath: path,
        reason: 'no-checkpoint',
      } satisfies RollbackBlockedEvent;
    }

    const checkpointEntry = history[checkpointIdx]!;
    const rolledBackEntryIds = history
      .slice(checkpointIdx + 1)
      .map((entry) => entry.entryId);

    const now = new Date().toISOString();
    const rollbackEntry: FsmTransitionHistoryEntry = {
      entryId: randomUUID(),
      timestamp: now,
      fromState: state.currentState,
      toState: checkpointEntry.toState,
      runId: state.runId,
      outcome: 'rollback',
      configSnapshotHash: state.configSnapshotHash,
      rollbackEntry: {
        rollbackToEntryId: checkpointEntry.entryId,
        rolledBackEntryIds,
      },
    };

    const updatedState: FsmRunState = {
      ...state,
      currentState: checkpointEntry.toState,
      transitionHistory: [...state.transitionHistory, rollbackEntry],
      updatedAt: now,
    };

    await writeFsmState(input.projectDir, input.workstream, updatedState, { heldLockPath: lockPath });

    return {
      rollbackToEntryId: checkpointEntry.entryId,
      rolledBackEntryIds,
    };
  } finally {
    if (lockPath !== null) {
      await releaseFsmLock(lockPath);
    }
  }
}

// ============================================================
// migrateFsmState
// ============================================================

export async function migrateFsmState(
  input: { projectDir: string; workstream?: string },
): Promise<FsmMigrateResult | FsmAlreadyCurrentResult | AdvisoryControlEvent> {
  const path = fsmStatePath(input.projectDir, input.workstream);
  await checkStateInitialized(path);

  let lockPath: string | null = null;
  try {
    lockPath = await acquireFsmLock(path);

    let raw: string;
    try {
      raw = await readFile(path, 'utf-8');
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new FsmStateError('init-required', 'FSM state is not initialized; run fsm.state.init first');
      }
      throw new FsmStateError('read-failed', `Failed to read FSM state file: ${String(error)}`);
    }

    // Parse raw JSON directly — do NOT call parseFsmRunState (it would reject old versions)
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      throw new FsmStateError('read-failed', `Failed to parse FSM state file: ${String(error)}`);
    }

    const detectedVersion = typeof parsed.stateSchemaVersion === 'number'
      ? parsed.stateSchemaVersion
      : -1;

    if (detectedVersion === CURRENT_FSM_STATE_SCHEMA_VERSION) {
      return { kind: 'already-current' };
    }

    if (detectedVersion > CURRENT_FSM_STATE_SCHEMA_VERSION) {
      return {
        kind: 'control',
        event: 'resume-blocked',
        statePath: path,
        detectedVersion,
        currentVersion: CURRENT_FSM_STATE_SCHEMA_VERSION,
      } satisfies ResumeBlockedEvent;
    }

    // detectedVersion < CURRENT: perform migration
    // Backfill missing entryIds on all history entries
    const rawHistory = Array.isArray(parsed.transitionHistory)
      ? (parsed.transitionHistory as Record<string, unknown>[])
      : [];

    let entriesBackfilled = 0;
    const migratedHistory: FsmTransitionHistoryEntry[] = rawHistory.map((entry) => {
      if (typeof entry.entryId !== 'string' || entry.entryId.trim() === '') {
        entriesBackfilled++;
        return { ...entry, entryId: randomUUID() } as FsmTransitionHistoryEntry;
      }
      return entry as FsmTransitionHistoryEntry;
    });

    // Produce new immutable state with schema version upgraded
    const migratedState: FsmRunState = {
      ...(parsed as unknown as FsmRunState),
      stateSchemaVersion: CURRENT_FSM_STATE_SCHEMA_VERSION,
      transitionHistory: migratedHistory,
    };

    await writeFsmState(input.projectDir, input.workstream, migratedState, { heldLockPath: lockPath });

    return {
      sourceVersion: detectedVersion,
      targetVersion: CURRENT_FSM_STATE_SCHEMA_VERSION,
      entriesBackfilled,
    };
  } finally {
    if (lockPath !== null) {
      await releaseFsmLock(lockPath);
    }
  }
}
