/**
 * Advisory control event contract and validator for the SDK advisory layer.
 * No external imports — pure type declarations and runtime validator guards only.
 */

// ============================================================
// Event types
// ============================================================

export type GateFailedEvent = {
  kind: 'control';
  event: 'gate-failed';
  extensionId: string;
  targetStepId: string;
  workflowId: string;
  runId: string;
};

export type MigrationRequiredEvent = {
  kind: 'control';
  event: 'migration-required';
  statePath: string;
  detectedVersion: number;
  currentVersion: number;
  supportedRange: { min: number; max: number };
  migrationSteps: Array<{ description: string }>;
};

export type ResumeBlockedEvent = {
  kind: 'control';
  event: 'resume-blocked';
  statePath: string;
  detectedVersion: number;
  currentVersion: number;
};

export type RollbackBlockedEvent = {
  kind: 'control';
  event: 'rollback-blocked';
  statePath: string;
  reason: 'no-checkpoint';
};

export type AdvisoryControlEvent =
  | GateFailedEvent
  | MigrationRequiredEvent
  | ResumeBlockedEvent
  | RollbackBlockedEvent;

// ============================================================
// Validation issue type
// ============================================================

export type AdvisoryControlEventValidationIssue = {
  field: string;
  code: 'missing-field' | 'invalid-field';
  event: string;
  message: string;
};

// ============================================================
// Internal helpers (copied from packet.ts — unexported there)
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

// ============================================================
// Validator
// ============================================================

const KNOWN_EVENT_DISCRIMINANTS = new Set([
  'gate-failed',
  'migration-required',
  'resume-blocked',
  'rollback-blocked',
]);

const GATE_FAILED_REQUIRED_STRING_FIELDS = [
  'extensionId',
  'targetStepId',
  'workflowId',
  'runId',
] as const;

const MIGRATION_REQUIRED_REQUIRED_STRING_FIELDS = [
  'statePath',
] as const;

const RESUME_BLOCKED_REQUIRED_STRING_FIELDS = [
  'statePath',
] as const;

const ROLLBACK_BLOCKED_REQUIRED_STRING_FIELDS = [
  'statePath',
  'reason',
] as const;

function createIssue(
  field: string,
  code: AdvisoryControlEventValidationIssue['code'],
  eventName: string,
  message: string,
): AdvisoryControlEventValidationIssue {
  return { field, code, event: eventName, message };
}

function checkRequiredStringFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  eventName: string,
  issues: AdvisoryControlEventValidationIssue[],
): void {
  for (const field of fields) {
    if (!hasOwn(record, field)) {
      issues.push(createIssue(field, 'missing-field', eventName, `missing required field '${field}' in ${eventName} event`));
    } else if (typeof record[field] !== 'string' || (record[field] as string).trim() === '') {
      issues.push(createIssue(field, 'invalid-field', eventName, `field '${field}' in ${eventName} event must be a non-empty string`));
    }
  }
}

function checkRequiredNumberField(
  record: Record<string, unknown>,
  field: string,
  eventName: string,
  issues: AdvisoryControlEventValidationIssue[],
): void {
  if (!hasOwn(record, field)) {
    issues.push(createIssue(field, 'missing-field', eventName, `missing required field '${field}' in ${eventName} event`));
  } else if (typeof record[field] !== 'number') {
    issues.push(createIssue(field, 'invalid-field', eventName, `field '${field}' in ${eventName} event must be a number`));
  }
}

function validateGateFailed(record: Record<string, unknown>): AdvisoryControlEventValidationIssue[] {
  const issues: AdvisoryControlEventValidationIssue[] = [];
  checkRequiredStringFields(record, GATE_FAILED_REQUIRED_STRING_FIELDS, 'gate-failed', issues);
  return issues;
}

function validateMigrationRequired(record: Record<string, unknown>): AdvisoryControlEventValidationIssue[] {
  const issues: AdvisoryControlEventValidationIssue[] = [];
  checkRequiredStringFields(record, MIGRATION_REQUIRED_REQUIRED_STRING_FIELDS, 'migration-required', issues);
  checkRequiredNumberField(record, 'detectedVersion', 'migration-required', issues);
  checkRequiredNumberField(record, 'currentVersion', 'migration-required', issues);

  if (!hasOwn(record, 'supportedRange')) {
    issues.push(createIssue('supportedRange', 'missing-field', 'migration-required', "missing required field 'supportedRange' in migration-required event"));
  } else if (!isRecord(record.supportedRange)) {
    issues.push(createIssue('supportedRange', 'invalid-field', 'migration-required', "field 'supportedRange' in migration-required event must be an object"));
  }

  if (!hasOwn(record, 'migrationSteps')) {
    issues.push(createIssue('migrationSteps', 'missing-field', 'migration-required', "missing required field 'migrationSteps' in migration-required event"));
  } else if (!Array.isArray(record.migrationSteps)) {
    issues.push(createIssue('migrationSteps', 'invalid-field', 'migration-required', "field 'migrationSteps' in migration-required event must be an array"));
  } else {
    for (let i = 0; i < (record.migrationSteps as unknown[]).length; i++) {
      const step = (record.migrationSteps as unknown[])[i];
      if (!isRecord(step)) {
        issues.push(createIssue(`migrationSteps[${i}]`, 'invalid-field', 'migration-required', `migrationSteps[${i}] must be an object`));
      } else if (!hasOwn(step, 'description') || typeof step.description !== 'string' || step.description.trim() === '') {
        issues.push(createIssue(`migrationSteps[${i}].description`, 'missing-field', 'migration-required', `migrationSteps[${i}].description must be a non-empty string`));
      }
    }
  }

  return issues;
}

function validateResumeBlocked(record: Record<string, unknown>): AdvisoryControlEventValidationIssue[] {
  const issues: AdvisoryControlEventValidationIssue[] = [];
  checkRequiredStringFields(record, RESUME_BLOCKED_REQUIRED_STRING_FIELDS, 'resume-blocked', issues);
  checkRequiredNumberField(record, 'detectedVersion', 'resume-blocked', issues);
  checkRequiredNumberField(record, 'currentVersion', 'resume-blocked', issues);
  return issues;
}

function validateRollbackBlocked(record: Record<string, unknown>): AdvisoryControlEventValidationIssue[] {
  const issues: AdvisoryControlEventValidationIssue[] = [];
  checkRequiredStringFields(record, ROLLBACK_BLOCKED_REQUIRED_STRING_FIELDS, 'rollback-blocked', issues);
  return issues;
}

export function validateAdvisoryControlEvent(value: unknown): AdvisoryControlEventValidationIssue[] {
  if (!isRecord(value)) {
    return [createIssue('event', 'invalid-field', 'unknown', 'advisory control event must be an object')];
  }

  if (!hasOwn(value, 'kind') || value.kind !== 'control') {
    return [createIssue('kind', 'invalid-field', 'unknown', "advisory control event must have kind === 'control'")];
  }

  const eventDiscriminant = hasOwn(value, 'event') && typeof value.event === 'string' ? value.event : '';

  if (!KNOWN_EVENT_DISCRIMINANTS.has(eventDiscriminant)) {
    return [createIssue('event', 'invalid-field', eventDiscriminant || 'unknown', `unknown advisory control event discriminant: '${eventDiscriminant}'`)];
  }

  switch (eventDiscriminant) {
    case 'gate-failed':
      return validateGateFailed(value);
    case 'migration-required':
      return validateMigrationRequired(value);
    case 'resume-blocked':
      return validateResumeBlocked(value);
    case 'rollback-blocked':
      return validateRollbackBlocked(value);
    default:
      return [createIssue('event', 'invalid-field', eventDiscriminant, `unhandled event discriminant: '${eventDiscriminant}'`)];
  }
}
