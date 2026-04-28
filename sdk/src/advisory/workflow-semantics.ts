/**
 * Workflow semantic manifest contract and guards for the SDK advisory layer.
 * No external imports - pure type declarations and runtime checks only.
 */

import type { ProviderName } from './provider-availability.js';

export type SemanticProvenance = 'workflow-text' | 'command-metadata' | 'config' | 'audit-inference';

type WorkflowSemanticProviderMetadata = {
  mandatoryProviders?: ProviderName[];
};

export type WorkflowSemanticEntry = WorkflowSemanticProviderMetadata & (
  | {
    family: 'mode-dispatch';
    modes: string[];
    priority: string[];
    branchIds: string[];
    provenance: SemanticProvenance;
  }
  | {
    family: 'hitl';
    suspensionPoints: string[];
    resumableOutcomes: string[];
    mockInputSeam: string;
    provenance: SemanticProvenance;
  }
  | { family: 'config-gate'; configKeys: string[]; guardName: string; provenance: SemanticProvenance }
  | { family: 'context-budget-branch'; inputs: string[]; thresholds: string[]; provenance: SemanticProvenance }
  | { family: 'parallel-wave'; lifecycle: Array<'spawn' | 'poll' | 'collect' | 'merge'>; provenance: SemanticProvenance }
  | { family: 'filesystem-fallback'; fallbackPaths: string[]; provenance: SemanticProvenance }
  | { family: 'sentinel-polling'; sentinelFiles: string[]; provenance: SemanticProvenance }
  | { family: 'non-blocking-side-effect'; sideEffects: string[]; provenance: SemanticProvenance }
  | { family: 'nested-fsm'; parentStateKey: string; childStateKey: string; provenance: SemanticProvenance }
  | { family: 'dynamic-roadmap'; inputs: string[]; provenance: SemanticProvenance }
  | { family: 'workstream-namespace'; injectedKeys: string[]; provenance: SemanticProvenance }
  | { family: 'runtime-type-branch'; runtimes: string[]; provenance: SemanticProvenance }
  | { family: 'text-mode-substitution'; substitutions: string[]; provenance: SemanticProvenance }
  | {
    family: 'quantitative-gate';
    metric: string;
    operator: 'lt' | 'lte' | 'eq' | 'gte' | 'gt';
    threshold: number;
    provenance: SemanticProvenance;
  }
  | { family: 'completion-marker'; markers: string[]; provenance: SemanticProvenance }
  | { family: 'fallback-posture'; postures: string[]; provenance: SemanticProvenance }
  | { family: 'evidence-requirement'; evidenceIds: string[]; provenance: SemanticProvenance }
);

export type WorkflowSemanticManifest = {
  workflowId: string;
  semantics: WorkflowSemanticEntry[];
};

export type WorkflowSemanticValidationIssue = {
  field: string;
  message: string;
};

export const REQUIRED_WORKFLOW_SEMANTIC_FAMILIES = [
  'mode-dispatch',
  'hitl',
  'config-gate',
  'context-budget-branch',
  'parallel-wave',
  'filesystem-fallback',
  'sentinel-polling',
  'non-blocking-side-effect',
  'nested-fsm',
  'dynamic-roadmap',
  'workstream-namespace',
  'runtime-type-branch',
  'text-mode-substitution',
  'quantitative-gate',
  'completion-marker',
  'fallback-posture',
  'evidence-requirement',
] as const;

const VALID_FAMILIES = new Set<string>(REQUIRED_WORKFLOW_SEMANTIC_FAMILIES);
const VALID_PROVIDER_NAMES = new Set<ProviderName>(['claude', 'codex', 'gemini']);
const VALID_PROVENANCE = new Set<SemanticProvenance>([
  'workflow-text',
  'command-metadata',
  'config',
  'audit-inference',
]);
const VALID_PARALLEL_LIFECYCLE = new Set(['spawn', 'poll', 'collect', 'merge']);
const VALID_QUANTITATIVE_OPERATORS = new Set(['lt', 'lte', 'eq', 'gte', 'gt']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function issue(field: string, message: string): WorkflowSemanticValidationIssue {
  return { field, message };
}

function validateString(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: WorkflowSemanticValidationIssue[],
): void {
  if (!hasOwn(record, field)) {
    issues.push(issue(path, `${path} is required`));
    return;
  }
  if (typeof record[field] !== 'string' || record[field].trim() === '') {
    issues.push(issue(path, `${path} must be a non-empty string`));
  }
}

function validateStringArray(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: WorkflowSemanticValidationIssue[],
): void {
  const value = record[field];
  if (!hasOwn(record, field)) {
    issues.push(issue(path, `${path} is required`));
    return;
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    issues.push(issue(path, `${path} must be a non-empty array of non-empty strings`));
  }
}

function validateEnumArray(
  record: Record<string, unknown>,
  field: string,
  path: string,
  allowedValues: Set<string>,
  issues: WorkflowSemanticValidationIssue[],
): void {
  const value = record[field];
  if (!hasOwn(record, field)) {
    issues.push(issue(path, `${path} is required`));
    return;
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || !allowedValues.has(item))
  ) {
    issues.push(issue(path, `${path} must be a non-empty array of allowed values`));
  }
}

function validateOptionalProviderArray(
  record: Record<string, unknown>,
  path: string,
  issues: WorkflowSemanticValidationIssue[],
): void {
  if (!hasOwn(record, 'mandatoryProviders')) {
    return;
  }
  const value = record.mandatoryProviders;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || !VALID_PROVIDER_NAMES.has(item as ProviderName))
  ) {
    issues.push(issue(`${path}.mandatoryProviders`, `${path}.mandatoryProviders must be a non-empty array of provider names`));
  }
}

function validateProvenance(
  record: Record<string, unknown>,
  path: string,
  issues: WorkflowSemanticValidationIssue[],
): void {
  if (!hasOwn(record, 'provenance')) {
    issues.push(issue(`${path}.provenance`, `${path}.provenance is required`));
    return;
  }
  if (typeof record.provenance !== 'string' || !VALID_PROVENANCE.has(record.provenance as SemanticProvenance)) {
    issues.push(issue(`${path}.provenance`, `${path}.provenance must be workflow-text, command-metadata, config, or audit-inference`));
  }
}

function validateQuantitativeGate(
  entry: Record<string, unknown>,
  path: string,
  issues: WorkflowSemanticValidationIssue[],
): void {
  validateString(entry, 'metric', `${path}.metric`, issues);

  if (!hasOwn(entry, 'operator')) {
    issues.push(issue(`${path}.operator`, `${path}.operator is required`));
  } else if (typeof entry.operator !== 'string' || !VALID_QUANTITATIVE_OPERATORS.has(entry.operator)) {
    issues.push(issue(`${path}.operator`, `${path}.operator must be lt, lte, eq, gte, or gt`));
  }

  if (!hasOwn(entry, 'threshold')) {
    issues.push(issue(`${path}.threshold`, `${path}.threshold is required`));
  } else if (typeof entry.threshold !== 'number' || !Number.isFinite(entry.threshold)) {
    issues.push(issue(`${path}.threshold`, `${path}.threshold must be a finite number`));
  }
}

function validateEntryFields(
  entry: Record<string, unknown>,
  path: string,
  issues: WorkflowSemanticValidationIssue[],
): void {
  switch (entry.family) {
    case 'mode-dispatch':
      validateStringArray(entry, 'modes', `${path}.modes`, issues);
      validateStringArray(entry, 'priority', `${path}.priority`, issues);
      validateStringArray(entry, 'branchIds', `${path}.branchIds`, issues);
      return;
    case 'hitl':
      validateStringArray(entry, 'suspensionPoints', `${path}.suspensionPoints`, issues);
      validateStringArray(entry, 'resumableOutcomes', `${path}.resumableOutcomes`, issues);
      validateString(entry, 'mockInputSeam', `${path}.mockInputSeam`, issues);
      return;
    case 'config-gate':
      validateStringArray(entry, 'configKeys', `${path}.configKeys`, issues);
      validateString(entry, 'guardName', `${path}.guardName`, issues);
      return;
    case 'context-budget-branch':
      validateStringArray(entry, 'inputs', `${path}.inputs`, issues);
      validateStringArray(entry, 'thresholds', `${path}.thresholds`, issues);
      return;
    case 'parallel-wave':
      validateEnumArray(entry, 'lifecycle', `${path}.lifecycle`, VALID_PARALLEL_LIFECYCLE, issues);
      return;
    case 'filesystem-fallback':
      validateStringArray(entry, 'fallbackPaths', `${path}.fallbackPaths`, issues);
      return;
    case 'sentinel-polling':
      validateStringArray(entry, 'sentinelFiles', `${path}.sentinelFiles`, issues);
      return;
    case 'non-blocking-side-effect':
      validateStringArray(entry, 'sideEffects', `${path}.sideEffects`, issues);
      return;
    case 'nested-fsm':
      validateString(entry, 'parentStateKey', `${path}.parentStateKey`, issues);
      validateString(entry, 'childStateKey', `${path}.childStateKey`, issues);
      return;
    case 'dynamic-roadmap':
      validateStringArray(entry, 'inputs', `${path}.inputs`, issues);
      return;
    case 'workstream-namespace':
      validateStringArray(entry, 'injectedKeys', `${path}.injectedKeys`, issues);
      return;
    case 'runtime-type-branch':
      validateStringArray(entry, 'runtimes', `${path}.runtimes`, issues);
      return;
    case 'text-mode-substitution':
      validateStringArray(entry, 'substitutions', `${path}.substitutions`, issues);
      return;
    case 'quantitative-gate':
      validateQuantitativeGate(entry, path, issues);
      return;
    case 'completion-marker':
      validateStringArray(entry, 'markers', `${path}.markers`, issues);
      return;
    case 'fallback-posture':
      validateStringArray(entry, 'postures', `${path}.postures`, issues);
      return;
    case 'evidence-requirement':
      validateStringArray(entry, 'evidenceIds', `${path}.evidenceIds`, issues);
      return;
    default:
      issues.push(issue(`${path}.family`, `${path}.family is not a known workflow semantic family`));
  }
}

export function validateWorkflowSemanticManifest(value: unknown): WorkflowSemanticValidationIssue[] {
  const issues: WorkflowSemanticValidationIssue[] = [];

  if (!isRecord(value)) {
    return [issue('manifest', 'workflow semantic manifest must be an object')];
  }

  validateString(value, 'workflowId', 'workflowId', issues);

  if (!hasOwn(value, 'semantics')) {
    issues.push(issue('semantics', 'semantics is required'));
    return issues;
  }
  if (!Array.isArray(value.semantics)) {
    issues.push(issue('semantics', 'semantics must be an array'));
    return issues;
  }

  value.semantics.forEach((entry, index) => {
    const path = `semantics[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue(path, `${path} must be an object`));
      return;
    }
    if (!hasOwn(entry, 'family')) {
      issues.push(issue(`${path}.family`, `${path}.family is required`));
    } else if (typeof entry.family !== 'string' || !VALID_FAMILIES.has(entry.family)) {
      issues.push(issue(`${path}.family`, `${path}.family is not a known workflow semantic family`));
    }
    validateProvenance(entry, path, issues);
    validateOptionalProviderArray(entry, path, issues);
    validateEntryFields(entry, path, issues);
  });

  return issues;
}
