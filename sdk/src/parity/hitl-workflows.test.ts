import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSuspensionInputProvider } from './mock-factories.js';
import { createGeneratedWorkflowRunner } from '../advisory/workflow-runner.js';

type ParityWorkflowEntry = {
  workflowId: string;
  commandId: string | null;
  parityTier: string;
  suspensionPoints?: string[];
};

const parityIndex: ParityWorkflowEntry[] = JSON.parse(
  readFileSync(join(import.meta.dirname, '../generated/parity/parity-workflow-index.json'), 'utf8'),
) as ParityWorkflowEntry[];

const hitlWorkflows = parityIndex.filter(workflow => workflow.parityTier === 'hitl');
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('Parity: HITL suspension and resume paths (real runner dispatch)', () => {
  it('parity index contains at least one HITL workflow', () => {
    expect(hitlWorkflows.length).toBeGreaterThan(0);
  });

  for (const workflow of hitlWorkflows) {
    const suspensionPoints = workflow.suspensionPoints ?? ['default'];

    for (const suspensionPoint of suspensionPoints) {
      it(`${workflow.workflowId}:${suspensionPoint} - suspend path: runner returns suspend posture`, () => {
        const seam = makeSuspensionInputProvider({
          [`${workflow.workflowId}:${suspensionPoint}`]: 'suspended',
        });
        const runner = createGeneratedWorkflowRunner({ suspensionInputProvider: seam });
        const result = runner.dispatch({
          runId: 'run-hitl-suspend',
          commandId: workflow.commandId ?? undefined,
          workflowId: workflow.workflowId,
          stateId: 'execute',
          stepId: suspensionPoint,
          configSnapshot: {},
        });

        expect(result.kind).toBe('posture');
        if (result.kind === 'posture') {
          expect(result.record.posture).toBe('suspended');
          expect(result.record.workflowId).toBe(workflow.workflowId);
          expect(result.record.suspensionPoint).toBe(suspensionPoint);
        }
      });

      it(`${workflow.workflowId}:${suspensionPoint} - resume-success path: runner result reflects success`, () => {
        const seam = makeSuspensionInputProvider({
          [`${workflow.workflowId}:${suspensionPoint}`]: 'resumed-success',
        });
        const runner = createGeneratedWorkflowRunner({ suspensionInputProvider: seam });
        const result = runner.dispatch({
          runId: 'run-hitl-resume-ok',
          commandId: workflow.commandId ?? undefined,
          workflowId: workflow.workflowId,
          stateId: 'execute',
          stepId: suspensionPoint,
          configSnapshot: {},
        });

        expect(result.kind).not.toBe('error');
        if (result.kind === 'posture') {
          expect(result.record.posture).toBe('resumed-success');
          expect(result.record.workflowId).toBe(workflow.workflowId);
          expect(result.record.suspensionPoint).toBe(suspensionPoint);
        } else if (result.kind === 'packet') {
          expect(result.packet.workflowId).toBe(workflow.workflowId);
          expect(result.packet.stateId).not.toBe('hitl-suspended');
        }
      });

      it(`${workflow.workflowId}:${suspensionPoint} - resume-failure path: runner result reflects typed failure`, () => {
        const seam = makeSuspensionInputProvider({
          [`${workflow.workflowId}:${suspensionPoint}`]: 'resumed-failure',
        });
        const runner = createGeneratedWorkflowRunner({ suspensionInputProvider: seam });
        const result = runner.dispatch({
          runId: 'run-hitl-resume-fail',
          commandId: workflow.commandId ?? undefined,
          workflowId: workflow.workflowId,
          stateId: 'execute',
          stepId: suspensionPoint,
          configSnapshot: {},
        });

        if (result.kind === 'posture') {
          expect(result.record.posture).toBe('resumed-failure');
          expect(result.record.workflowId).toBe(workflow.workflowId);
          expect(result.record.suspensionPoint).toBe(suspensionPoint);
        } else if (result.kind === 'error') {
          expect(result.code).toMatch(/hitl|resume|failure|dispatch/i);
        } else if (result.kind === 'packet') {
          expect(result.packet.workflowId).toBe(workflow.workflowId);
          expect(result.packet.stateId).toMatch(/fail|error|revise|recover/i);
        }
      });
    }
  }
});
