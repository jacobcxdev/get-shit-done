import { describe, expect, it } from 'vitest';
import { CURRENT_ADVISORY_PACKET_SCHEMA_VERSION, type AdvisoryPacket } from './packet.js';
import {
  type RuntimeExecutionReport,
  validatePreEmitRuntimeContract,
  validateRuntimeReportContract,
} from './runtime-contracts.js';
import { GSDEventType } from '../types.js';

function packet(overrides: Partial<AdvisoryPacket> = {}): AdvisoryPacket {
  return {
    schemaVersion: CURRENT_ADVISORY_PACKET_SCHEMA_VERSION,
    runId: 'run-1',
    workflowId: '/workflows/execute-plan',
    stateId: 'execute',
    stepId: 'execute:plan',
    goal: 'Execute one plan.',
    instruction: 'Execute plan 03-01.',
    requiredContext: ['.planning/PROJECT.md'],
    allowedTools: ['Read', 'Write'],
    agents: ['gsd-executor'],
    expectedEvidence: ['completion-marker:## PLAN COMPLETE'],
    allowedOutcomes: ['success', 'failure'],
    reportCommand: 'gsd-sdk report run-1 execute:plan',
    onSuccess: 'verify',
    onFailure: 'blocked',
    checkpoint: false,
    configSnapshotHash: 'a'.repeat(64),
    extensionIds: [],
    executionConstraints: { provider: 'claude' },
    ...overrides,
  };
}

const AGENT_CONTRACTS = [
  {
    id: 'gsd-executor',
    path: 'agents/gsd-executor.md',
    hash: 'a'.repeat(64),
    name: 'gsd-executor',
    description: 'Executes GSD plans.',
    roleClass: 'executor' as const,
    allowedTools: ['Read', 'Write'],
    diskWriteMandate: true,
    worktreeRequired: true,
    completionMarker: '## PLAN COMPLETE',
    outputArtifacts: ['SUMMARY.md'],
  },
];

describe('runtime contract validation', () => {
  it('emits WorktreeRequired before execution when an agent requires an active worktree', () => {
    const events = validatePreEmitRuntimeContract(packet(), AGENT_CONTRACTS, {
      activeWorktreePath: null,
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: GSDEventType.WorktreeRequired,
      code: 'WORKTREE_REQUIRED',
      message: "Packet targets agent 'gsd-executor' which requires an active git worktree",
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      blocksEmission: true,
      recoveryHint: 'Activate a git worktree before dispatching this packet, then retry',
    }));
  });

  it('emits CompletionMarkerMissing when packet evidence omits completion-marker:## PLAN COMPLETE', () => {
    const events = validatePreEmitRuntimeContract(packet({ expectedEvidence: ['SUMMARY.md'] }), AGENT_CONTRACTS, {
      activeWorktreePath: '/tmp/worktree',
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: GSDEventType.CompletionMarkerMissing,
      code: 'COMPLETION_MARKER_MISSING',
      message:
        "Packet for workflowId='/workflows/execute-plan' stepId='execute:plan' is missing required completion marker declaration",
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      expectedMarkers: ['## PLAN COMPLETE'],
      blocksEmission: true,
      recoveryHint: 'Add expected evidence declaration to the packet definition then re-compile',
    }));
  });

  it('emits blocking CompletionMarkerAbsent when a success report lacks ## PLAN COMPLETE', () => {
    const events = validateRuntimeReportContract({
      runId: 'run-1',
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      outcome: 'success',
      markers: [],
      artifacts: ['SUMMARY.md'],
    }, packet(), AGENT_CONTRACTS);

    expect(events).toContainEqual(expect.objectContaining({
      type: GSDEventType.CompletionMarkerAbsent,
      code: 'COMPLETION_MARKER_ABSENT',
      message:
        "Required marker '## PLAN COMPLETE' was not found after runtime success for workflowId='/workflows/execute-plan' stepId='execute:plan'",
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      markerId: '## PLAN COMPLETE',
      expectedMarkers: ['## PLAN COMPLETE'],
      blocksTransition: true,
      recoveryHint: 'Re-run the agent step or verify the required marker was written, then retry the FSM transition',
    }));
  });

  it('emits blocking CompletionMarkerAbsent when a success report lacks required artifacts', () => {
    const events = validateRuntimeReportContract({
      runId: 'run-1',
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      outcome: 'success',
      markers: ['## PLAN COMPLETE'],
      artifacts: [],
    }, packet(), AGENT_CONTRACTS);

    expect(events).toContainEqual(expect.objectContaining({
      type: GSDEventType.CompletionMarkerAbsent,
      code: 'COMPLETION_MARKER_ABSENT',
      message:
        "Required artifact 'SUMMARY.md' was not found after runtime success for workflowId='/workflows/execute-plan' stepId='execute:plan'",
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      expectedMarkers: [],
      artifactPaths: ['SUMMARY.md'],
      blocksTransition: true,
      recoveryHint: 'Re-run the agent step or verify the required marker was written, then retry the FSM transition',
    }));
    expect(events[0]).not.toHaveProperty('markerId');
  });

  it('preserves non-success RuntimeExecutionReport outcomes without marker or artifact absence checks', () => {
    const report = {
      runId: 'run-1',
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      outcome: 'failure',
      markers: [],
      artifacts: [],
    };

    const events = validateRuntimeReportContract(report, packet(), AGENT_CONTRACTS);

    expect(report.outcome).toBe('failure');
    expect(events).toEqual([]);
  });
});

describe('validateRuntimeReportContract — Wave 0 trust-boundary hardening', () => {
  function makeReport(overrides: Partial<RuntimeExecutionReport> = {}): RuntimeExecutionReport {
    return {
      runId: 'run-1',
      workflowId: '/workflows/execute-plan',
      stepId: 'execute:plan',
      agentId: 'gsd-executor',
      outcome: 'success',
      markers: ['## PLAN COMPLETE'],
      artifacts: [],
      ...overrides,
    };
  }

  it('emits UNDECLARED_AGENT blocking event when agentId is not in packet.agents', () => {
    const p = packet({ agents: ['gsd-verifier'] });
    const report = makeReport({ agentId: 'gsd-executor', outcome: 'success' });
    const events = validateRuntimeReportContract(report, p, AGENT_CONTRACTS);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: GSDEventType.UndeclaredAgentReportRejected,
      code: 'UNDECLARED_AGENT',
      agentId: 'gsd-executor',
      blocksTransition: true,
    });
  });

  it('returns early with only UNDECLARED_AGENT when agent undeclared — does not run evidence loop', () => {
    const p = packet({ agents: ['gsd-verifier'], expectedEvidence: ['missing-item'] });
    const report = makeReport({ agentId: 'gsd-executor', outcome: 'success', markers: [], artifacts: [] });
    const events = validateRuntimeReportContract(report, p, AGENT_CONTRACTS);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ code: 'UNDECLARED_AGENT' });
  });

  it('emits EXPECTED_EVIDENCE_ABSENT when evidence item missing from markers and artifacts', () => {
    const p = packet({
      agents: ['gsd-executor'],
      expectedEvidence: ['completion-marker:## PLAN COMPLETE', 'my-artifact.md'],
    });
    const report = makeReport({
      agentId: 'gsd-executor',
      outcome: 'success',
      markers: ['## PLAN COMPLETE'],
      artifacts: [],
    });
    const events = validateRuntimeReportContract(report, p, AGENT_CONTRACTS);
    expect(events).toContainEqual(expect.objectContaining({
      type: GSDEventType.ExpectedEvidenceAbsent,
      code: 'EXPECTED_EVIDENCE_ABSENT',
      evidenceId: 'my-artifact.md',
      blocksTransition: true,
    }));
  });

  it('emits no blocking events when all expectedEvidence items are present in markers', () => {
    const p = packet({
      agents: ['gsd-executor'],
      expectedEvidence: ['completion-marker:## PLAN COMPLETE'],
    });
    const report = makeReport({
      agentId: 'gsd-executor',
      outcome: 'success',
      markers: ['## PLAN COMPLETE'],
      artifacts: ['SUMMARY.md'],
    });
    const events = validateRuntimeReportContract(report, p, AGENT_CONTRACTS);
    const blocking = events.filter(e => (e as { blocksTransition?: boolean }).blocksTransition === true);
    expect(blocking).toHaveLength(0);
  });
});
