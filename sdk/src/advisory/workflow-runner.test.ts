import { describe, expect, it } from 'vitest';
import {
  WorkflowRunner,
  WorkflowRunnerError,
  type WorkflowRunnerManifests,
} from './workflow-runner.js';

function makeManifests(overrides: Partial<WorkflowRunnerManifests> = {}): WorkflowRunnerManifests {
  const commandClassification = [
    {
      commandId: '/gsd-graphify',
      workflowId: null,
      category: 'hard-outlier',
      determinismPosture: 'dynamic',
      isHardOutlier: true,
      migrationDisposition: 'manual-posture-required',
      outlierPosture: 'seed-outlier',
      agentTypes: [],
    },
    {
      commandId: '/gsd-from-gsd2',
      workflowId: null,
      category: 'hard-outlier',
      determinismPosture: 'dynamic',
      isHardOutlier: true,
      migrationDisposition: 'manual-posture-required',
      outlierPosture: 'seed-outlier',
      agentTypes: [],
    },
    {
      commandId: '/gsd-ultraplan-phase',
      workflowId: '/workflows/ultraplan-phase',
      category: 'hard-outlier',
      determinismPosture: 'dynamic',
      isHardOutlier: true,
      migrationDisposition: 'manual-posture-required',
      outlierPosture: 'seed-outlier',
      agentTypes: [],
    },
    {
      commandId: '/gsd-review',
      workflowId: '/workflows/review',
      category: 'hard-outlier',
      determinismPosture: 'dynamic',
      isHardOutlier: true,
      migrationDisposition: 'manual-posture-required',
      outlierPosture: 'seed-outlier',
      agentTypes: [],
    },
    {
      commandId: '/gsd-fast',
      workflowId: '/workflows/fast',
      category: 'hard-outlier',
      determinismPosture: 'dynamic',
      isHardOutlier: true,
      migrationDisposition: 'manual-posture-required',
      outlierPosture: 'seed-outlier',
      agentTypes: [],
    },
    {
      commandId: '/gsd-add-phase',
      workflowId: '/workflows/add-phase',
      category: 'single-agent-bounded',
      determinismPosture: 'deterministic',
      isHardOutlier: false,
      migrationDisposition: 'workflow-runner-supported',
      outlierPosture: null,
      agentTypes: ['gsd-roadmapper'],
    },
    {
      commandId: '/gsd-discuss-phase',
      workflowId: '/workflows/discuss-phase',
      category: 'dynamic-branch',
      determinismPosture: 'dynamic',
      isHardOutlier: false,
      migrationDisposition: 'workflow-runner-supported',
      outlierPosture: null,
      agentTypes: ['gsd-ui-researcher'],
    },
  ];

  const workflowCoverage = [
    {
      id: '/workflows/add-phase',
      isTopLevel: true,
      path: 'get-shit-done/workflows/add-phase.md',
      hash: '5cfa8a76a3e104cd1db4f2f651d5450c6aed1feb74253187abf0b9ce57d3874c',
      runnerType: { value: 'standalone', inferred: true },
      determinism: { value: 'deterministic', inferred: true },
      semanticFeatures: { values: ['state-write'], inferred: true },
      semanticManifest: {
        workflowId: '/workflows/add-phase',
        semantics: [
          {
            family: 'completion-marker',
            markers: ['PLAN COMPLETE'],
            provenance: 'audit-inference',
          },
        ],
      },
      stepCount: { value: 5, inferred: true },
    },
    {
      id: '/workflows/discuss-phase',
      isTopLevel: true,
      path: 'get-shit-done/workflows/discuss-phase.md',
      hash: 'd788a63c515103bd6bd7ed7ad6c2ed6b466ff0955ffc3b84a5d178439d526491',
      runnerType: { value: 'standalone', inferred: true },
      determinism: { value: 'dynamic', inferred: true },
      semanticFeatures: { values: ['hitl', 'mode-dispatch', 'state-write'], inferred: true },
      semanticManifest: {
        workflowId: '/workflows/discuss-phase',
        semantics: [
          {
            family: 'mode-dispatch',
            modes: ['auto'],
            branchIds: ['mode:auto'],
            priority: ['mode'],
            provenance: 'audit-inference',
          },
        ],
      },
      stepCount: { value: 15, inferred: true },
    },
  ];

  const workflowSemantics = workflowCoverage.map(entry => entry.semanticManifest);

  return {
    commandClassification,
    workflowCoverage,
    workflowSemantics,
    ...overrides,
  } as WorkflowRunnerManifests;
}

function makeDispatchInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: '/gsd-add-phase',
    workflowId: '/workflows/add-phase',
    runId: 'run-1',
    stateId: 'ready',
    config: {
      workflow: {
        auto_advance: false,
        nyquist_validation: true,
      },
    },
    ...overrides,
  };
}

describe('WorkflowRunner', () => {
  it('fails closed at startup when required manifests are empty', () => {
    try {
      new WorkflowRunner({ commandClassification: [], workflowCoverage: [], workflowSemantics: [] });
      throw new Error('WorkflowRunner did not throw');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowRunnerError);
      expect((error as WorkflowRunnerError).code).toBe('startup-error');
    }
  });

  it('returns hard-outlier posture records without packets for known hard outlier commands', () => {
    const runner = new WorkflowRunner(makeManifests());

    for (const commandId of [
      '/gsd-graphify',
      '/gsd-from-gsd2',
      '/gsd-ultraplan-phase',
      '/gsd-review',
      '/gsd-fast',
    ]) {
      const result = runner.dispatch(makeDispatchInput({ commandId }));

      expect(result).toMatchObject({ kind: 'posture', posture: 'hard-outlier' });
      expect('packet' in result).toBe(false);
    }
  });

  it('returns a typed error for missing workflow dispatch', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-missing',
      workflowId: '/workflows/missing',
    }));

    expect(result).toMatchObject({ kind: 'error', code: 'missing-workflow' });
  });

  it('emits one deterministic packet with a config hash and atomic instruction', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput());

    expect(result.kind).toBe('packet');
    if (result.kind !== 'packet') throw new Error(`Expected packet result, got ${result.kind}`);
    expect(Array.isArray(result.packet)).toBe(false);
    expect(result.packet.configSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packet.instruction).not.toContain('\n- ');
  });

  it('selects a dynamic mode branch without reading model output', () => {
    const runner = new WorkflowRunner(makeManifests());
    const input = makeDispatchInput({
      commandId: '/gsd-discuss-phase',
      workflowId: '/workflows/discuss-phase',
      branchId: 'mode:auto',
    });
    Object.defineProperty(input, 'modelOutput', {
      get() {
        throw new Error('model output should not be read for deterministic mode branch selection');
      },
    });

    const result = runner.dispatch(input);

    expect(result.kind).toBe('packet');
    if (result.kind !== 'packet') throw new Error(`Expected packet result, got ${result.kind}`);
    expect(result.packet.stepId).toBe('mode:auto');
  });
});
