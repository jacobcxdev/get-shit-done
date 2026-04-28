import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGeneratedWorkflowRunner } from '../advisory/workflow-runner.js';

type ParityWorkflowEntry = {
  workflowId: string;
  commandId: string | null;
  category: string;
  parityTier: string;
  branchIds?: string[];
};

const parityIndex: ParityWorkflowEntry[] = JSON.parse(
  readFileSync(join(import.meta.dirname, '../generated/parity/parity-workflow-index.json'), 'utf8'),
) as ParityWorkflowEntry[];

describe('Parity: dynamic-branch workflows - all branches, all invalid cases', () => {
  const runner = createGeneratedWorkflowRunner();
  const dynamicWorkflows = parityIndex.filter(workflow => workflow.parityTier === 'dynamic-branch');

  it('parity index contains at least one dynamic-branch workflow', () => {
    expect(dynamicWorkflows.length).toBeGreaterThan(0);
  });

  for (const workflow of dynamicWorkflows) {
    const branchIds = workflow.branchIds ?? [];

    for (const branchId of branchIds) {
      it(`valid branchId '${branchId}' in ${workflow.workflowId} returns packet`, () => {
        const result = runner.dispatch({
          runId: 'run-parity-dyn',
          commandId: workflow.commandId ?? undefined,
          workflowId: workflow.workflowId,
          stateId: 'execute',
          stepId: 'x',
          branchId,
          configSnapshot: {},
        });

        expect(result.kind).toBe('packet');
      });
    }

    it(`unknown branchId '__invalid__' in ${workflow.workflowId} returns UNKNOWN_BRANCH_ID error`, () => {
      const result = runner.dispatch({
        runId: 'run-parity-dyn',
        commandId: workflow.commandId ?? undefined,
        workflowId: workflow.workflowId,
        stateId: 'execute',
        stepId: 'x',
        branchId: '__invalid_branch__',
        configSnapshot: {},
      });

      expect(result.kind).toBe('error');
      expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
    });

    it(`empty string branchId in ${workflow.workflowId} returns UNKNOWN_BRANCH_ID error`, () => {
      const result = runner.dispatch({
        runId: 'run-parity-dyn',
        commandId: workflow.commandId ?? undefined,
        workflowId: workflow.workflowId,
        stateId: 'execute',
        stepId: 'x',
        branchId: '',
        configSnapshot: {},
      });

      expect(result.kind).toBe('error');
      expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
    });

    it(`absent branchId (omitted) in ${workflow.workflowId} returns UNKNOWN_BRANCH_ID error`, () => {
      const result = runner.dispatch({
        runId: 'run-parity-dyn',
        commandId: workflow.commandId ?? undefined,
        workflowId: workflow.workflowId,
        stateId: 'execute',
        stepId: 'x',
        configSnapshot: {},
      });

      expect(result.kind).toBe('error');
      expect((result as { diagnosticCode?: string }).diagnosticCode).toBe('UNKNOWN_BRANCH_ID');
    });
  }
});
