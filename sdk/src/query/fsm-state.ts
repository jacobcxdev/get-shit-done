import { readFile } from 'node:fs/promises';
import {
  CURRENT_FSM_STATE_SCHEMA_VERSION,
  FsmStateError,
  MUTABLE_PHASE_FIELDS,
  advanceFsmState,
  type FsmTransitionInput,
  type FsmRunState,
  createInitialFsmRunState,
  fsmStatePath,
  parseFsmRunState,
  readFsmLockStatus,
  writeFsmState,
} from '../advisory/fsm-state.js';
import { deriveConfidenceFromHistory } from '../advisory/provider-availability.js';
import { loadConfig } from '../config.js';
import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';

type AutoModeSource = FsmRunState['autoMode']['source'];
type ResumeStatus = FsmRunState['resume']['status'];

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

function parsePhaseEditActive(value: string | undefined): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new GSDError('autoMode.active must be true or false', ErrorClassification.Validation);
}

function parsePhaseEditSource(value: string | undefined): AutoModeSource {
  if (value === 'auto_chain' || value === 'auto_advance' || value === 'both' || value === 'none') {
    return value;
  }
  throw new GSDError(
    'autoMode.source must be auto_chain, auto_advance, both, or none',
    ErrorClassification.Validation,
  );
}

function parseResumeStatus(value: string | undefined): ResumeStatus {
  if (value === 'new' || value === 'active' || value === 'suspended' || value === 'complete') {
    return value;
  }
  throw new GSDError(
    'resume.status must be new, active, suspended, or complete',
    ErrorClassification.Validation,
  );
}

function parsePhaseEditArgs(
  args: string[],
  workstream: string | undefined,
): { target: string | undefined; field: string | undefined; value: string | undefined } {
  if (args.length >= 3) {
    const [workstreamArg, field, value] = args;
    return { target: targetWorkstream(undefined, workstreamArg), field, value };
  }
  const [field, value] = args;
  return { target: workstream, field, value };
}

function parseProviderMetadata(value: string | undefined): FsmTransitionInput['providerMetadata'] | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new GSDError(
      `providerMetadata must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ErrorClassification.Validation,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new GSDError('providerMetadata must be a JSON object', ErrorClassification.Validation);
  }

  const record = parsed as Record<string, unknown>;
  const providerConfidence = record.providerConfidence;
  const missingProviders = record.missingProviders;
  if (
    providerConfidence !== 'full' &&
    providerConfidence !== 'reduced' &&
    providerConfidence !== 'blocked'
  ) {
    throw new GSDError(
      'providerMetadata.providerConfidence must be full, reduced, or blocked',
      ErrorClassification.Validation,
    );
  }
  if (
    !Array.isArray(missingProviders) ||
    !missingProviders.every((provider): provider is string => typeof provider === 'string')
  ) {
    throw new GSDError(
      'providerMetadata.missingProviders must be an array of provider names',
      ErrorClassification.Validation,
    );
  }

  return {
    providerConfidence,
    missingProviders,
  };
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

  return parseFsmRunState(raw, CURRENT_FSM_STATE_SCHEMA_VERSION);
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

export const fsmRunId: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const path = fsmStatePath(projectDir, target);
  const parsed = await readState(path);
  return { data: { runId: parsed.runId, workstream: target ?? null } };
};

export const fsmTransition: QueryHandler = async (args, projectDir, workstream) => {
  const [workstreamArg, toState, outcome, providerMetadataJson] = args;
  if (args.length < 3 || toState === undefined || outcome === undefined) {
    throw new GSDError(
      'workstream, toState and outcome required for fsm.transition',
      ErrorClassification.Validation,
    );
  }

  const target = targetWorkstream(workstream, workstreamArg);
  const result = await advanceFsmState({
    projectDir,
    workstream: target,
    toState,
    outcome,
    providerMetadata: parseProviderMetadata(providerMetadataJson),
  });
  return { data: result };
};

export const fsmHistory: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const parsed = await readState(fsmStatePath(projectDir, target));
  return { data: { history: parsed.transitionHistory, workstream: target ?? null } };
};

export const fsmConfidence: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  const parsed = await readState(fsmStatePath(projectDir, target));
  return { data: { confidence: deriveConfidenceFromHistory(parsed.transitionHistory), workstream: target ?? null } };
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

  const updatedState: FsmRunState = {
    ...state,
    autoMode: { ...state.autoMode, active, source },
    updatedAt: new Date().toISOString(),
  };
  await writeFsmState(projectDir, target, updatedState);

  return { data: { active, source, workstream: target ?? null } };
};

export const lockStatus: QueryHandler = async (args, projectDir, workstream) => {
  const target = targetWorkstream(workstream, args[0]);
  return { data: await readFsmLockStatus(fsmStatePath(projectDir, target)) };
};

export const phaseEdit: QueryHandler = async (args, projectDir, workstream) => {
  const { target, field, value } = parsePhaseEditArgs(args, workstream);
  if (!field || value === undefined) {
    throw new GSDError('field and value required for phase.edit', ErrorClassification.Validation);
  }
  if (!MUTABLE_PHASE_FIELDS.has(field)) {
    throw new GSDError(`field '${field}' is not an editable phase field`, ErrorClassification.Validation);
  }

  const path = fsmStatePath(projectDir, target);
  const state = await readState(path);
  let parsedValue: string | boolean = value;
  let updatedState: FsmRunState;
  const updatedAt = new Date().toISOString();
  if (field === 'currentState') {
    updatedState = {
      ...state,
      currentState: value,
      updatedAt,
    };
  } else if (field === 'resume.status') {
    const resumeStatus = parseResumeStatus(value);
    parsedValue = resumeStatus;
    updatedState = {
      ...state,
      resume: { ...state.resume, status: resumeStatus },
      updatedAt,
    };
  } else if (field === 'autoMode.active') {
    parsedValue = parsePhaseEditActive(value);
    updatedState = {
      ...state,
      autoMode: { ...state.autoMode, active: parsedValue },
      updatedAt,
    };
  } else if (field === 'autoMode.source') {
    const source = parsePhaseEditSource(value);
    parsedValue = source;
    updatedState = {
      ...state,
      autoMode: { ...state.autoMode, source },
      updatedAt,
    };
  } else {
    throw new GSDError(`field '${field}' is not an editable phase field`, ErrorClassification.Validation);
  }
  await writeFsmState(projectDir, target, updatedState);

  return { data: { field, value: parsedValue, workstream: target ?? null } };
};
