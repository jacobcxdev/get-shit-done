import { readFile } from 'node:fs/promises';
import { FsmStateError, fsmStatePath, type FsmRunState } from '../advisory/fsm-state.js';
import type { QueryHandler } from './utils.js';

function targetWorkstream(workstream: string | undefined, arg: string | undefined): string | undefined {
  return workstream ?? (arg && arg.length > 0 ? arg : undefined);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function readThreadState(projectDir: string, workstream: string | undefined): Promise<FsmRunState> {
  const path = fsmStatePath(projectDir, workstream);
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

export const threadId: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const state = await readThreadState(projectDir, target);
  return { data: { threadId: state.thread?.id ?? state.runId, workstream: target ?? null } };
};

export const threadWorkstream: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const state = await readThreadState(projectDir, target);
  return { data: { workstream: state.workstream, runId: state.runId } };
};

export const threadSession: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const state = await readThreadState(projectDir, target);
  return {
    data: {
      sessionId: state.thread?.sessionId ?? state.runId,
      runId: state.runId,
      workstream: target ?? null,
    },
  };
};
