import type { AdvisoryPacket } from './packet.js';
import type { AgentEntry } from '../compile/types.js';
import {
  GSDEventType,
  type GSDCompletionMarkerAbsentEvent,
  type GSDCompletionMarkerMissingEvent,
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

const WORKTREE_RECOVERY_HINT = 'Create or attach an agent worktree before executing this packet';

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
    workflowId: packet.workflowId,
    stepId: packet.stepId,
    agentId: agent.id,
    expectedMarkers: [marker],
    blocksEmission: true,
  };
}

function completionMarkerAbsentEvent(
  report: RuntimeExecutionReport,
  agentId: string,
  expectedMarkers: string[],
): GSDCompletionMarkerAbsentEvent {
  return {
    type: GSDEventType.CompletionMarkerAbsent,
    ...eventBase(report.runId),
    workflowId: report.workflowId,
    stepId: report.stepId,
    agentId,
    expectedMarkers,
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
  if (report.outcome !== 'success') {
    return [];
  }

  const events: GSDEvent[] = [];
  const reportedMarkers = new Set(report.markers);
  const reportedArtifacts = new Set(report.artifacts);
  const applicableAgents = packetAgentContracts(packet, agents).filter(agent => agent.id === report.agentId);

  for (const agent of applicableAgents) {
    if (agent.completionMarker && !reportedMarkers.has(agent.completionMarker)) {
      events.push(completionMarkerAbsentEvent(report, agent.id, [agent.completionMarker]));
    }

    const missingArtifacts = agent.outputArtifacts.filter(artifact => !reportedArtifacts.has(artifact));
    if (missingArtifacts.length > 0) {
      events.push(completionMarkerAbsentEvent(report, agent.id, missingArtifacts));
    }
  }

  return events;
}
