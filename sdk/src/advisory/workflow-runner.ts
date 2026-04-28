import { createRequire } from 'node:module';
import {
  CURRENT_ADVISORY_PACKET_SCHEMA_VERSION,
  type AdvisoryPacket,
} from './packet.js';
import {
  normalizeProviderList,
  type ProviderAvailabilityResult,
  type ProviderName,
  type ProviderTransitionMetadata,
} from './provider-availability.js';
import { configSnapshotHash } from './routing.js';
import {
  validatePreEmitRuntimeContract,
  type RuntimeWorktreeContext,
} from './runtime-contracts.js';
import type { WorkflowSemanticManifest } from './workflow-semantics.js';
import type { AgentEntry, ClassificationEntry, WorkflowEntry } from '../compile/types.js';

export type WorkflowSupportDisposition =
  | 'packet-template'
  | 'dynamic-branch'
  | 'composite-review'
  | 'hard-outlier'
  | 'query-native'
  | 'dispatch-error';

export type WorkflowPostureRecord = {
  commandId?: string;
  workflowId?: string;
  posture: 'hard-outlier' | 'composite-review' | 'unknown' | 'query-native';
  reason: string;
  emitsPacket: false;
};

export type WorkflowRunnerResult =
  | { kind: 'packet'; packet: AdvisoryPacket; providerMetadata?: ProviderTransitionMetadata }
  | {
    kind: 'posture';
    record: WorkflowPostureRecord;
    workflowId?: string;
    posture: WorkflowPostureRecord['posture'];
  }
  | {
    kind: 'error';
    code: 'startup-error' | 'dispatch-error' | 'missing-workflow';
    diagnosticCode?: 'UNKNOWN_BRANCH_ID';
    message: string;
    workflowId?: string;
    commandId?: string;
  };

export type WorkflowRunnerManifests = {
  commandClassification: ClassificationEntry[];
  workflowCoverage: WorkflowEntry[];
  workflowSemantics: WorkflowSemanticManifest[];
};

export type WorkflowRunnerDispatchInput = {
  runId: string;
  commandId?: string;
  workflowId?: string;
  stateId: string;
  stepId: string;
  configSnapshot: Record<string, unknown>;
  branchId?: string;
  onSuccess?: string;
  onFailure?: string;
  providerAvailability?: ProviderAvailabilityResult;
  mandatoryProviders?: ProviderName[];
  agentContracts?: AgentEntry[];
  worktreeContext?: RuntimeWorktreeContext;
};

export type WorkflowSupportMatrixEntry = {
  commandId?: string;
  workflowId: string;
  category: ClassificationEntry['category'] | 'unknown';
  runnerType: string;
  determinismPosture: ClassificationEntry['determinismPosture'] | WorkflowEntry['determinism']['value'];
  disposition: WorkflowSupportDisposition;
  reason: string;
};

export class WorkflowRunnerError extends Error {
  constructor(
    public readonly code: 'startup-error' | 'dispatch-error' | 'missing-workflow',
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowRunnerError';
  }
}

const GENERATED_MANIFEST_REQUIRE = createRequire(import.meta.url);
const REPORT_COMMAND =
  'Return RuntimeExecutionReport via runtimeReportHandler with runId, workflowId, stepId, outcome from packet.allowedOutcomes, markers, and artifacts';

function isNonEmptyArray<T>(value: T[]): boolean {
  return Array.isArray(value) && value.length > 0;
}

function postureForDisposition(disposition: WorkflowSupportDisposition): WorkflowPostureRecord['posture'] {
  if (disposition === 'hard-outlier') return 'hard-outlier';
  if (disposition === 'composite-review') return 'composite-review';
  if (disposition === 'query-native') return 'query-native';
  return 'unknown';
}

function reasonForDisposition(
  disposition: WorkflowSupportDisposition,
  workflowId: string | undefined,
  classification: ClassificationEntry | undefined,
): string {
  switch (disposition) {
    case 'hard-outlier':
      return classification?.outlierPosture ?? 'Workflow is classified as a hard outlier and is not packetized.';
    case 'query-native':
      return 'Workflow is a native query utility and should execute through query handlers.';
    case 'composite-review':
      return 'Workflow is composite and requires review before recursive packetization.';
    case 'dynamic-branch':
      return `Workflow ${workflowId ?? 'unknown'} requires an explicit branchId for deterministic dispatch.`;
    case 'dispatch-error':
      return `Workflow ${workflowId ?? 'unknown'} is not dispatchable from the supplied manifests.`;
    case 'packet-template':
      return 'Workflow has deterministic packet-template support.';
  }
}

function dispositionFor(
  workflowId: string,
  classification: ClassificationEntry | undefined,
  workflow: WorkflowEntry | undefined,
): WorkflowSupportDisposition {
  if (classification?.isHardOutlier === true) return 'hard-outlier';
  if (classification?.category === 'query-utility') return 'query-native';
  if (classification?.category === 'composite') return 'composite-review';
  if (classification?.category === 'dynamic-branch') return 'dynamic-branch';
  if (!classification?.workflowId || !workflow) return 'dispatch-error';
  return 'packet-template';
}

function unavailableMandatoryProviders(
  availability: ProviderAvailabilityResult | undefined,
  mandatoryProviders: ProviderName[] | undefined,
): ProviderName[] {
  if (!availability || !mandatoryProviders || mandatoryProviders.length === 0) {
    return [];
  }
  const unavailable = new Set(normalizeProviderList(availability.unavailable));
  return normalizeProviderList(mandatoryProviders).filter(provider => unavailable.has(provider));
}

function branchIdsForWorkflow(
  workflowId: string,
  semantics: WorkflowSemanticManifest[],
): string[] {
  const entry = semantics.find(semantic => semantic.workflowId === workflowId);
  return [
    ...new Set(
      (entry?.semantics ?? [])
        .flatMap(semantic => ('branchIds' in semantic ? semantic.branchIds : []))
        .filter((branchId): branchId is string => typeof branchId === 'string' && branchId.trim() !== ''),
    ),
  ].sort();
}

function mandatoryProvidersForWorkflow(
  workflowId: string,
  semantics: WorkflowSemanticManifest[],
): ProviderName[] {
  const entry = semantics.find(semantic => semantic.workflowId === workflowId);
  return normalizeProviderList(
    (entry?.semantics ?? [])
      .flatMap(semantic => ('mandatoryProviders' in semantic ? semantic.mandatoryProviders ?? [] : [])),
  );
}

function reducedProviderMetadata(
  availability: ProviderAvailabilityResult | undefined,
): ProviderTransitionMetadata | undefined {
  const missingProviders = normalizeProviderList(availability?.unavailable ?? []);
  if (missingProviders.length === 0) {
    return undefined;
  }
  return {
    providerConfidence: 'reduced',
    missingProviders,
  };
}

export class WorkflowRunner {
  private readonly commandsById = new Map<string, ClassificationEntry>();
  private readonly workflowsById = new Map<string, WorkflowEntry>();
  private readonly supportByWorkflowId = new Map<string, WorkflowSupportMatrixEntry>();

  constructor(private readonly manifests: WorkflowRunnerManifests) {
    if (
      !isNonEmptyArray(manifests.commandClassification) ||
      !isNonEmptyArray(manifests.workflowCoverage) ||
      !isNonEmptyArray(manifests.workflowSemantics)
    ) {
      throw new WorkflowRunnerError('startup-error', 'Required workflow runner manifests are missing');
    }

    for (const command of manifests.commandClassification) {
      this.commandsById.set(command.commandId, command);
    }

    for (const workflow of manifests.workflowCoverage) {
      this.workflowsById.set(workflow.id, workflow);
    }

    for (const entry of this.buildSupportMatrix()) {
      this.supportByWorkflowId.set(entry.workflowId, entry);
    }
  }

  buildSupportMatrix(): WorkflowSupportMatrixEntry[] {
    return this.manifests.workflowSemantics.map((semanticManifest) => {
      const workflowId = semanticManifest.workflowId;
      const workflow = this.workflowsById.get(workflowId);
      const classification = this.manifests.commandClassification.find(command => command.workflowId === workflowId);
      const disposition = dispositionFor(workflowId, classification, workflow);

      return {
        commandId: classification?.commandId,
        workflowId,
        category: classification?.category ?? 'unknown',
        runnerType: workflow?.runnerType.value ?? 'unknown',
        determinismPosture: classification?.determinismPosture ?? workflow?.determinism.value ?? 'unknown',
        disposition,
        reason: reasonForDisposition(disposition, workflowId, classification),
      };
    });
  }

  dispatch(input: WorkflowRunnerDispatchInput): WorkflowRunnerResult {
    const command = input.commandId ? this.commandsById.get(input.commandId) : undefined;

    if (command?.isHardOutlier === true) {
      return this.postureResult('hard-outlier', input.workflowId ?? command.workflowId ?? undefined, command);
    }

    const workflowId = input.workflowId ?? command?.workflowId ?? undefined;
    if (!workflowId || !this.workflowsById.has(workflowId)) {
      return {
        kind: 'error',
        code: 'missing-workflow',
        message: `Workflow not found in compiler manifest: ${workflowId ?? 'unknown'}`,
        workflowId,
        commandId: input.commandId,
      };
    }

    const support = this.supportByWorkflowId.get(workflowId);
    if (!support || support.disposition === 'dispatch-error') {
      return {
        kind: 'error',
        code: 'dispatch-error',
        message: `Workflow is not dispatchable from compiler manifest: ${workflowId}`,
        workflowId,
        commandId: input.commandId,
      };
    }

    if (support.disposition === 'hard-outlier') {
      return this.postureResult('hard-outlier', workflowId, command);
    }

    if (support.disposition === 'composite-review' || support.disposition === 'query-native') {
      return this.postureResult(support.disposition, workflowId, command, support.reason);
    }

    const stepId = support.disposition === 'dynamic-branch' ? input.branchId : input.stepId;
    if (support.disposition === 'dynamic-branch') {
      if (!stepId || stepId.trim() === '') {
        return {
          kind: 'error',
          code: 'dispatch-error',
          diagnosticCode: 'UNKNOWN_BRANCH_ID',
          message: `[UNKNOWN_BRANCH_ID] branchId is required for dynamic workflow '${workflowId}' but was absent or empty.`,
          workflowId,
          commandId: input.commandId,
        };
      }
      const validBranchIds = branchIdsForWorkflow(workflowId, this.manifests.workflowSemantics);
      if (validBranchIds.length === 0 || !validBranchIds.includes(stepId)) {
        return {
          kind: 'error',
          code: 'dispatch-error',
          diagnosticCode: 'UNKNOWN_BRANCH_ID',
          message: `[UNKNOWN_BRANCH_ID] branchId '${stepId}' is not a valid branch for dynamic workflow '${workflowId}'.${
            validBranchIds.length > 0
              ? ` Valid: ${validBranchIds.join(', ')}`
              : ' No branchIds declared in semantics manifest - compiler validation gap.'
          }`,
          workflowId,
          commandId: input.commandId,
        };
      }
    }
    if (!stepId) {
      return {
        kind: 'error',
        code: 'dispatch-error',
        message: `stepId required for workflow ${workflowId}`,
        workflowId,
        commandId: input.commandId,
      };
    }

    const semanticMandatory = mandatoryProvidersForWorkflow(workflowId, this.manifests.workflowSemantics);
    const effectiveMandatory = normalizeProviderList([
      ...(input.mandatoryProviders ?? []),
      ...semanticMandatory,
    ]);
    const blockedProviders = unavailableMandatoryProviders(input.providerAvailability, effectiveMandatory);
    if (blockedProviders.length > 0) {
      return {
        kind: 'error',
        code: 'dispatch-error',
        message: `Mandatory providers unavailable: ${blockedProviders.join(',')}`,
        workflowId,
        commandId: input.commandId,
      };
    }

    const packet = this.packetFor(input, workflowId, stepId, command);
    const runtimeContractEvents = validatePreEmitRuntimeContract(
      packet,
      input.agentContracts ?? [],
      input.worktreeContext ?? {},
    );
    if (runtimeContractEvents.length > 0) {
      return {
        kind: 'error',
        code: 'dispatch-error',
        message: runtimeContractEvents[0].type,
        workflowId,
        commandId: input.commandId,
      };
    }

    const providerMetadata = reducedProviderMetadata(input.providerAvailability);
    return {
      kind: 'packet',
      packet,
      ...(providerMetadata ? { providerMetadata } : {}),
    };
  }

  private postureResult(
    disposition: Extract<WorkflowSupportDisposition, 'hard-outlier' | 'composite-review' | 'query-native'>,
    workflowId: string | undefined,
    command: ClassificationEntry | undefined,
    reason = reasonForDisposition(disposition, workflowId, command),
  ): WorkflowRunnerResult {
    const record: WorkflowPostureRecord = {
      ...(command?.commandId ? { commandId: command.commandId } : {}),
      ...(workflowId ? { workflowId } : {}),
      posture: postureForDisposition(disposition),
      reason,
      emitsPacket: false,
    };

    return {
      kind: 'posture',
      record,
      ...(workflowId ? { workflowId } : {}),
      posture: record.posture,
    };
  }

  private packetFor(
    input: WorkflowRunnerDispatchInput,
    workflowId: string,
    stepId: string,
    command: ClassificationEntry | undefined,
  ): AdvisoryPacket {
    return {
      schemaVersion: CURRENT_ADVISORY_PACKET_SCHEMA_VERSION,
      runId: input.runId,
      workflowId,
      stateId: input.stateId,
      stepId,
      goal: `Execute ${workflowId} step ${stepId}`,
      instruction: `Execute workflow ${workflowId} step ${stepId} and report one allowed outcome.`,
      requiredContext: [],
      allowedTools: [],
      agents: command?.agentTypes ?? [],
      expectedEvidence: [`workflow:${workflowId}`, `step:${stepId}`],
      allowedOutcomes: ['success', 'failure', 'skipped'],
      reportCommand: REPORT_COMMAND,
      onSuccess: input.onSuccess ?? 'next',
      onFailure: input.onFailure ?? 'blocked',
      checkpoint: false,
      configSnapshotHash: configSnapshotHash(input.configSnapshot),
      extensionIds: [],
      executionConstraints: {},
    };
  }
}

export function createGeneratedWorkflowRunner(): WorkflowRunner {
  return new WorkflowRunner({
    commandClassification: GENERATED_MANIFEST_REQUIRE('../generated/compile/command-classification.json') as ClassificationEntry[],
    workflowCoverage: GENERATED_MANIFEST_REQUIRE('../generated/compile/workflow-coverage.json') as WorkflowEntry[],
    workflowSemantics: GENERATED_MANIFEST_REQUIRE('../generated/compile/workflow-semantics.json') as WorkflowSemanticManifest[],
  });
}
