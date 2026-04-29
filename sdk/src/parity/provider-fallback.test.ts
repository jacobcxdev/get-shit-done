import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WorkflowRunner,
  type WorkflowRunnerManifests,
} from '../advisory/workflow-runner.js';
import {
  advanceFsmState,
  createInitialFsmRunState,
  fsmStatePath,
  writeFsmState,
  type FsmTransitionHistoryEntry,
} from '../advisory/fsm-state.js';
import { ExtensionRegistry } from '../advisory/extension-registry.js';
import { makeProviderAvailability } from './mock-factories.js';

// Inline manifest factory for a workflow that is NOT hard-outlier and NOT dynamic-branch
function makeSimpleManifests(): WorkflowRunnerManifests {
  return {
    commandClassification: [{
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      category: 'core-lifecycle',
      isHardOutlier: false,
      determinismPosture: 'deterministic',
      agentTypes: ['gsd-planner'],
      outlierPosture: null,
    }],
    workflowCoverage: [{
      id: '/workflows/plan-phase',
      runnerType: { value: 'phase-chain' },
      determinism: { value: 'deterministic' },
      stepCount: 1,
    }],
    workflowSemantics: [{
      workflowId: '/workflows/plan-phase',
      semantics: [],
    }],
  };
}

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gsd-provider-fallback-'));
  dirs.push(dir);
  return dir;
}

describe('Parity: provider-fallback reduced-confidence transitions', () => {
  it('dispatch returns packet with providerMetadata when a non-mandatory provider is unavailable', () => {
    const runner = new WorkflowRunner(makeSimpleManifests());
    const result = runner.dispatch({
      runId: 'run-1',
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      stateId: 'plan',
      stepId: 'plan:create',
      configSnapshot: {},
      providerAvailability: makeProviderAvailability(['claude'], ['codex', 'gemini']),
    });
    expect(result.kind).toBe('packet');
    if (result.kind === 'packet') {
      expect(result.providerMetadata).toBeDefined();
      expect(result.providerMetadata?.providerConfidence).toBe('reduced');
      expect(result.providerMetadata?.missingProviders).toContain('codex');
      expect(result.providerMetadata?.missingProviders).toContain('gemini');
    }
  });

  it('dispatch returns packet with no providerMetadata when all providers available', () => {
    const runner = new WorkflowRunner(makeSimpleManifests());
    const result = runner.dispatch({
      runId: 'run-1',
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      stateId: 'plan',
      stepId: 'plan:create',
      configSnapshot: {},
      providerAvailability: makeProviderAvailability(['claude', 'codex', 'gemini'], []),
    });
    expect(result.kind).toBe('packet');
    if (result.kind === 'packet') {
      expect(result.providerMetadata).toBeUndefined();
    }
  });

  it('dispatch returns error when a mandatory provider is unavailable (no silent fallback)', () => {
    const runner = new WorkflowRunner(makeSimpleManifests());
    const result = runner.dispatch({
      runId: 'run-1',
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      stateId: 'plan',
      stepId: 'plan:create',
      configSnapshot: {},
      providerAvailability: makeProviderAvailability(['claude'], ['codex']),
      mandatoryProviders: ['codex'],
    });
    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('codex');
  });

  // PRTY-03 / issue 8: verify the atomic transition-history persistence path shape.
  // The providerMetadata fields returned on the dispatch packet are passed through
  // advanceFsmState(), which stores providerConfidence, missingProviders, and
  // reducedConfidence atomically in the FsmTransitionHistoryEntry.
  it('reduced-confidence dispatch returns providerMetadata matching FsmTransitionHistoryEntry atomic write shape', async () => {
    const runner = new WorkflowRunner(makeSimpleManifests());
    const result = runner.dispatch({
      runId: 'run-atomic',
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      stateId: 'plan',
      stepId: 'plan:create',
      configSnapshot: {},
      providerAvailability: makeProviderAvailability(['claude'], ['codex', 'gemini']),
    });
    expect(result.kind).toBe('packet');
    if (result.kind === 'packet') {
      const meta = result.providerMetadata;
      expect(meta).toBeDefined();
      expect(meta?.providerConfidence).toBe('reduced');
      expect(Array.isArray(meta?.missingProviders)).toBe(true);
      expect(meta?.missingProviders).toContain('codex');
      expect(meta?.missingProviders).toContain('gemini');

      const projectDir = await makeTempProject();
      await writeFsmState(projectDir, undefined, createInitialFsmRunState({
        runId: 'run-atomic',
        workflowId: '/workflows/plan-phase',
        workstream: null,
        currentState: 'plan',
        config: {},
        now: '2026-04-28T00:00:00.000Z',
      }));

      await advanceFsmState({
        projectDir,
        toState: 'execute',
        outcome: 'success',
        providerMetadata: meta,
      });

      const persisted = JSON.parse(await readFile(fsmStatePath(projectDir), 'utf-8')) as {
        transitionHistory: FsmTransitionHistoryEntry[];
      };
      const entry = persisted.transitionHistory[0];
      expect(entry?.providerConfidence).toBe('reduced');
      expect(entry?.missingProviders).toEqual(['codex', 'gemini']);
      expect(entry?.reducedConfidence).toBe(true);
    }
  });

  it('extension provider check reduced metadata persists custom provider name', async () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'provider-check',
      extensionId: 'my-provider-ext',
      providerName: 'my-cloud',
      check: () => ({ available: [], unavailable: ['my-cloud'] }),
    });
    const sealedGraph = registry.finalize();

    const runner = new WorkflowRunner(makeSimpleManifests(), {}, sealedGraph);
    const result = runner.dispatch({
      runId: 'run-provider-ext',
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      stateId: 'plan',
      stepId: 'plan:create',
      configSnapshot: {},
    });

    expect(result.kind).toBe('packet');
    if (result.kind !== 'packet') throw new Error('Expected packet');
    expect(result.providerMetadata?.providerConfidence).toBe('reduced');
    expect(result.providerMetadata?.missingProviders).toEqual(['my-cloud']);

    const projectDir = await makeTempProject();
    await writeFsmState(projectDir, undefined, createInitialFsmRunState({
      runId: 'run-provider-ext',
      workflowId: '/workflows/plan-phase',
      workstream: null,
      currentState: 'plan',
      config: {},
      now: '2026-04-28T00:00:00.000Z',
    }));

    await advanceFsmState({
      projectDir,
      toState: 'execute',
      outcome: 'success',
      providerMetadata: result.providerMetadata,
    });

    const persisted = JSON.parse(await readFile(fsmStatePath(projectDir), 'utf-8')) as {
      transitionHistory: FsmTransitionHistoryEntry[];
    };
    const entry = persisted.transitionHistory[0];
    expect(entry?.missingProviders).toEqual(['my-cloud']);
    expect(entry?.missingProvider).toBe('my-cloud');
    expect(entry?.providerConfidence).toBe('reduced');
  });

  it('extension provider check blocks mandatory custom provider', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'provider-check',
      extensionId: 'my-provider-ext',
      providerName: 'my-cloud',
      check: () => ({ available: [], unavailable: ['my-cloud'] }),
    });
    const sealedGraph = registry.finalize();

    const runner = new WorkflowRunner(makeSimpleManifests(), {}, sealedGraph);
    const result = runner.dispatch({
      runId: 'run-mandatory-ext',
      commandId: '/gsd-plan-phase',
      workflowId: '/workflows/plan-phase',
      stateId: 'plan',
      stepId: 'plan:create',
      configSnapshot: {},
      mandatoryProviders: ['my-cloud'],
    });

    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('Mandatory providers unavailable: my-cloud');
  });
});
