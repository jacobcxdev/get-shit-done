/**
 * Packet definition inventory input for gsd-sdk compile.
 * Phase 2 uses explicit candidates until the Phase 3 packet emitter exists.
 */

import type { AdvisoryPacket } from '../../advisory/packet.js';

export type PacketDefinitionCandidate = AdvisoryPacket & {
  sourcePath: string;
  actionCount: number;
  actions?: Array<{ id: string; instruction: string; kind?: string }>;
};

export function collectPacketDefinitionCandidates(input: {
  explicit?: PacketDefinitionCandidate[];
}): PacketDefinitionCandidate[] {
  return [...(input.explicit ?? [])].sort(
    (a, b) =>
      a.workflowId.localeCompare(b.workflowId) ||
      a.stepId.localeCompare(b.stepId) ||
      a.sourcePath.localeCompare(b.sourcePath),
  );
}
