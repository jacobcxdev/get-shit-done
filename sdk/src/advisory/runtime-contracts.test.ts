import { describe, expect, it } from 'vitest';
import { CURRENT_ADVISORY_PACKET_SCHEMA_VERSION, type AdvisoryPacket } from './packet.js';
import {
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
    worktreeRequired: true,
    completionMarker: '## PLAN COMPLETE',
    outputArtifacts: ['SUMMARY.md'],
  },
];

describe('runtime contract validation', () => {
  it('emits WorktreeRequired before execution when an agent requires an active worktree', () => {
    const result = validatePreEmitRuntimeContract(packet(), {
      agentContracts: AGENT_CONTRACTS,
      activeWorktree: null,
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: GSDEventType.WorktreeRequired,
      agentId: 'gsd-executor',
      blocksEmission: true,
    }));
  });

  it('emits CompletionMarkerMissing when packet evidence omits completion-marker:## PLAN COMPLETE', () => {
    const result = validatePreEmitRuntimeContract(packet({ expectedEvidence: ['SUMMARY.md'] }), {
      agentContracts: AGENT_CONTRACTS,
      activeWorktree: '/tmp/worktree',
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: GSDEventType.CompletionMarkerMissing,
      agentId: 'gsd-executor',
      requiredMarker: '## PLAN COMPLETE',
    }));
  });

  it('emits blocking CompletionMarkerAbsent when a success report lacks ## PLAN COMPLETE', () => {
    const result = validateRuntimeReportContract({
      packet: packet(),
      report: {
        runId: 'run-1',
        stepId: 'execute:plan',
        outcome: 'success',
        output: 'Summary written without the required marker.',
        evidence: ['SUMMARY.md'],
      },
      agentContracts: AGENT_CONTRACTS,
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: GSDEventType.CompletionMarkerAbsent,
      agentId: 'gsd-executor',
      requiredMarker: '## PLAN COMPLETE',
      blocksTransition: true,
    }));
  });
});
