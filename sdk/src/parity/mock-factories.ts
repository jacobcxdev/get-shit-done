import {
  CURRENT_ADVISORY_PACKET_SCHEMA_VERSION,
  type AdvisoryPacket,
} from '../advisory/packet.js';
import type { ProviderAvailabilityResult, ProviderName } from '../advisory/provider-availability.js';
import type {
  HitlOutcome,
  SuspensionInputProvider,
} from '../advisory/workflow-runner.js';
import type { AgentEntry } from '../compile/types.js';

export type {
  HitlOutcome,
  SuspensionInputProvider,
} from '../advisory/workflow-runner.js';

export function makePacket(overrides: Partial<AdvisoryPacket> = {}): AdvisoryPacket {
  return {
    schemaVersion: CURRENT_ADVISORY_PACKET_SCHEMA_VERSION,
    runId: 'run-parity-1',
    workflowId: '/workflows/execute-plan',
    stateId: 'execute',
    stepId: 'execute:plan',
    goal: 'Execute workflow step',
    instruction: 'Execute the plan step and report one allowed outcome.',
    requiredContext: [],
    allowedTools: [],
    agents: ['gsd-executor'],
    expectedEvidence: ['completion-marker:## PLAN COMPLETE'],
    allowedOutcomes: ['success', 'failure'],
    reportCommand: 'Return RuntimeExecutionReport',
    onSuccess: 'verify',
    onFailure: 'blocked',
    checkpoint: false,
    configSnapshotHash: 'test-hash-000',
    extensionIds: [],
    executionConstraints: {},
    ...overrides,
  };
}

export function makeAgentContract(overrides: Partial<AgentEntry> = {}): AgentEntry {
  return {
    id: 'gsd-executor',
    path: 'agents/gsd-executor.md',
    hash: 'a'.repeat(64),
    name: 'gsd-executor',
    description: 'Executes GSD plans.',
    roleClass: 'executor',
    allowedTools: ['Read', 'Edit', 'Bash'],
    diskWriteMandate: false,
    worktreeRequired: false,
    outputArtifacts: [],
    completionMarker: '## PLAN COMPLETE',
    ...overrides,
  };
}

export function makeProviderAvailability(
  available: ProviderName[] = ['claude', 'codex', 'gemini'],
  unavailable: ProviderName[] = [],
): ProviderAvailabilityResult {
  return { available, unavailable };
}

export function makeSuspensionInputProvider(
  outcomes: Record<string, HitlOutcome> = {},
): SuspensionInputProvider {
  return {
    getSuspensionOutcome: (workflowId, suspensionPoint) =>
      outcomes[`${workflowId}:${suspensionPoint}`] ?? 'suspended',
    getResumeInput: () => ({}),
  };
}

export const makeHitlSeam = makeSuspensionInputProvider;
export type HitlSeam = SuspensionInputProvider;

export type LockBehavior = 'conflict' | 'stale' | 'clean';

export function makeLockFactory(
  behavior: LockBehavior,
): { acquire: () => Promise<boolean>; release: () => Promise<void> } {
  return {
    acquire: async () => behavior !== 'conflict' && behavior !== 'stale',
    release: async () => undefined,
  };
}
