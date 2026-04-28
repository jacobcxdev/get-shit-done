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
  | 'invalid-workstream'
  | 'transition-rejected'
  | 'init-required';

export class FsmStateError extends Error {
  constructor(
    public readonly code: FsmStateErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
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
  missingProviders?: string[];
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

export type FsmTransitionInput = {
  projectDir: string;
  workstream?: string;
  toState: string;
  outcome: string;
  configSnapshotHash?: string;
  providerMetadata?: {
    reducedConfidence?: boolean;
    missingProvider?: string;
    missingProviders?: string[];
  };
};

export type FsmTransitionResult = {
  timestamp: string;
  fromState: string;
  toState: string;
  runId: string;
  outcome: string;
  workflowId: string;
  workstream: string | null;
  configSnapshotHash: string;
  reducedConfidence?: boolean;
  missingProviders?: string[];
};

export const MUTABLE_PHASE_FIELDS = new Set<string>([
  'currentState',
]);

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

async function throwIfStaleLock(lockPath: string): Promise<void> {
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
      return;
    }
    throw new FsmStateError('read-failed', `Failed to read FSM lock status: ${String(error)}`);
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - acquiredAtMs) / 1000));
  if (ageSeconds > 10) {
    throw new FsmStateError('lock-stale', `FSM lock is stale: ${lockPath}`, {
      holder: holder || null,
      ageSeconds,
    });
  }
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

function sortFsmStateForWrite(state: FsmRunState): FsmRunState {
  return {
    ...(sortKeysDeep(state) as FsmRunState),
    transitionHistory: state.transitionHistory.map((entry) => sortKeysDeep(entry) as FsmTransitionHistoryEntry),
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
        await throwIfStaleLock(lockPath);
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
  options?: { syncStateMd?: () => Promise<void>; heldLockPath?: string },
): Promise<void> {
  if (state.stateSchemaVersion !== CURRENT_FSM_STATE_SCHEMA_VERSION) {
    throw new FsmStateError(
      'schema-version-mismatch',
      `Unsupported FSM state schema version: ${state.stateSchemaVersion}`,
    );
  }

  const path = fsmStatePath(projectDir, workstream);
  const tmpPath = `${path}.${process.pid}.tmp`;
  const usesHeldLock = options?.heldLockPath !== undefined;
  let lockPath: string | null = options?.heldLockPath ?? null;

  try {
    await mkdir(dirname(path), { recursive: true });
    if (!usesHeldLock) {
      lockPath = await acquireFsmLock(path);
    }
    await writeFile(tmpPath, `${JSON.stringify(sortFsmStateForWrite(state), null, 2)}\n`, 'utf-8');
    await rename(tmpPath, path);
    await options?.syncStateMd?.();
  } catch (error) {
    if (error instanceof FsmStateError) {
      throw error;
    }
    await removeFileIfExists(tmpPath, 'write-failed');
    throw new FsmStateError('write-failed', `Failed to write FSM state: ${String(error)}`);
  } finally {
    if (!usesHeldLock && lockPath !== null) {
      await releaseFsmLock(lockPath);
    }
  }
}

async function assertFsmStateInitialized(path: string): Promise<void> {
  try {
    await stat(dirname(path));
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new FsmStateError('init-required', 'FSM state is not initialized; run fsm.state.init first');
    }
    throw new FsmStateError('read-failed', `Failed to inspect FSM state directory: ${String(error)}`);
  }
}

async function readExistingFsmState(path: string): Promise<FsmRunState> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new FsmStateError('init-required', 'FSM state is not initialized; run fsm.state.init first');
    }
    throw new FsmStateError('read-failed', `Failed to read FSM state file: ${String(error)}`);
  }

  try {
    const parsed = JSON.parse(raw) as FsmRunState;
    if (parsed.stateSchemaVersion !== CURRENT_FSM_STATE_SCHEMA_VERSION) {
      throw new FsmStateError(
        'schema-version-mismatch',
        `Unsupported FSM state schema version: ${parsed.stateSchemaVersion}`,
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof FsmStateError) {
      throw error;
    }
    throw new FsmStateError('read-failed', `Failed to parse FSM state file: ${String(error)}`);
  }
}

function transitionRejected(
  state: FsmRunState,
  attemptedToState: string,
  message: string,
): FsmStateError {
  return new FsmStateError('transition-rejected', message, {
    fromState: state.currentState,
    attemptedToState,
    runId: state.runId,
  });
}

export async function advanceFsmState(input: FsmTransitionInput): Promise<FsmTransitionResult> {
  const path = fsmStatePath(input.projectDir, input.workstream);
  await assertFsmStateInitialized(path);

  let lockPath: string | null = null;
  try {
    lockPath = await acquireFsmLock(path);
    const state = await readExistingFsmState(path);

    if (input.workstream !== undefined && input.workstream.trim() === '') {
      throw transitionRejected(state, input.toState, 'workstream, toState and outcome required for fsm.transition');
    }
    if (input.toState.trim() === '' || input.outcome.trim() === '') {
      throw transitionRejected(state, input.toState, 'toState and outcome required for fsm.transition');
    }

    const timestamp = new Date().toISOString();
    const fromState = state.currentState;
    const configHash = input.configSnapshotHash ?? state.configSnapshotHash;
    const missingProviders = input.providerMetadata?.missingProviders
      ?? (input.providerMetadata?.missingProvider ? [input.providerMetadata.missingProvider] : undefined);
    const entry: FsmTransitionHistoryEntry = {
      timestamp,
      fromState,
      toState: input.toState,
      runId: state.runId,
      outcome: input.outcome,
      configSnapshotHash: configHash,
    };

    if (input.providerMetadata?.reducedConfidence !== undefined) {
      entry.reducedConfidence = input.providerMetadata.reducedConfidence;
    }
    if (input.providerMetadata?.missingProvider) {
      entry.missingProvider = input.providerMetadata.missingProvider;
    }
    if (missingProviders && missingProviders.length > 0) {
      entry.missingProviders = missingProviders;
    }

    state.transitionHistory = [...state.transitionHistory, entry];
    state.currentState = input.toState;
    state.configSnapshotHash = configHash;
    state.updatedAt = timestamp;

    await writeFsmState(input.projectDir, input.workstream, state, { heldLockPath: lockPath });

    return {
      timestamp,
      fromState,
      toState: input.toState,
      runId: state.runId,
      outcome: input.outcome,
      workflowId: state.workflowId,
      workstream: input.workstream ?? null,
      configSnapshotHash: configHash,
      ...(entry.reducedConfidence !== undefined ? { reducedConfidence: entry.reducedConfidence } : {}),
      ...(entry.missingProviders ? { missingProviders: entry.missingProviders } : {}),
    };
  } finally {
    if (lockPath !== null) {
      await releaseFsmLock(lockPath);
    }
  }
}
