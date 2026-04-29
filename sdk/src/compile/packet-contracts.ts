/**
 * Advisory packet compile validators.
 * Maps SDK packet guard failures and Phase 1 agent obligations to diagnostics.
 */

import { validateAdvisoryPacket } from '../advisory/packet.js';
import { mkError } from './diagnostics.js';
import type { PacketDefinitionCandidate } from './inventory/packets.js';
import type { AgentEntry, CompileDiagnostic } from './types.js';

export const DISK_WRITE_ALLOWED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Bash', 'apply_patch']);

type CountResult = {
  count: number;
};

function packetPath(packet: PacketDefinitionCandidate): string {
  return packet.sourcePath || `${packet.workflowId}#${packet.stepId}`;
}

function packetId(packet: PacketDefinitionCandidate): string {
  return packet.workflowId || 'unknown';
}

function packetStepPath(workflowId: string, stepId: string): string {
  return `${workflowId || 'unknown'}#${stepId || 'unknown'}`;
}

function packetIssueCode(code: string): string {
  if (code === 'version-mismatch') return 'PCKT-03';
  if (code === 'coarse-instruction') return 'PCKT-04';
  if (code === 'agent-tool-mismatch') return 'PCKT-08';
  return 'PCKT-02';
}

function pushPacketContractError(
  packet: PacketDefinitionCandidate,
  diagnostics: CompileDiagnostic[],
  field: 'agents' | 'allowedTools' | 'expectedEvidence',
  message: string,
): void {
  diagnostics.push(
    mkError('PCKT-08', 'packet', packetId(packet), packetPath(packet), message, {
      field,
      hint: `fix ${field} for ${packet.workflowId || 'unknown'}#${packet.stepId || 'unknown'}`,
    }),
  );
}

function includesExpectedEvidence(packet: PacketDefinitionCandidate, evidence: string): boolean {
  return Array.isArray(packet.expectedEvidence) && packet.expectedEvidence.includes(evidence);
}

function hasDiskWriteTool(packet: PacketDefinitionCandidate, agent: AgentEntry): boolean {
  return Array.isArray(packet.allowedTools) && packet.allowedTools.some((tool) => DISK_WRITE_ALLOWED_TOOLS.has(tool) && agent.allowedTools.includes(tool));
}

export function validateAdvisoryPacketDefinitions(
  packets: PacketDefinitionCandidate[],
  agentContracts: AgentEntry[],
  diagnostics: CompileDiagnostic[],
): CountResult {
  const agentsById = new Map(agentContracts.map((agent) => [agent.id, agent]));

  for (const packet of packets) {
    for (const issue of validateAdvisoryPacket(packet)) {
      diagnostics.push(
        mkError(
          packetIssueCode(issue.code),
          'packet',
          issue.workflowId || 'unknown',
          packetStepPath(issue.workflowId, issue.stepId),
          issue.message,
          {
            field: issue.field,
            hint: `fix ${issue.field} for ${issue.workflowId || 'unknown'}#${issue.stepId || 'unknown'}`,
          },
        ),
      );
    }

    if (!Array.isArray(packet.agents) || !Array.isArray(packet.allowedTools) || !Array.isArray(packet.expectedEvidence)) {
      continue;
    }

    const targetedAgents: AgentEntry[] = [];
    for (const agentId of packet.agents) {
      const agent = agentsById.get(agentId);
      if (!agent) {
        pushPacketContractError(
          packet,
          diagnostics,
          'agents',
          `unknown packet agent ${agentId} in ${packet.workflowId} step ${packet.stepId}`,
        );
        continue;
      }
      targetedAgents.push(agent);
    }

    for (const tool of packet.allowedTools) {
      if (targetedAgents.some((agent) => agent.allowedTools.includes(tool))) continue;
      pushPacketContractError(
        packet,
        diagnostics,
        'allowedTools',
        `allowedTools entry ${tool} is not permitted by any targeted agent in ${packet.workflowId} step ${packet.stepId}`,
      );
    }

    for (const agent of targetedAgents) {
      if (agent.diskWriteMandate && !hasDiskWriteTool(packet, agent)) {
        pushPacketContractError(
          packet,
          diagnostics,
          'allowedTools',
          `diskWriteMandate agent ${agent.id} requires Write, Edit, MultiEdit, Bash, or apply_patch in ${packet.workflowId} step ${packet.stepId}`,
        );
      }

      if (agent.completionMarker) {
        const markerEvidence = `completion-marker:${agent.completionMarker}`;
        if (!includesExpectedEvidence(packet, agent.completionMarker) && !includesExpectedEvidence(packet, markerEvidence)) {
          pushPacketContractError(
            packet,
            diagnostics,
            'expectedEvidence',
            `expectedEvidence for ${packet.workflowId} step ${packet.stepId} must include completionMarker ${agent.completionMarker}`,
          );
        }
      }

      for (const artifact of agent.outputArtifacts) {
        if (includesExpectedEvidence(packet, artifact)) continue;
        pushPacketContractError(
          packet,
          diagnostics,
          'expectedEvidence',
          `expectedEvidence for ${packet.workflowId} step ${packet.stepId} must include output artifact ${artifact}`,
        );
      }
    }
  }

  return { count: packets.length };
}

export function validatePacketAtomicity(
  packets: PacketDefinitionCandidate[],
  diagnostics: CompileDiagnostic[],
): CountResult {
  for (const packet of packets) {
    const actualActionCount = packet.actions?.length ?? packet.actionCount;
    if (actualActionCount !== 1) {
      diagnostics.push(
        mkError(
          'PCKT-04',
          'packet',
          packetId(packet),
          packetPath(packet),
          `coarse packet in ${packet.workflowId} step ${packet.stepId}: actionCount ${actualActionCount} must be 1`,
          { field: 'actionCount', hint: 'split packet into exactly one atomic action' },
        ),
      );
    }

    if (packet.actions !== undefined && packet.actions.length !== packet.actionCount) {
      diagnostics.push(
        mkError(
          'PCKT-04',
          'packet',
          packetId(packet),
          packetPath(packet),
          `packet actionCount ${packet.actionCount} disagrees with actions length ${packet.actions.length} in ${packet.workflowId} step ${packet.stepId}`,
          { field: 'actions', hint: 'keep actionCount and actions length consistent' },
        ),
      );
    }
  }

  return { count: packets.length };
}
