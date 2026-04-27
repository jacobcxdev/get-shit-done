/**
 * Advisory packet contract and guards for the SDK advisory layer.
 * No external imports - pure type declarations and runtime checks only.
 */

export const CURRENT_ADVISORY_PACKET_SCHEMA_VERSION = 1 as const;

export type AdvisoryExecutionConstraints = {
  run_in_background?: false;
  foregroundOnly?: boolean;
  timeoutSeconds?: number;
  provider?: 'claude' | 'codex' | 'gemini';
};

export type AdvisoryPacket = {
  /** Version of the advisory packet schema used to validate this packet. */
  schemaVersion: typeof CURRENT_ADVISORY_PACKET_SCHEMA_VERSION;
  /** Stable execution run identifier used to connect packet reports to run state. */
  runId: string;
  /** Workflow identifier that owns this packet. */
  workflowId: string;
  /** FSM state identifier that emitted this packet. */
  stateId: string;
  /** Atomic workflow step identifier represented by this packet. */
  stepId: string;
  /** Human-readable goal for the single packet action. */
  goal: string;
  /** Runtime instruction for exactly one atomic action. */
  instruction: string;
  /** Context references the runtime must load before executing the instruction. */
  requiredContext: string[];
  /** Tool names the runtime may use while executing this packet. */
  allowedTools: string[];
  /** Agent identifiers that may execute this packet. */
  agents: string[];
  /** Evidence strings or artifact paths expected in the runtime report. */
  expectedEvidence: string[];
  /** Report outcomes accepted by the FSM transition handler. */
  allowedOutcomes: string[];
  /** Command the runtime must call to report outcome and evidence. */
  reportCommand: string;
  /** State transition target when the runtime reports a successful outcome. */
  onSuccess: string;
  /** State transition target when the runtime reports a failed outcome. */
  onFailure: string;
  /** Whether this packet is a resumable human or runtime checkpoint. */
  checkpoint: boolean;
  /** Lowercase SHA-256 hash of the config snapshot used to emit this packet. */
  configSnapshotHash: string;
  /** Extension identifiers whose transforms affected this packet. */
  extensionIds: string[];
  /** Provider, timeout, and foreground execution constraints for this packet. */
  executionConstraints: AdvisoryExecutionConstraints;
};

export type AdvisoryPacketValidationIssue = {
  field: string;
  code: 'missing-field' | 'version-mismatch' | 'coarse-instruction' | 'invalid-field' | 'agent-tool-mismatch';
  workflowId: string;
  stepId: string;
  message: string;
};

const REQUIRED_STRING_FIELDS = [
  'runId',
  'workflowId',
  'stateId',
  'stepId',
  'goal',
  'instruction',
  'reportCommand',
  'onSuccess',
  'onFailure',
] as const;

const REQUIRED_ARRAY_FIELDS = [
  'requiredContext',
  'allowedTools',
  'agents',
  'expectedEvidence',
  'allowedOutcomes',
  'extensionIds',
] as const;

const VALID_PROVIDERS = new Set(['claude', 'codex', 'gemini']);
const CONFIG_SNAPSHOT_HASH_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === 'string' ? value : '';
}

function validationContext(value: unknown): { workflowId: string; stepId: string } {
  if (!isRecord(value)) return { workflowId: 'unknown', stepId: 'unknown' };
  const workflowId = stringValue(value, 'workflowId').trim() || 'unknown';
  const stepId = stringValue(value, 'stepId').trim() || 'unknown';
  return { workflowId, stepId };
}

function createIssue(
  field: string,
  code: AdvisoryPacketValidationIssue['code'],
  context: { workflowId: string; stepId: string },
  message: string,
): AdvisoryPacketValidationIssue {
  return {
    field,
    code,
    workflowId: context.workflowId,
    stepId: context.stepId,
    message,
  };
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function validateAdvisoryPacket(value: unknown): AdvisoryPacketValidationIssue[] {
  const issues: AdvisoryPacketValidationIssue[] = [];
  const context = validationContext(value);

  if (!isRecord(value)) {
    return [
      createIssue(
        'packet',
        'invalid-field',
        context,
        `advisory packet for ${context.workflowId}#${context.stepId} must be an object`,
      ),
    ];
  }

  if (!hasOwn(value, 'schemaVersion')) {
    issues.push(
      createIssue(
        'schemaVersion',
        'missing-field',
        context,
        `missing required field schemaVersion in ${context.workflowId}#${context.stepId}`,
      ),
    );
  } else if (value.schemaVersion !== CURRENT_ADVISORY_PACKET_SCHEMA_VERSION) {
    issues.push(
      createIssue(
        'schemaVersion',
        'version-mismatch',
        context,
        `schemaVersion in ${context.workflowId}#${context.stepId} must equal ${CURRENT_ADVISORY_PACKET_SCHEMA_VERSION}`,
      ),
    );
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!hasOwn(value, field)) {
      issues.push(
        createIssue(field, 'missing-field', context, `missing required field ${field} in ${context.workflowId}#${context.stepId}`),
      );
      continue;
    }
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      issues.push(
        createIssue(field, 'invalid-field', context, `${field} in ${context.workflowId}#${context.stepId} must be a non-empty string`),
      );
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!hasOwn(value, field)) {
      issues.push(
        createIssue(field, 'missing-field', context, `missing required field ${field} in ${context.workflowId}#${context.stepId}`),
      );
      continue;
    }
    if (!isStringArray(value[field])) {
      issues.push(
        createIssue(field, 'invalid-field', context, `${field} in ${context.workflowId}#${context.stepId} must be an array of strings`),
      );
    }
  }

  if (!hasOwn(value, 'checkpoint')) {
    issues.push(
      createIssue(
        'checkpoint',
        'missing-field',
        context,
        `missing required field checkpoint in ${context.workflowId}#${context.stepId}`,
      ),
    );
  } else if (typeof value.checkpoint !== 'boolean') {
    issues.push(
      createIssue('checkpoint', 'invalid-field', context, `checkpoint in ${context.workflowId}#${context.stepId} must be boolean`),
    );
  }

  if (!hasOwn(value, 'configSnapshotHash')) {
    issues.push(
      createIssue(
        'configSnapshotHash',
        'missing-field',
        context,
        `missing required field configSnapshotHash in ${context.workflowId}#${context.stepId}`,
      ),
    );
  } else if (typeof value.configSnapshotHash !== 'string' || !CONFIG_SNAPSHOT_HASH_PATTERN.test(value.configSnapshotHash)) {
    issues.push(
      createIssue(
        'configSnapshotHash',
        'invalid-field',
        context,
        `configSnapshotHash in ${context.workflowId}#${context.stepId} must be a 64-character lowercase hex string`,
      ),
    );
  }

  if (!hasOwn(value, 'executionConstraints')) {
    issues.push(
      createIssue(
        'executionConstraints',
        'missing-field',
        context,
        `missing required field executionConstraints in ${context.workflowId}#${context.stepId}`,
      ),
    );
  } else if (!isRecord(value.executionConstraints)) {
    issues.push(
      createIssue(
        'executionConstraints',
        'invalid-field',
        context,
        `executionConstraints in ${context.workflowId}#${context.stepId} must be an object`,
      ),
    );
  } else {
    const constraints = value.executionConstraints;
    if (constraints.provider !== undefined && (typeof constraints.provider !== 'string' || !VALID_PROVIDERS.has(constraints.provider))) {
      issues.push(
        createIssue(
          'executionConstraints.provider',
          'invalid-field',
          context,
          `executionConstraints.provider in ${context.workflowId}#${context.stepId} must be claude, codex, or gemini`,
        ),
      );
    }
    if (constraints.foregroundOnly !== undefined && typeof constraints.foregroundOnly !== 'boolean') {
      issues.push(
        createIssue(
          'executionConstraints.foregroundOnly',
          'invalid-field',
          context,
          `executionConstraints.foregroundOnly in ${context.workflowId}#${context.stepId} must be boolean`,
        ),
      );
    }
    if (constraints.timeoutSeconds !== undefined && (typeof constraints.timeoutSeconds !== 'number' || !Number.isFinite(constraints.timeoutSeconds))) {
      issues.push(
        createIssue(
          'executionConstraints.timeoutSeconds',
          'invalid-field',
          context,
          `executionConstraints.timeoutSeconds in ${context.workflowId}#${context.stepId} must be a finite number`,
        ),
      );
    }
    if (constraints.run_in_background !== undefined && constraints.run_in_background !== false) {
      issues.push(
        createIssue(
          'executionConstraints.run_in_background',
          'invalid-field',
          context,
          `executionConstraints.run_in_background in ${context.workflowId}#${context.stepId} must be false when present`,
        ),
      );
    }

    const agents = isStringArray(value.agents) ? value.agents : [];
    const requiresCodexForeground =
      constraints.provider === 'codex' || agents.some((agent) => agent.toLowerCase().startsWith('codex'));
    if (requiresCodexForeground && constraints.run_in_background !== false) {
      issues.push(
        createIssue(
          'executionConstraints.run_in_background',
          'invalid-field',
          context,
          `Codex packet ${context.workflowId}#${context.stepId} must set executionConstraints.run_in_background to false`,
        ),
      );
    }
  }

  return issues;
}
