import type { AdvisoryPacket } from './packet.js';
import type { AgentEntry } from '../compile/types.js';
import {
  GSDEventType,
  type GSDCompletionMarkerAbsentEvent,
  type GSDCompletionMarkerMissingEvent,
  type GSDFSMTransitionRejectedEvent,
  type GSDEvent,
  type GSDWorktreeRequiredEvent,
} from '../types.js';

export type RuntimeWorktreeContext = {
  activeWorktreePath?: string | null;
};

export type RuntimeExecutionReport = {
  runId: string;
  workflowId: string;
  stepId: string;
  agentId: string;
  outcome: string;
  markers: string[];
  artifacts: string[];
};

const WORKTREE_RECOVERY_HINT = 'Activate a git worktree before dispatching this packet, then retry';
const COMPLETION_MARKER_MISSING_RECOVERY_HINT =
  'Add expected evidence declaration to the packet definition then re-compile';
const COMPLETION_MARKER_ABSENT_RECOVERY_HINT =
  'Re-run the agent step or verify the required marker was written, then retry the FSM transition';

function hasActiveWorktree(context: RuntimeWorktreeContext): boolean {
  return typeof context.activeWorktreePath === 'string' && context.activeWorktreePath.trim().length > 0;
}

function eventBase(runId: string): { timestamp: string; sessionId: string } {
  return {
    timestamp: new Date().toISOString(),
    sessionId: runId,
  };
}

function packetAgentContracts(packet: AdvisoryPacket, agents: AgentEntry[]): AgentEntry[] {
  const packetAgents = new Set(packet.agents);
  return agents.filter(agent => packetAgents.has(agent.id));
}

function markerEvidenceIncludes(packet: AdvisoryPacket, marker: string): boolean {
  return packet.expectedEvidence.includes(marker) ||
    packet.expectedEvidence.includes(`completion-marker:${marker}`);
}

function worktreeRequiredEvent(packet: AdvisoryPacket, agent: AgentEntry): GSDWorktreeRequiredEvent {
  return {
    type: GSDEventType.WorktreeRequired,
    ...eventBase(packet.runId),
    code: 'WORKTREE_REQUIRED',
    message: `Packet targets agent '${agent.id}' which requires an active git worktree`,
    workflowId: packet.workflowId,
    stepId: packet.stepId,
    agentId: agent.id,
    recoveryHint: WORKTREE_RECOVERY_HINT,
    blocksEmission: true,
  };
}

function completionMarkerMissingEvent(packet: AdvisoryPacket, agent: AgentEntry, marker: string): GSDCompletionMarkerMissingEvent {
  return {
    type: GSDEventType.CompletionMarkerMissing,
    ...eventBase(packet.runId),
    code: 'COMPLETION_MARKER_MISSING',
    message:
      `Packet for workflowId='${packet.workflowId}' stepId='${packet.stepId}' is missing required completion marker declaration`,
    workflowId: packet.workflowId,
    stepId: packet.stepId,
    agentId: agent.id,
    expectedMarkers: [marker],
    recoveryHint: COMPLETION_MARKER_MISSING_RECOVERY_HINT,
    blocksEmission: true,
  };
}

function completionMarkerAbsentEvent(
  report: RuntimeExecutionReport,
  agentId: string,
  absence: { markerId?: string; artifactPaths?: string[] },
): GSDCompletionMarkerAbsentEvent {
  const artifactPaths = absence.artifactPaths ?? [];
  const markerId = absence.markerId;
  return {
    type: GSDEventType.CompletionMarkerAbsent,
    ...eventBase(report.runId),
    code: 'COMPLETION_MARKER_ABSENT',
    message: markerId
      ? `Required marker '${markerId}' was not found after runtime success for workflowId='${report.workflowId}' stepId='${report.stepId}'`
      : `Required artifact${artifactPaths.length === 1 ? '' : 's'} '${artifactPaths.join("', '")}' ` +
        `${artifactPaths.length === 1 ? 'was' : 'were'} not found after runtime success for workflowId='${report.workflowId}' stepId='${report.stepId}'`,
    workflowId: report.workflowId,
    stepId: report.stepId,
    agentId,
    ...(markerId ? { markerId } : {}),
    expectedMarkers: markerId ? [markerId] : [],
    ...(artifactPaths.length > 0 ? { artifactPaths } : {}),
    recoveryHint: COMPLETION_MARKER_ABSENT_RECOVERY_HINT,
    blocksTransition: true,
  };
}

function runtimeReportRejectedEvent(
  report: RuntimeExecutionReport,
  packet: AdvisoryPacket,
  code: 'RUNTIME_REPORT_SPOOFED' | 'RUNTIME_OUTCOME_NOT_ALLOWED',
  message: string,
): GSDFSMTransitionRejectedEvent & { blocksTransition: true } {
  return {
    type: GSDEventType.FSMTransitionRejected,
    ...eventBase(packet.runId),
    fromState: packet.stateId,
    attemptedToState: report.outcome === 'success' ? packet.onSuccess : packet.onFailure,
    runId: packet.runId,
    code,
    message,
    recoveryHint: 'Return a RuntimeExecutionReport for the emitted packet identity and one packet.allowedOutcomes value, then retry',
    blocksTransition: true,
  };
}

export function validatePreEmitRuntimeContract(
  packet: AdvisoryPacket,
  agents: AgentEntry[],
  context: RuntimeWorktreeContext,
): GSDEvent[] {
  const events: GSDEvent[] = [];

  for (const agent of packetAgentContracts(packet, agents)) {
    if (agent.worktreeRequired === true && !hasActiveWorktree(context)) {
      events.push(worktreeRequiredEvent(packet, agent));
    }

    if (agent.completionMarker && !markerEvidenceIncludes(packet, agent.completionMarker)) {
      events.push(completionMarkerMissingEvent(packet, agent, agent.completionMarker));
    }
  }

  return events;
}

export function validateRuntimeReportContract(
  report: RuntimeExecutionReport,
  packet: AdvisoryPacket,
  agents: AgentEntry[],
): GSDEvent[] {
  if (report.runId !== packet.runId) {
    return [runtimeReportRejectedEvent(
      report,
      packet,
      'RUNTIME_REPORT_SPOOFED',
      `Runtime report runId '${report.runId}' does not match packet runId '${packet.runId}'`,
    )];
  }

  if (report.workflowId !== packet.workflowId) {
    return [runtimeReportRejectedEvent(
      report,
      packet,
      'RUNTIME_REPORT_SPOOFED',
      `Runtime report workflowId '${report.workflowId}' does not match packet workflowId '${packet.workflowId}'`,
    )];
  }

  if (report.stepId !== packet.stepId) {
    return [runtimeReportRejectedEvent(
      report,
      packet,
      'RUNTIME_REPORT_SPOOFED',
      `Runtime report stepId '${report.stepId}' does not match packet stepId '${packet.stepId}'`,
    )];
  }

  if (!packet.allowedOutcomes.includes(report.outcome)) {
    return [runtimeReportRejectedEvent(
      report,
      packet,
      'RUNTIME_OUTCOME_NOT_ALLOWED',
      `Runtime report outcome '${report.outcome}' is not one of packet.allowedOutcomes`,
    )];
  }

  if (report.outcome !== 'success') {
    return [];
  }

  const events: GSDEvent[] = [];
  const reportedMarkers = new Set(report.markers);
  const reportedArtifacts = new Set(report.artifacts);
  const applicableAgents = packetAgentContracts(packet, agents).filter(agent => agent.id === report.agentId);

  for (const agent of applicableAgents) {
    if (agent.completionMarker && !reportedMarkers.has(agent.completionMarker)) {
      events.push(completionMarkerAbsentEvent(report, agent.id, { markerId: agent.completionMarker }));
    }

    const missingArtifacts = agent.outputArtifacts.filter(artifact => !reportedArtifacts.has(artifact));
    if (missingArtifacts.length > 0) {
      events.push(completionMarkerAbsentEvent(report, agent.id, { artifactPaths: missingArtifacts }));
    }
  }

  return events;
}
