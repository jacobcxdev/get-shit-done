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

const EXPECTED_HARD_OUTLIERS: Array<{ commandId: string; workflowId: string }> = [
  { commandId: '/gsd-graphify', workflowId: '/workflows/graphify' },
  { commandId: '/gsd-from-gsd2', workflowId: '/workflows/from-gsd2' },
  { commandId: '/gsd-ultraplan-phase', workflowId: '/workflows/ultraplan-phase' },
  { commandId: '/gsd-review', workflowId: '/workflows/review' },
  { commandId: '/gsd-fast', workflowId: '/workflows/fast' },
];

describe('Parity: hard-outlier posture (exact posture record, no packet)', () => {
  const runner = createGeneratedWorkflowRunner();

  it('parity index classifies all 5 hard-outlier workflows as hard-outlier tier', () => {
    const indexOutliers = parityIndex.filter(
      workflow => workflow.parityTier === 'hard-outlier' && workflow.category === 'hard-outlier',
    );

    for (const expected of EXPECTED_HARD_OUTLIERS) {
      expect(
        indexOutliers.some(workflow => workflow.commandId === expected.commandId),
        `${expected.commandId} must be in parity index as hard-outlier`,
      ).toBe(true);
    }
    expect(indexOutliers.length).toBe(5);
  });

  for (const outlier of EXPECTED_HARD_OUTLIERS) {
    it(`${outlier.commandId} returns exact hard-outlier posture record (not packet, not error)`, () => {
      const result = runner.dispatch({
        runId: 'run-parity-outlier',
        commandId: outlier.commandId,
        workflowId: outlier.workflowId,
        stateId: 'execute',
        stepId: 'x',
        configSnapshot: {},
      });

      expect(result.kind).toBe('posture');
      expect(result.kind).not.toBe('packet');
      expect(result.kind).not.toBe('error');
      if (result.kind === 'posture') {
        expect(result.record.posture).toBe('hard-outlier');
        expect(result.record.emitsPacket).toBe(false);
        expect(result.record.workflowId).toBe(outlier.workflowId);
      }
    });
  }
});
