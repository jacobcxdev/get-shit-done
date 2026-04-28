import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGeneratedWorkflowRunner } from '../advisory/workflow-runner.js';

type ParityWorkflowEntry = {
  workflowId: string | null;
  commandId: string | null;
  category: string;
  parityTier: string;
};

const parityIndex: ParityWorkflowEntry[] = JSON.parse(
  readFileSync(join(import.meta.dirname, '../generated/parity/parity-workflow-index.json'), 'utf8'),
) as ParityWorkflowEntry[];

const REQUIRED_PACKET_FIELDS = [
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

describe('Parity: deterministic workflow round-trip (all deterministic entries)', () => {
  const runner = createGeneratedWorkflowRunner();
  const deterministicWorkflows = parityIndex.filter(
    (workflow): workflow is ParityWorkflowEntry & { workflowId: string } =>
      workflow.parityTier === 'deterministic' &&
      workflow.category !== 'composite' &&
      typeof workflow.workflowId === 'string',
  );

  it('parity index contains at least one deterministic workflow', () => {
    expect(deterministicWorkflows.length).toBeGreaterThan(0);
  });

  for (const workflow of deterministicWorkflows) {
    it(`round-trip: ${workflow.workflowId} emits packet with all required fields`, () => {
      const result = runner.dispatch({
        runId: 'run-parity-det',
        commandId: workflow.commandId ?? undefined,
        workflowId: workflow.workflowId,
        stateId: 'execute',
        stepId: 'execute:step',
        configSnapshot: {},
      });

      expect(result.kind).toBe('packet');
      if (result.kind === 'packet') {
        for (const field of REQUIRED_PACKET_FIELDS) {
          expect(result.packet, `${workflow.workflowId}: missing field ${field}`).toHaveProperty(field);
        }
      }
    });
  }

  it('tested deterministic workflow count equals committed parity index count', () => {
    const indexCount = parityIndex.filter(
      workflow =>
        workflow.parityTier === 'deterministic' &&
        workflow.category !== 'composite' &&
        typeof workflow.workflowId === 'string',
    ).length;
    expect(deterministicWorkflows.length).toBe(indexCount);
  });
});
