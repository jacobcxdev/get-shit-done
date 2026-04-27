import { describe, expect, it } from 'vitest';
import { CURRENT_ADVISORY_PACKET_SCHEMA_VERSION } from '../advisory/packet.js';
import { validateAdvisoryPacketDefinitions, validatePacketAtomicity } from './packet-contracts.js';
import type { AgentEntry, CompileDiagnostic } from './types.js';
import type { PacketDefinitionCandidate } from './inventory/packets.js';

function agent(overrides: Partial<AgentEntry> = {}): AgentEntry {
  return {
    id: 'gsd-demo',
    path: 'agents/gsd-demo.md',
    hash: 'hash',
    name: 'Demo',
    description: 'Demo agent',
    roleClass: 'executor',
    allowedTools: ['Read'],
    diskWriteMandate: false,
    worktreeRequired: false,
    outputArtifacts: [],
    ...overrides,
  };
}

function packet(overrides: Partial<PacketDefinitionCandidate> = {}): PacketDefinitionCandidate {
  return {
    schemaVersion: CURRENT_ADVISORY_PACKET_SCHEMA_VERSION,
    runId: 'run-1',
    workflowId: 'workflow-a',
    stateId: 'state-a',
    stepId: 'step-a',
    goal: 'Do one thing',
    instruction: 'Inspect one packet candidate.',
    requiredContext: ['PROJECT.md'],
    allowedTools: ['Read'],
    agents: ['gsd-demo'],
    expectedEvidence: ['packet checked'],
    allowedOutcomes: ['success', 'failure'],
    reportCommand: 'gsd-sdk report run-1 step-a',
    onSuccess: 'next',
    onFailure: 'failed',
    checkpoint: false,
    configSnapshotHash: 'a'.repeat(64),
    extensionIds: [],
    executionConstraints: { provider: 'claude' },
    sourcePath: 'fixtures/packet.json',
    actionCount: 1,
    actions: [{ id: 'action-1', instruction: 'Inspect one packet candidate.' }],
    ...overrides,
  };
}

describe('validateAdvisoryPacketDefinitions', () => {
  it('emits PCKT-02 with workflowId, stepId, and field for missing fields', () => {
    const candidate = packet() as Record<string, unknown>;
    delete candidate.goal;
    const diagnostics: CompileDiagnostic[] = [];

    validateAdvisoryPacketDefinitions([candidate as PacketDefinitionCandidate], [agent()], diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-02',
      id: 'workflow-a',
      path: 'workflow-a#step-a',
      field: 'goal',
      message: expect.stringContaining('workflow-a#step-a'),
    }));
  });

  it('emits PCKT-08 for unknown agents', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateAdvisoryPacketDefinitions([packet({ agents: ['gsd-missing'] })], [agent()], diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-08',
      field: 'agents',
      message: expect.stringContaining('gsd-missing'),
    }));
  });

  it('emits PCKT-08 for allowedTools outside the targeted agent contract', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validateAdvisoryPacketDefinitions([packet({ allowedTools: ['Bash'] })], [agent()], diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-08',
      field: 'allowedTools',
      message: expect.stringContaining('Bash'),
    }));
  });

  it('requires diskWriteMandate agents to receive a permitted disk-write tool', () => {
    const diagnosticsWithoutWrite: CompileDiagnostic[] = [];
    const diagnosticsWithWrite: CompileDiagnostic[] = [];
    const writer = agent({ allowedTools: ['Read', 'Write'], diskWriteMandate: true });

    validateAdvisoryPacketDefinitions([packet({ allowedTools: ['Read'] })], [writer], diagnosticsWithoutWrite);
    validateAdvisoryPacketDefinitions([packet({ allowedTools: ['Read', 'Write'] })], [writer], diagnosticsWithWrite);

    expect(diagnosticsWithoutWrite).toContainEqual(expect.objectContaining({
      code: 'PCKT-08',
      field: 'allowedTools',
      message: expect.stringContaining('diskWriteMandate'),
    }));
    expect(diagnosticsWithWrite.filter((diagnostic) => diagnostic.code === 'PCKT-08')).toEqual([]);
  });

  it('emits PCKT-08 for missing completionMarker and outputArtifacts evidence', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const obligatedAgent = agent({
      completionMarker: '## DONE',
      outputArtifacts: ['SUMMARY.md'],
    });

    validateAdvisoryPacketDefinitions([packet({ expectedEvidence: [] })], [obligatedAgent], diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-08',
      field: 'expectedEvidence',
      message: expect.stringContaining('completionMarker'),
    }));
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-08',
      field: 'expectedEvidence',
      message: expect.stringContaining('SUMMARY.md'),
    }));
  });
});

describe('validatePacketAtomicity', () => {
  it('emits PCKT-04 when actionCount is 2', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validatePacketAtomicity([packet({ actionCount: 2, actions: undefined })], diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-04',
      field: 'actionCount',
      message: 'coarse packet in workflow-a step step-a: actionCount 2 must be 1',
    }));
  });

  it('emits PCKT-04 when actions length disagrees with actionCount', () => {
    const diagnostics: CompileDiagnostic[] = [];

    validatePacketAtomicity([packet({ actionCount: 2, actions: [{ id: 'action-1', instruction: 'Do one thing.' }] })], diagnostics);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-04',
      field: 'actions',
      message: expect.stringContaining('disagrees with actions length 1'),
    }));
  });
});
