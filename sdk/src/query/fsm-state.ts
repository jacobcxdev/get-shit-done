import { readFile } from 'node:fs/promises';
import {
  CURRENT_FSM_STATE_SCHEMA_VERSION,
  FsmStateError,
  type FsmRunState,
  createInitialFsmRunState,
  fsmStatePath,
  readFsmLockStatus,
  writeFsmState,
} from '../advisory/fsm-state.js';
import { loadConfig } from '../config.js';
import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';

type AutoModeSource = FsmRunState['autoMode']['source'];

function targetWorkstream(workstream: string | undefined, arg: string | undefined): string | undefined {
  return workstream ?? (arg && arg.length > 0 ? arg : undefined);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function parseAutoModeSource(value: string | undefined): AutoModeSource {
  if (value === 'auto_chain' || value === 'auto_advance' || value === 'both' || value === 'none') {
    return value;
  }
  throw new GSDError('source must be auto_chain, auto_advance, both, or none', ErrorClassification.Validation);
}

function parseActive(value: string | undefined): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new GSDError('active must be true or false', ErrorClassification.Validation);
}

async function readState(path: string): Promise<FsmRunState> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new FsmStateError('read-failed', `FSM state file not found: ${path}`);
    }
    throw new FsmStateError('read-failed', `Failed to read FSM state file: ${String(error)}`);
  }

  try {
    return JSON.parse(raw) as FsmRunState;
  } catch (error) {
    throw new FsmStateError('read-failed', `Failed to parse FSM state file: ${String(error)}`);
  }
}

async function readStateIfPresent(path: string): Promise<FsmRunState | null> {
  try {
    return await readState(path);
  } catch (error) {
    if (error instanceof FsmStateError && error.code === 'read-failed' && error.message.includes('not found')) {
      return null;
    }
    throw error;
  }
}

export const fsmStateRead: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const path = fsmStatePath(projectDir, target);
  const parsed = await readState(path);
  return { data: parsed };
};

export const fsmStateInit: QueryHandler = async (args, projectDir, workstream) => {
  const [runId, workflowId, currentState] = args;
  if (!runId || !workflowId || !currentState) {
    throw new GSDError('runId, workflowId, and currentState required for fsm state init', ErrorClassification.Validation);
  }

  const target = targetWorkstream(workstream, args[3]);
  const config = await loadConfig(projectDir, target);
  const path = fsmStatePath(projectDir, target);
  const state = createInitialFsmRunState({
    runId,
    workflowId,
    workstream: target ?? null,
    currentState,
    config,
    now: new Date().toISOString(),
  });
  await writeFsmState(projectDir, target, state);

  return {
    data: {
      path,
      runId,
      stateSchemaVersion: CURRENT_FSM_STATE_SCHEMA_VERSION,
      workstream: target ?? null,
      currentState,
    },
  };
};

export const fsmAutoModeSet: QueryHandler = async (args, projectDir, workstream) => {
  const active = parseActive(args[0]);
  const source = parseAutoModeSource(args[1]);
  const target = targetWorkstream(workstream, args[2]);
  const path = fsmStatePath(projectDir, target);
  const config = await loadConfig(projectDir, target);
  const existing = await readStateIfPresent(path);
  const state = existing ?? createInitialFsmRunState({
    runId: 'auto-mode',
    workflowId: 'auto-mode',
    workstream: target ?? null,
    currentState: 'auto-mode',
    config,
    now: new Date().toISOString(),
  });

  state.autoMode = { active, source };
  state.updatedAt = new Date().toISOString();
  await writeFsmState(projectDir, target, state);

  return { data: { active, source, workstream: target ?? null } };
};

export const lockStatus: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  return { data: await readFsmLockStatus(fsmStatePath(projectDir, target)) };
};
