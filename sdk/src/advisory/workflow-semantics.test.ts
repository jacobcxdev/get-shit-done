import { describe, expect, it } from 'vitest';
import {
  REQUIRED_WORKFLOW_SEMANTIC_FAMILIES,
  validateWorkflowSemanticManifest,
  type WorkflowSemanticEntry,
  type WorkflowSemanticManifest,
} from './workflow-semantics.js';

const EXPECTED_FAMILIES = [
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

const VALID_ENTRIES: WorkflowSemanticEntry[] = [
  {
    family: 'mode-dispatch',
    modes: ['auto'],
    branchIds: ['mode:auto'],
    priority: ['auto'],
    provenance: 'audit-inference',
  },
  {
    family: 'hitl',
    suspensionPoints: ['checkpoint'],
    resumableOutcomes: ['resume'],
    mockInputSeam: 'AskUserQuestion',
    provenance: 'audit-inference',
  },
  { family: 'config-gate', configKeys: ['workflow.auto_advance'], guardName: 'auto-mode', provenance: 'config' },
  {
    family: 'context-budget-branch',
    inputs: ['context window'],
    thresholds: ['context-window-limit'],
    provenance: 'audit-inference',
  },
  { family: 'parallel-wave', lifecycle: ['spawn', 'poll', 'collect', 'merge'], provenance: 'workflow-text' },
  { family: 'filesystem-fallback', fallbackPaths: ['SUMMARY.md'], provenance: 'workflow-text' },
  { family: 'sentinel-polling', sentinelFiles: ['.complete'], provenance: 'workflow-text' },
  { family: 'non-blocking-side-effect', sideEffects: ['watchdog'], provenance: 'workflow-text' },
  { family: 'nested-fsm', parentStateKey: 'parentRunState', childStateKey: 'childRunState', provenance: 'workflow-text' },
  { family: 'dynamic-roadmap', inputs: ['ROADMAP.md'], provenance: 'workflow-text' },
  { family: 'workstream-namespace', injectedKeys: ['workstream'], provenance: 'config' },
  { family: 'runtime-type-branch', runtimes: ['Codex', 'Claude'], provenance: 'command-metadata' },
  { family: 'text-mode-substitution', substitutions: ['AskUserQuestion fallback'], provenance: 'workflow-text' },
  { family: 'quantitative-gate', metric: 'score', operator: 'gte', threshold: 1, provenance: 'workflow-text' },
  { family: 'completion-marker', markers: ['PLAN COMPLETE'], provenance: 'workflow-text' },
  { family: 'fallback-posture', postures: ['reduced-confidence'], provenance: 'workflow-text' },
  { family: 'evidence-requirement', evidenceIds: ['expectedEvidence'], provenance: 'workflow-text' },
];

function manifest(semantics: unknown[]): WorkflowSemanticManifest {
  return {
    workflowId: '/workflows/demo',
    semantics: semantics as WorkflowSemanticEntry[],
  };
}

function fieldsFor(value: unknown): string[] {
  return validateWorkflowSemanticManifest(value).map((issue) => issue.field);
}

function expectFieldIssue(entry: Record<string, unknown>, field: string, fieldPath: string, value: unknown): void {
  const candidate = { ...entry };
  if (value === undefined) {
    delete candidate[field];
  } else {
    candidate[field] = value;
  }

  expect(fieldsFor(manifest([candidate]))).toContain(fieldPath);
}

describe('WorkflowSemanticManifest contract', () => {
  it('declares every required workflow semantic family exactly once', () => {
    expect(REQUIRED_WORKFLOW_SEMANTIC_FAMILIES).toEqual(EXPECTED_FAMILIES);
  });

  it('accepts one valid semantic entry for every family', () => {
    expect(validateWorkflowSemanticManifest(manifest(VALID_ENTRIES))).toEqual([]);
  });

  it('requires provenance on every semantic entry family', () => {
    for (const entry of VALID_ENTRIES) {
      const withoutProvenance = { ...entry } as Record<string, unknown>;
      delete withoutProvenance.provenance;

      expect(fieldsFor(manifest([withoutProvenance]))).toContain('semantics[0].provenance');
    }
  });

  it('rejects an unknown semantic family', () => {
    expect(fieldsFor(manifest([{ family: 'unknown-family', provenance: 'audit-inference' }]))).toContain(
      'semantics[0].family',
    );
  });

  it('rejects empty required arrays', () => {
    expect(fieldsFor(manifest([{ ...VALID_ENTRIES[0], modes: [] }]))).toContain('semantics[0].modes');
  });

  it('requires branchIds for mode-dispatch semantics', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'mode-dispatch') as Record<string, unknown>;
    expectFieldIssue(entry, 'branchIds', 'semantics[0].branchIds', undefined);
  });
});

describe('WorkflowSemanticManifest scalar validation', () => {
  it('validates hitl.mockInputSeam missing, wrong-type, and empty-string cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'hitl') as Record<string, unknown>;
    expectFieldIssue(entry, 'mockInputSeam', 'semantics[0].mockInputSeam', undefined);
    expectFieldIssue(entry, 'mockInputSeam', 'semantics[0].mockInputSeam', 42);
    expectFieldIssue(entry, 'mockInputSeam', 'semantics[0].mockInputSeam', '');
  });

  it('validates config-gate.guardName missing, wrong-type, and empty-string cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'config-gate') as Record<string, unknown>;
    expectFieldIssue(entry, 'guardName', 'semantics[0].guardName', undefined);
    expectFieldIssue(entry, 'guardName', 'semantics[0].guardName', 42);
    expectFieldIssue(entry, 'guardName', 'semantics[0].guardName', '');
  });

  it('validates nested-fsm.parentStateKey missing, wrong-type, and empty-string cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'nested-fsm') as Record<string, unknown>;
    expectFieldIssue(entry, 'parentStateKey', 'semantics[0].parentStateKey', undefined);
    expectFieldIssue(entry, 'parentStateKey', 'semantics[0].parentStateKey', 42);
    expectFieldIssue(entry, 'parentStateKey', 'semantics[0].parentStateKey', '');
  });

  it('validates nested-fsm.childStateKey missing, wrong-type, and empty-string cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'nested-fsm') as Record<string, unknown>;
    expectFieldIssue(entry, 'childStateKey', 'semantics[0].childStateKey', undefined);
    expectFieldIssue(entry, 'childStateKey', 'semantics[0].childStateKey', 42);
    expectFieldIssue(entry, 'childStateKey', 'semantics[0].childStateKey', '');
  });

  it('validates quantitative-gate.metric missing, wrong-type, and empty-string cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'quantitative-gate') as Record<string, unknown>;
    expectFieldIssue(entry, 'metric', 'semantics[0].metric', undefined);
    expectFieldIssue(entry, 'metric', 'semantics[0].metric', 42);
    expectFieldIssue(entry, 'metric', 'semantics[0].metric', '');
  });

  it('validates quantitative-gate.operator missing, wrong-type, and invalid enum cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'quantitative-gate') as Record<string, unknown>;
    expectFieldIssue(entry, 'operator', 'semantics[0].operator', undefined);
    expectFieldIssue(entry, 'operator', 'semantics[0].operator', 42);
    expectFieldIssue(entry, 'operator', 'semantics[0].operator', 'contains');
  });

  it('validates quantitative-gate.threshold missing, non-number, NaN, and Infinity cases', () => {
    const entry = VALID_ENTRIES.find((item) => item.family === 'quantitative-gate') as Record<string, unknown>;
    expectFieldIssue(entry, 'threshold', 'semantics[0].threshold', undefined);
    expectFieldIssue(entry, 'threshold', 'semantics[0].threshold', '1');
    expectFieldIssue(entry, 'threshold', 'semantics[0].threshold', Number.NaN);
    expectFieldIssue(entry, 'threshold', 'semantics[0].threshold', Number.POSITIVE_INFINITY);
  });
});
