import { constants, unlinkSync } from 'node:fs';
import { open, readFile, writeFile, rename, unlink, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sortKeysDeep } from '../compile/baselines.js';
import { toPosixPath } from '../query/helpers.js';
import { relPlanningPath, validateWorkstreamName } from '../workstream-utils.js';
import { configSnapshotHash } from './routing.js';

export const CURRENT_FSM_STATE_SCHEMA_VERSION = 1 as const;

export type FsmStateErrorCode =
  | 'lock-conflict'
  | 'lock-stale'
  | 'read-failed'
  | 'write-failed'
  | 'schema-version-mismatch'
  | 'invalid-workstream';

export class FsmStateError extends Error {
  constructor(public readonly code: FsmStateErrorCode, message: string) {
    super(message);
    this.name = 'FsmStateError';
  }
}

export type FsmTransitionHistoryEntry = {
  timestamp: string;
  fromState: string;
  toState: string;
  runId: string;
  outcome: string;
  configSnapshotHash: string;
  reducedConfidence?: boolean;
  missingProvider?: string;
};

export type FsmRunState = {
  runId: string;
  stateSchemaVersion: typeof CURRENT_FSM_STATE_SCHEMA_VERSION;
  workflowId: string;
  workstream: string | null;
  currentState: string;
  configSnapshotHash: string;
  createdAt: string;
  updatedAt: string;
  transitionHistory: FsmTransitionHistoryEntry[];
  migration: { status: 'none' | 'migration-required' | 'resume-blocked' };
  resume: { status: 'new' | 'active' | 'suspended' | 'complete' };
  autoMode: { active: boolean; source: 'auto_chain' | 'auto_advance' | 'both' | 'none' };
};

export type FsmLockStatus = {
  holder: string | null;
  acquiredAt: string | null;
  ageSeconds: number | null;
  stale: boolean;
};

export const _heldFsmLocks = new Set<string>();

process.on('exit', () => {
  for (const lockPath of _heldFsmLocks) {
    try {
      unlinkSync(lockPath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        // Process exit cannot use async reporting; best effort cleanup only.
      }
    }
  }
});

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isExistingFileError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST';
}

function lockPathFor(fsmPath: string): string {
  return `${fsmPath}.lock`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeFileIfExists(path: string, code: FsmStateErrorCode): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw new FsmStateError(code, `Failed to remove file ${path}: ${String(error)}`);
    }
  }
}

async function removeStaleLockIfNeeded(lockPath: string): Promise<boolean> {
  const s = await stat(lockPath);
  if (Date.now() - s.mtimeMs <= 10000) {
    return false;
  }
  await removeFileIfExists(lockPath, 'lock-stale');
  return true;
}

export function fsmStatePath(projectDir: string, workstream?: string): string {
  if (workstream !== undefined && !validateWorkstreamName(workstream)) {
    throw new FsmStateError('invalid-workstream', `Invalid workstream name: ${workstream}`);
  }
  return toPosixPath(join(projectDir, relPlanningPath(workstream), 'fsm-state.json'));
}

export function createInitialFsmRunState(input: {
  runId: string;
  workflowId: string;
  workstream: string | null;
  currentState: string;
  config: unknown;
  now: string;
  autoMode?: FsmRunState['autoMode'];
}): FsmRunState {
  return {
    runId: input.runId,
    stateSchemaVersion: CURRENT_FSM_STATE_SCHEMA_VERSION,
    workflowId: input.workflowId,
    workstream: input.workstream,
    currentState: input.currentState,
    configSnapshotHash: configSnapshotHash(input.config),
    createdAt: input.now,
    updatedAt: input.now,
    transitionHistory: [],
    migration: { status: 'none' },
    resume: { status: 'new' },
    autoMode: input.autoMode ?? { active: false, source: 'none' },
  };
}

export async function acquireFsmLock(fsmPath: string): Promise<string> {
  const lockPath = lockPathFor(fsmPath);
  const maxRetries = 10;
  const retryDelayMs = 200;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fd = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      await fd.writeFile(String(process.pid));
      await fd.close();
      _heldFsmLocks.add(lockPath);
      return lockPath;
    } catch (error) {
      if (!isExistingFileError(error)) {
        throw new FsmStateError('lock-conflict', `Cannot acquire FSM lock: ${String(error)}`);
      }

      try {
        if (await removeStaleLockIfNeeded(lockPath)) {
          continue;
        }
      } catch (staleError) {
        if (staleError instanceof FsmStateError) {
          throw staleError;
        }
      }

      if (attempt === maxRetries - 1) {
        throw new FsmStateError('lock-conflict', `FSM lock conflict: ${lockPath}`);
      }
      await sleep(retryDelayMs);
    }
  }

  throw new FsmStateError('lock-conflict', `FSM lock conflict: ${lockPath}`);
}

export async function releaseFsmLock(lockPath: string): Promise<void> {
  _heldFsmLocks.delete(lockPath);
  await removeFileIfExists(lockPath, 'write-failed');
}

export async function readFsmLockStatus(fsmPath: string): Promise<FsmLockStatus> {
  const lockPath = lockPathFor(fsmPath);
  let holder: string;
  let acquiredAtMs: number;

  try {
    const [rawHolder, lockStat] = await Promise.all([
      readFile(lockPath, 'utf-8'),
      stat(lockPath),
    ]);
    holder = rawHolder.trim();
    acquiredAtMs = lockStat.mtimeMs;
  } catch (error) {
    if (isNotFoundError(error)) {
      return { holder: null, acquiredAt: null, ageSeconds: null, stale: false };
    }
    throw new FsmStateError('read-failed', `Failed to read FSM lock status: ${String(error)}`);
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - acquiredAtMs) / 1000));
  return {
    holder: holder || null,
    acquiredAt: new Date(acquiredAtMs).toISOString(),
    ageSeconds,
    stale: ageSeconds > 10,
  };
}

export async function writeFsmState(
  projectDir: string,
  workstream: string | undefined,
  state: FsmRunState,
  options?: { syncStateMd?: () => Promise<void> },
): Promise<void> {
  if (state.stateSchemaVersion !== CURRENT_FSM_STATE_SCHEMA_VERSION) {
    throw new FsmStateError(
      'schema-version-mismatch',
      `Unsupported FSM state schema version: ${state.stateSchemaVersion}`,
    );
  }

  const path = fsmStatePath(projectDir, workstream);
  const tmpPath = `${path}.${process.pid}.tmp`;
  let lockPath: string | null = null;

  try {
    await mkdir(dirname(path), { recursive: true });
    lockPath = await acquireFsmLock(path);
    await writeFile(tmpPath, `${JSON.stringify(sortKeysDeep(state), null, 2)}\n`, 'utf-8');
    await rename(tmpPath, path);
    await options?.syncStateMd?.();
  } catch (error) {
    if (error instanceof FsmStateError) {
      throw error;
    }
    await removeFileIfExists(tmpPath, 'write-failed');
    throw new FsmStateError('write-failed', `Failed to write FSM state: ${String(error)}`);
  } finally {
    if (lockPath !== null) {
      await releaseFsmLock(lockPath);
    }
  }
}
