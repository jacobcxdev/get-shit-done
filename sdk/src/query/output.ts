import { FsmStateError } from '../advisory/fsm-state.js';
import { normalizeProviderList, renderConfidence } from '../advisory/provider-availability.js';
import { GSDError, exitCodeFor } from '../errors.js';

export type FormattedQueryOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type FormatQueryOutputInput = {
  command: string;
  args: string[];
  result?: unknown;
  error?: unknown;
};

type JsonRecord = Record<string, unknown>;

type ErrorEnvelope = {
  code: string;
  message: string;
  recoveryHint: string;
  [key: string]: unknown;
};

const INVALID_TRANSITION_RECOVERY =
  "Run 'gsd-sdk query fsm.history <workstream>' to see the current state, then choose a valid next state";
const PROVIDER_BLOCKED_RECOVERY =
  "Restore provider access or use 'gsd-sdk query fsm.transition <workstream> <toState> blocked' to record a blocked outcome";
const LOCK_STALE_RECOVERY =
  'Run `gsd-sdk query lock.status <workstream>` to inspect the lock, then release manually if the holder process is no longer active';
const INIT_REQUIRED_RECOVERY = 'Run `gsd-sdk init` to initialise the project and create the `.planning/` directory';
const FIELD_NOT_EDITABLE_RECOVERY =
  "Run 'gsd-sdk query phase.edit --list-fields' to see editable fields";
const RUNTIME_EVENT_ERROR_CODES = new Set([
  'WORKTREE_REQUIRED',
  'COMPLETION_MARKER_MISSING',
  'COMPLETION_MARKER_ABSENT',
]);

function canonicalCommand(command: string): string {
  return command.trim().replace(/\s+/g, '.');
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function isControlEvent(value: unknown): boolean {
  const r = asRecord(value);
  return r.kind === 'control' && typeof r.event === 'string';
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function scalar(value: unknown): FormattedQueryOutput {
  return {
    stdout: `${String(value ?? '')}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeMissingProviders(record: JsonRecord): string[] {
  return normalizeProviderList([
    ...stringArray(record.missingProviders),
    ...(typeof record.missingProvider === 'string' ? [record.missingProvider] : []),
    ...stringArray(record.blockedProviders),
  ]);
}

function historyEntries(result: unknown): JsonRecord[] {
  if (Array.isArray(result)) {
    return result.filter((entry): entry is JsonRecord => typeof entry === 'object' && entry !== null && !Array.isArray(entry));
  }
  const record = asRecord(result);
  return Array.isArray(record.history)
    ? record.history.filter((entry): entry is JsonRecord => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    : [];
}

function formatHistory(result: unknown): FormattedQueryOutput {
  return {
    stdout: json(historyEntries(result).map((entry) => {
      const missingProviders = normalizeMissingProviders(entry);
      return {
        timestamp: entry.timestamp,
        fromState: entry.fromState,
        toState: entry.toState,
        runId: entry.runId,
        outcome: entry.outcome,
        configSnapshotHash: entry.configSnapshotHash,
        reducedConfidence: entry.reducedConfidence === true,
        missingProviders,
      };
    })),
    stderr: '',
    exitCode: 0,
  };
}

function formatTransition(result: unknown): FormattedQueryOutput {
  const record = asRecord(result);
  const missingProviders = normalizeMissingProviders(record);
  const reducedConfidence = record.reducedConfidence === true || record.providerConfidence === 'reduced';
  const payload = {
    ok: true,
    fromState: record.fromState,
    toState: record.toState,
    runId: record.runId,
    outcome: record.outcome,
    timestamp: record.timestamp,
    configSnapshotHash: record.configSnapshotHash,
    reducedConfidence,
    missingProviders,
  };
  const warn = reducedConfidence && missingProviders.length > 0
    ? [
        ...missingProviders.map(provider =>
          `[WARN] PROVIDER_REDUCED: ${provider} unavailable — continuing with reduced confidence`),
        `  missing: ${missingProviders.join(',')}`,
        `  confidence: ${renderConfidence('reduced', missingProviders)}`,
      ]
    : [];
  const ok = `[OK] FSMTransition: ${String(record.fromState ?? '')} → ${String(record.toState ?? '')} (outcome: ${String(record.outcome ?? '')})`;

  return {
    stdout: json(payload),
    stderr: `${[...warn, ok].join('\n')}\n`,
    exitCode: 0,
  };
}

function formatPhaseEdit(result: unknown): FormattedQueryOutput {
  const record = asRecord(result);
  const payload = {
    ok: true,
    workstream: record.workstream ?? null,
    field: record.field,
    previousValue: record.previousValue,
    newValue: record.newValue ?? record.value,
    timestamp: record.timestamp,
  };
  return {
    stdout: json(payload),
    stderr: `[OK] PhaseEdit: ${String(payload.field ?? '')} → ${String(payload.newValue ?? '')}\n`,
    exitCode: 0,
  };
}

function formatThreadSession(result: unknown): FormattedQueryOutput {
  const record = asRecord(result);
  return {
    stdout: json({
      sessionId: record.sessionId,
      threadId: record.threadId ?? record.runId ?? record.sessionId,
      workstream: record.workstream ?? null,
      startedAt: record.startedAt ?? record.createdAt,
    }),
    stderr: '',
    exitCode: 0,
  };
}

function fieldFromPhaseEditArgs(args: string[]): string {
  return args.length >= 3 ? String(args[1] ?? '') : String(args[0] ?? '');
}

function detailsFromError(error: unknown): JsonRecord {
  if (error instanceof FsmStateError) {
    return error.details;
  }
  return asRecord(error);
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function upperSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s.]+/g, '_')
    .toUpperCase();
}

function runtimeEventEnvelope(error: JsonRecord): ErrorEnvelope | null {
  if (
    typeof error.code !== 'string' ||
    (!RUNTIME_EVENT_ERROR_CODES.has(error.code) && !/^[A-Z0-9_]+$/.test(error.code))
  ) return null;
  const { code, message, recoveryHint, type, timestamp, sessionId, ...rest } = error;
  return {
    code,
    message: typeof message === 'string' ? message : code,
    recoveryHint: typeof recoveryHint === 'string' ? recoveryHint : 'Inspect the event payload and retry',
    ...rest,
  };
}

function fsmErrorEnvelope(command: string, args: string[], error: FsmStateError): ErrorEnvelope {
  const details = detailsFromError(error);
  if (error.code === 'transition-rejected') {
    return {
      code: 'INVALID_TRANSITION',
      message: error.message,
      recoveryHint: INVALID_TRANSITION_RECOVERY,
      fromState: details.fromState ?? null,
      toState: details.attemptedToState ?? args[1] ?? null,
      workflowId: details.workflowId ?? null,
    };
  }
  if (error.code === 'lock-stale') {
    const holder = typeof details.holder === 'string' ? details.holder : null;
    const ageSeconds = typeof details.ageSeconds === 'number' ? details.ageSeconds : null;
    return {
      code: 'LOCK_STALE',
      message: `FSM lock held by '${holder ?? 'unknown'}' for ${ageSeconds ?? 0} seconds`,
      recoveryHint: LOCK_STALE_RECOVERY,
      holder,
      ageSeconds,
      workflowId: details.workflowId ?? null,
    };
  }
  if (error.code === 'init-required' || (error.code === 'read-failed' && /not found/i.test(error.message))) {
    return {
      code: 'INIT_REQUIRED',
      message: '.planning/ directory not found',
      recoveryHint: INIT_REQUIRED_RECOVERY,
      missingPath: '.planning/',
    };
  }
  return {
    code: upperSnake(error.code),
    message: error.message,
    recoveryHint: command.startsWith('fsm.') ? INVALID_TRANSITION_RECOVERY : 'Review the error and retry',
  };
}

function gsdErrorEnvelope(command: string, args: string[], error: GSDError): ErrorEnvelope {
  if (canonicalCommand(command) === 'phase.edit' && /editable phase field|allowlist/.test(error.message)) {
    const field = fieldFromPhaseEditArgs(args);
    return {
      code: 'FIELD_NOT_EDITABLE',
      message: `field '${field}' is not in the phase edit allowlist`,
      recoveryHint: FIELD_NOT_EDITABLE_RECOVERY,
      field,
      workflowId: null,
      stepId: null,
    };
  }
  if (canonicalCommand(command) === 'fsm.transition') {
    return {
      code: 'INVALID_TRANSITION',
      message: error.message,
      recoveryHint: INVALID_TRANSITION_RECOVERY,
      fromState: null,
      toState: args[1] ?? null,
      workflowId: null,
    };
  }
  return {
    code: upperSnake(error.classification),
    message: error.message,
    recoveryHint: 'Review the command arguments and retry',
  };
}

function errorEnvelope(command: string, args: string[], error: unknown): ErrorEnvelope {
  const runtime = runtimeEventEnvelope(asRecord(error));
  if (runtime) return runtime;
  if (error instanceof FsmStateError) return fsmErrorEnvelope(command, args, error);
  if (error instanceof GSDError) return gsdErrorEnvelope(command, args, error);
  return {
    code: 'RUNTIME_ERROR',
    message: messageFromError(error),
    recoveryHint: 'Review the error output and retry',
  };
}

function errorExitCode(error: unknown): number {
  if (error instanceof GSDError) {
    return exitCodeFor(error.classification);
  }
  return 1;
}

function formatError(input: FormatQueryOutputInput): FormattedQueryOutput {
  const error = input.error;
  const envelope = errorEnvelope(input.command, input.args, error);
  return {
    stdout: json({ ok: false, error: envelope }),
    stderr: `[ERROR] ${envelope.code}: ${envelope.message}\n  → ${envelope.recoveryHint}\n`,
    exitCode: errorExitCode(error),
  };
}

export function isUiContractedQueryCommand(command: string): boolean {
  return new Set([
    'fsm.state',
    'fsm.run-id',
    'fsm.confidence',
    'fsm.history',
    'fsm.transition',
    'phase.edit',
    'thread.id',
    'thread.workstream',
    'thread.session',
    'runtime.event',
  ]).has(canonicalCommand(command));
}

export function isStructuredUiContractedQueryCommand(command: string): boolean {
  return new Set(['fsm.history', 'fsm.transition', 'phase.edit', 'thread.session', 'runtime.event'])
    .has(canonicalCommand(command));
}

export function formatQueryOutput(input: FormatQueryOutputInput): FormattedQueryOutput {
  if (input.error !== undefined) {
    return formatError(input);
  }

  const command = canonicalCommand(input.command);
  const result = input.result;
  const record = asRecord(result);

  if (command === 'fsm.state') {
    if (isControlEvent(result)) return { stdout: json(result), stderr: '', exitCode: 0 };
    return scalar(record.currentState ?? result);
  }
  if (command === 'fsm.run-id') {
    if (isControlEvent(result)) return { stdout: json(result), stderr: '', exitCode: 0 };
    return scalar(record.runId ?? result);
  }
  if (command === 'fsm.confidence') {
    if (isControlEvent(result)) return { stdout: json(result), stderr: '', exitCode: 0 };
    return scalar(record.confidence ?? result);
  }
  if (command === 'thread.id') return scalar(record.threadId ?? result);
  if (command === 'thread.workstream') return scalar(record.workstream ?? result);
  if (command === 'thread.session') return formatThreadSession(result);
  if (command === 'fsm.history') {
    if (isControlEvent(result)) return { stdout: json(result), stderr: '', exitCode: 0 };
    return formatHistory(result);
  }
  if (command === 'fsm.transition') return formatTransition(result);
  if (command === 'phase.edit') return formatPhaseEdit(result);

  return {
    stdout: json(result),
    stderr: '',
    exitCode: 0,
  };
}
