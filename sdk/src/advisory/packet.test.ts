import { describe, expect, it } from 'vitest';
import { CURRENT_ADVISORY_PACKET_SCHEMA_VERSION, validateAdvisoryPacket } from './packet.js';

const REQUIRED_FIELDS = [
  'schemaVersion',
  'runId',
  'workflowId',
  'stateId',
  'stepId',
  'goal',
  'instruction',
  'requiredContext',
  'allowedTools',
  'agents',
  'expectedEvidence',
  'allowedOutcomes',
  'reportCommand',
  'onSuccess',
  'onFailure',
  'checkpoint',
  'configSnapshotHash',
  'extensionIds',
  'executionConstraints',
];

function validPacket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  };
}

describe('validateAdvisoryPacket', () => {
  it('accepts a valid packet', () => {
    expect(validateAdvisoryPacket(validPacket())).toEqual([]);
  });

  it.each(REQUIRED_FIELDS)('rejects missing required field %s', (field) => {
    const packet = validPacket();
    delete packet[field];
    const workflowId = field === 'workflowId' ? 'unknown' : 'workflow-a';
    const stepId = field === 'stepId' ? 'unknown' : 'step-a';

    expect(validateAdvisoryPacket(packet)).toContainEqual(expect.objectContaining({
      code: 'missing-field',
      field,
      workflowId,
      stepId,
    }));
  });

  it('rejects schemaVersion 2 with version-mismatch', () => {
    expect(validateAdvisoryPacket(validPacket({ schemaVersion: 2 }))).toContainEqual(expect.objectContaining({
      code: 'version-mismatch',
      field: 'schemaVersion',
    }));
  });

  it('rejects configSnapshotHash values that are not 64 lowercase hex characters', () => {
    expect(validateAdvisoryPacket(validPacket({ configSnapshotHash: 'z'.repeat(64) }))).toContainEqual(expect.objectContaining({
      code: 'invalid-field',
      field: 'configSnapshotHash',
    }));
    expect(validateAdvisoryPacket(validPacket({ configSnapshotHash: 'a'.repeat(63) }))).toContainEqual(expect.objectContaining({
      code: 'invalid-field',
      field: 'configSnapshotHash',
    }));
  });

  it('rejects Codex packets when run_in_background is omitted', () => {
    expect(validateAdvisoryPacket(validPacket({ executionConstraints: { provider: 'codex' } }))).toContainEqual(expect.objectContaining({
      code: 'invalid-field',
      field: 'executionConstraints.run_in_background',
    }));
  });

  it('rejects Codex packets when run_in_background is true', () => {
    expect(validateAdvisoryPacket(
      validPacket({ executionConstraints: { provider: 'codex', run_in_background: true } }),
    )).toContainEqual(expect.objectContaining({
      code: 'invalid-field',
      field: 'executionConstraints.run_in_background',
    }));
  });

  it('includes field, workflowId, and stepId on malformed packet issues', () => {
    expect(validateAdvisoryPacket(validPacket({
      workflowId: 'workflow-b',
      stepId: 'step-b',
      configSnapshotHash: 'not-a-hash',
    }))).toContainEqual(expect.objectContaining({
      field: 'configSnapshotHash',
      workflowId: 'workflow-b',
      stepId: 'step-b',
    }));
  });
});
