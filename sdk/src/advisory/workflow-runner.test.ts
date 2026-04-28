import { describe, expect, it } from 'vitest';
import {
  WorkflowRunner,
  WorkflowRunnerError,
  type WorkflowRunnerDispatchInput,
  type WorkflowRunnerManifests,
} from './workflow-runner.js';
import { sortKeysDeep } from '../compile/baselines.js';
import { GSDEventType } from '../types.js';

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
    {
      commandId: '/gsd-autonomous',
      workflowId: '/workflows/autonomous',
      category: 'composite',
      determinismPosture: 'unknown',
      isHardOutlier: false,
      migrationDisposition: 'composite-review',
      outlierPosture: null,
      agentTypes: [],
    },
    {
      commandId: '/gsd-progress',
      workflowId: '/workflows/progress',
      category: 'query-utility',
      determinismPosture: 'deterministic',
      isHardOutlier: false,
      migrationDisposition: 'query-native',
      outlierPosture: null,
      agentTypes: [],
    },
    {
      commandId: '/gsd-add-backlog',
      workflowId: null,
      category: 'core-lifecycle',
      determinismPosture: 'deterministic',
      isHardOutlier: false,
      migrationDisposition: 'dispatch-error',
      outlierPosture: null,
      agentTypes: [],
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
    {
      id: '/workflows/autonomous',
      isTopLevel: true,
      path: 'get-shit-done/workflows/autonomous.md',
      hash: '774392154f4241c68072e85db8c2a3eac3f9083a6e2f31bf7a5986baf4b67dc2',
      runnerType: { value: 'unknown', inferred: true },
      determinism: { value: 'unknown', inferred: true },
      semanticFeatures: { values: ['task-spawn', 'state-write'], inferred: true },
      semanticManifest: {
        workflowId: '/workflows/autonomous',
        semantics: [
          {
            family: 'parallel-wave',
            lifecycle: ['spawn', 'poll', 'collect'],
            provenance: 'audit-inference',
          },
        ],
      },
      stepCount: { value: 24, inferred: true },
    },
    {
      id: '/workflows/progress',
      isTopLevel: true,
      path: 'get-shit-done/workflows/progress.md',
      hash: '842f0ad4db1fe3b0b4ab7c9dcfc879b6bd0f376bbab64f003760a92ab72e7f88',
      runnerType: { value: 'standalone', inferred: true },
      determinism: { value: 'deterministic', inferred: true },
      semanticFeatures: { values: ['config-read'], inferred: true },
      semanticManifest: {
        workflowId: '/workflows/progress',
        semantics: [
          {
            family: 'config-gate',
            configKeys: ['.planning/config.json'],
            guardName: 'progress-query',
            provenance: 'audit-inference',
          },
        ],
      },
      stepCount: { value: 3, inferred: true },
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

function makeDispatchInput(overrides: Partial<WorkflowRunnerDispatchInput> = {}): WorkflowRunnerDispatchInput {
  return {
    commandId: '/gsd-add-phase',
    workflowId: '/workflows/add-phase',
    runId: 'run-1',
    stateId: 'ready',
    stepId: 'step-1',
    configSnapshot: {
      workflow: {
        auto_advance: false,
        nyquist_validation: true,
      },
    },
    ...overrides,
  };
}

function sortedPacketJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
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

  it('returns posture records without packets for composite-review and query-native workflows', () => {
    const runner = new WorkflowRunner(makeManifests());

    for (const input of [
      makeDispatchInput({ commandId: '/gsd-autonomous', workflowId: '/workflows/autonomous' }),
      makeDispatchInput({ commandId: '/gsd-progress', workflowId: '/workflows/progress' }),
    ]) {
      const result = runner.dispatch(input);

      expect(result.kind).toBe('posture');
      expect('packet' in result).toBe(false);
    }
  });

  it('builds a support matrix entry for every workflow semantic manifest item', () => {
    const manifests = makeManifests();
    const runner = new WorkflowRunner(manifests);
    const supportMatrix = runner.buildSupportMatrix();

    expect(supportMatrix.map(entry => entry.workflowId).sort()).toEqual(
      manifests.workflowSemantics.map(entry => entry.workflowId).sort(),
    );
    expect(supportMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ disposition: 'packet-template' }),
      expect.objectContaining({ disposition: 'dynamic-branch' }),
      expect.objectContaining({ disposition: 'composite-review' }),
      expect.objectContaining({ disposition: 'query-native' }),
    ]));
  });

  it('requires branchId for dynamic-branch dispatch', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-discuss-phase',
      workflowId: '/workflows/discuss-phase',
    }));

    expect(result).toMatchObject({
      kind: 'error',
      code: 'dispatch-error',
      diagnosticCode: 'UNKNOWN_BRANCH_ID',
      message: expect.stringContaining('UNKNOWN_BRANCH_ID'),
    });
  });

  it('emits one deterministic packet with a config hash and atomic instruction', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput());

    expect(result.kind).toBe('packet');
    if (result.kind !== 'packet') throw new Error(`Expected packet result, got ${result.kind}`);
    expect(Array.isArray(result.packet)).toBe(false);
    expect(result.packet.configSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packet.instruction).not.toContain('\n- ');
    expect(result.packet.reportCommand).toContain('RuntimeExecutionReport');
    expect(result.packet.reportCommand).toContain('runtimeReportHandler');
    expect(result.packet.reportCommand).toContain('packet.allowedOutcomes');
    expect(result.packet.reportCommand).not.toContain('fsm.transition');
  });

  it('keeps packet dispatch moving with reduced confidence when optional providers are unavailable', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput({
      providerAvailability: {
        available: ['claude'],
        unavailable: ['gemini'],
      },
    }));

    expect(result.kind).toBe('packet');
    if (result.kind !== 'packet') throw new Error(`Expected packet result, got ${result.kind}`);
    expect(result.providerMetadata).toEqual({
      providerConfidence: 'reduced',
      missingProviders: ['gemini'],
    });
  });

  it('blocks packet dispatch when a mandatory provider is unavailable', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput({
      mandatoryProviders: ['gemini'],
      providerAvailability: {
        available: ['claude'],
        unavailable: ['gemini', 'codex'],
      },
    }));

    expect(result).toEqual({
      kind: 'error',
      code: 'dispatch-error',
      message: 'Mandatory providers unavailable: gemini',
      workflowId: '/workflows/add-phase',
      commandId: '/gsd-add-phase',
    });
    expect('packet' in result).toBe(false);
  });

  it('blocks packet dispatch when pre-emit runtime contract validation fails', () => {
    const runner = new WorkflowRunner(makeManifests());

    const result = runner.dispatch(makeDispatchInput({
      agentContracts: [
        {
          id: 'gsd-roadmapper',
          path: 'agents/gsd-roadmapper.md',
          hash: 'b'.repeat(64),
          name: 'gsd-roadmapper',
          description: 'Creates roadmap plans.',
          roleClass: 'planner',
          allowedTools: ['Read', 'Write'],
          diskWriteMandate: true,
          worktreeRequired: true,
          outputArtifacts: ['ROADMAP.md'],
          completionMarker: 'ROADMAP COMPLETE',
        },
      ],
      worktreeContext: {
        activeWorktreePath: null,
      },
    }));

    expect(result).toEqual({
      kind: 'error',
      code: 'dispatch-error',
      message: GSDEventType.WorktreeRequired,
      workflowId: '/workflows/add-phase',
      commandId: '/gsd-add-phase',
    });
    expect('packet' in result).toBe(false);
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

  it('emits deeply equal packets for equivalent configSnapshot objects with different key order', () => {
    const runner = new WorkflowRunner(makeManifests());
    const first = runner.dispatch(makeDispatchInput({
      configSnapshot: {
        agent_routing: { 'gsd-executor': 'codex:xhigh' },
        codex_model: 'gpt-5.5',
        workflow: { verifier: true, auto_advance: false },
      },
    }));
    const second = runner.dispatch(makeDispatchInput({
      configSnapshot: {
        workflow: { auto_advance: false, verifier: true },
        codex_model: 'gpt-5.5',
        agent_routing: { 'gsd-executor': 'codex:xhigh' },
      },
    }));

    expect(first.kind).toBe('packet');
    expect(second.kind).toBe('packet');
    if (first.kind !== 'packet' || second.kind !== 'packet') throw new Error('Expected packet results');
    expect(sortedPacketJson(first.packet)).toEqual(sortedPacketJson(second.packet));
  });

  it('changes configSnapshotHash when workflow.verifier changes', () => {
    const runner = new WorkflowRunner(makeManifests());
    const enabled = runner.dispatch(makeDispatchInput({
      configSnapshot: { workflow: { verifier: true } },
    }));
    const disabled = runner.dispatch(makeDispatchInput({
      configSnapshot: { workflow: { verifier: false } },
    }));

    expect(enabled.kind).toBe('packet');
    expect(disabled.kind).toBe('packet');
    if (enabled.kind !== 'packet' || disabled.kind !== 'packet') throw new Error('Expected packet results');
    expect(enabled.packet.configSnapshotHash).not.toBe(disabled.packet.configSnapshotHash);
  });
});

describe('WorkflowRunner.dispatch() - Wave 0 branch/provider hardening', () => {
  function dynamicWorkflowCoverage(branchIds: string[]) {
    return {
      id: '/workflows/dynamic-test',
      isTopLevel: true,
      path: 'get-shit-done/workflows/dynamic-test.md',
      hash: 'd'.repeat(64),
      runnerType: { value: 'standalone', inferred: true },
      determinism: { value: 'dynamic', inferred: true },
      semanticFeatures: { values: ['mode-dispatch'], inferred: true },
      semanticManifest: {
        workflowId: '/workflows/dynamic-test',
        semantics: [
          {
            family: 'mode-dispatch',
            modes: ['plan', 'execute'],
            branchIds,
            priority: ['mode'],
            provenance: 'audit-inference',
            mandatoryProviders: ['codex'],
          },
        ],
      },
      stepCount: { value: 2, inferred: true },
    } as WorkflowRunnerManifests['workflowCoverage'][number];
  }

  function makeManifestsWithDynamicBranch(branchIds = ['mode:plan', 'mode:execute']): WorkflowRunnerManifests {
    const base = makeManifests();
    const workflow = dynamicWorkflowCoverage(branchIds);
    return {
      ...base,
      commandClassification: [
        ...base.commandClassification,
        {
          commandId: '/gsd-dynamic-test',
          workflowId: '/workflows/dynamic-test',
          category: 'dynamic-branch',
          determinismPosture: 'dynamic',
          isHardOutlier: false,
          migrationDisposition: 'dynamic-review',
          outlierPosture: null,
          agentTypes: [],
        },
      ],
      workflowCoverage: [...base.workflowCoverage, workflow],
      workflowSemantics: [...base.workflowSemantics, workflow.semanticManifest],
    };
  }

  it('returns dispatch-error with UNKNOWN_BRANCH_ID when branchId is not in manifest allowlist', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      branchId: 'mode:unknown',
    }));

    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('UNKNOWN_BRANCH_ID');
    expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
  });

  it('returns dispatch-error with UNKNOWN_BRANCH_ID when branchId is an empty string', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      branchId: '',
    }));

    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('UNKNOWN_BRANCH_ID');
    expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
  });

  it('returns dispatch-error with UNKNOWN_BRANCH_ID when branchId is absent', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      // branchId intentionally omitted - must produce UNKNOWN_BRANCH_ID, not a generic error
    }));

    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('UNKNOWN_BRANCH_ID');
    expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
  });

  it('returns dispatch-error with UNKNOWN_BRANCH_ID when dynamic workflow has empty branchIds in semantics', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch([]));

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      branchId: 'mode:plan',
    }));

    expect(result.kind).toBe('error');
    expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
    expect((result as { message: string }).message).toContain('No branchIds declared');
  });

  it('returns packet when branchId is valid in manifest allowlist', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      branchId: 'mode:plan',
    }));

    expect(result.kind).toBe('packet');
  });

  it('returns dispatch-error when semantic-declared mandatory provider is unavailable and caller omits mandatoryProviders', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      branchId: 'mode:plan',
      providerAvailability: { available: [], unavailable: ['codex'] },
      // mandatoryProviders intentionally omitted
    }));

    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('codex');
    expect('packet' in result).toBe(false);
  });

  it('returns packet when semantic-declared mandatory provider is available', () => {
    const runner = new WorkflowRunner(makeManifestsWithDynamicBranch());

    const result = runner.dispatch(makeDispatchInput({
      commandId: '/gsd-dynamic-test',
      workflowId: '/workflows/dynamic-test',
      branchId: 'mode:execute',
      providerAvailability: { available: ['codex'], unavailable: ['gemini'] },
    }));

    expect(result.kind).toBe('packet');
  });
});
