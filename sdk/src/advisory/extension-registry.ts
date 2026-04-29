/**
 * Extension slot registry for the SDK advisory layer.
 * Provides declarative slot registration (insert-step, replace-instruction, gate,
 * lifecycle-hook, provider-check) with eager local invariant checks at register()
 * and full dependency/cycle validation at finalize().
 *
 * No external imports — pure TypeScript with no fs/promises or shell calls.
 */

import type { CompileDiagnostic } from '../compile/types.js';
import type { FsmRunState } from './fsm-state.js';
import type { AdvisoryPacket } from './packet.js';
import type { ProviderAvailabilityResult } from './provider-availability.js';

// ============================================================
// Extension ID validation
// ============================================================

const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const RESERVED_PREFIXES = ['gsd', 'core'] as const;

function isValidExtensionIdPart(part: string): boolean {
  return EXTENSION_ID_PATTERN.test(part);
}

function isReservedPrefix(id: string): boolean {
  return RESERVED_PREFIXES.some(
    (prefix) => id === prefix || id.startsWith(`${prefix}-`),
  );
}

// ============================================================
// Error class
// ============================================================

export type ExtensionRegistryErrorCode =
  | 'invalid-namespace'
  | 'duplicate-id'
  | 'invalid-slot-shape'
  | 'reserved-prefix'
  | 'cycle-detected'
  | 'unknown-dependency';

export class ExtensionRegistryError extends Error {
  constructor(
    public readonly code: ExtensionRegistryErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ExtensionRegistryError';
  }
}

// ============================================================
// Gate meta type
// ============================================================

export type GateStepMeta = {
  stepId: string;
  extensionId: string;
};

// ============================================================
// Slot types
// ============================================================

export type InsertStepRegistration = {
  kind: 'insert-step';
  extensionId: string;
  anchorStepId: string;
  position: 'before' | 'after';
  packet: AdvisoryPacket;
  before?: string[];
  after?: string[];
};

/**
 * Structurally constrained to instruction field only.
 * agents, tools, evidence, and transition fields are intentionally absent.
 */
export type ReplaceInstructionRegistration = {
  kind: 'replace-instruction';
  extensionId: string;
  targetStepId: string;
  instruction: string;
};

export type GateRegistration = {
  kind: 'gate';
  extensionId: string;
  targetStepId: string;
  predicate: (snapshot: Readonly<FsmRunState>, meta: GateStepMeta) => boolean;
};

export type LifecycleHookRegistration = {
  kind: 'lifecycle-hook';
  extensionId: string;
  onBeforeTransition?: (state: Readonly<FsmRunState>) => { veto: true; reason: string } | undefined;
  onAfterTransition?: (state: Readonly<FsmRunState>) => void;
};

export type ProviderCheckRegistration = {
  kind: 'provider-check';
  extensionId: string;
  providerName: string;
  check: () => ProviderAvailabilityResult;
};

export type ExtensionSlot =
  | InsertStepRegistration
  | ReplaceInstructionRegistration
  | GateRegistration
  | LifecycleHookRegistration
  | ProviderCheckRegistration;

// ============================================================
// Cycle detection (copied from sdk/src/compile/validators.ts — not exported there)
// ============================================================

function findCycle(edges: Map<string, string[]>): string[] | null {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    stack.push(id);
    for (const next of [...(edges.get(id) ?? [])].sort()) {
      if (!edges.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of [...edges.keys()].sort()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }

  return null;
}

// ============================================================
// Sealed extension graph
// ============================================================

export class SealedExtensionGraph {
  public readonly warnings: CompileDiagnostic[];
  private readonly orderedInserts: InsertStepRegistration[];
  private readonly replacements: Map<string, ReplaceInstructionRegistration>;
  private readonly gates: GateRegistration[];
  private readonly hooks: LifecycleHookRegistration[];
  private readonly checks: ProviderCheckRegistration[];

  constructor(
    orderedInserts: InsertStepRegistration[],
    replacements: Map<string, ReplaceInstructionRegistration>,
    gates: GateRegistration[],
    hooks: LifecycleHookRegistration[],
    checks: ProviderCheckRegistration[],
    warnings: CompileDiagnostic[],
  ) {
    this.orderedInserts = orderedInserts;
    this.replacements = replacements;
    this.gates = gates;
    this.hooks = hooks;
    this.checks = checks;
    this.warnings = warnings;
  }

  insertedStepsFor(anchorStepId: string, position: 'before' | 'after'): InsertStepRegistration[] {
    return this.orderedInserts.filter(
      (s) => s.anchorStepId === anchorStepId && s.position === position,
    );
  }

  insertedStepForStepId(stepId: string): InsertStepRegistration | undefined {
    return this.orderedInserts.find((s) => s.packet.stepId === stepId);
  }

  instructionReplacementFor(stepId: string): ReplaceInstructionRegistration | undefined {
    return this.replacements.get(stepId);
  }

  evaluateGates(
    stepId: string,
    snapshot: Readonly<FsmRunState>,
  ): { kind: 'pass' } | { kind: 'gate-failed'; extensionId: string } {
    for (const gate of this.gates) {
      if (gate.targetStepId !== stepId) continue;
      const meta: GateStepMeta = { stepId, extensionId: gate.extensionId };
      if (!gate.predicate(snapshot, meta)) {
        return { kind: 'gate-failed', extensionId: gate.extensionId };
      }
    }
    return { kind: 'pass' };
  }

  lifecycleHooks(): LifecycleHookRegistration[] {
    return [...this.hooks];
  }

  providerChecks(): ProviderCheckRegistration[] {
    return [...this.checks];
  }
}

// ============================================================
// Extension registry
// ============================================================

export class ExtensionRegistry {
  private readonly slots: ExtensionSlot[] = [];

  register(slot: ExtensionSlot): void {
    this.validateLocalInvariants(slot);
    this.slots.push(slot);
  }

  finalize(): SealedExtensionGraph {
    const warnings: CompileDiagnostic[] = [];

    const insertSlots = this.slots.filter(
      (s): s is InsertStepRegistration => s.kind === 'insert-step',
    );
    const replacementSlots = this.slots.filter(
      (s): s is ReplaceInstructionRegistration => s.kind === 'replace-instruction',
    );
    const gateSlots = this.slots.filter(
      (s): s is GateRegistration => s.kind === 'gate',
    );
    const hookSlots = this.slots.filter(
      (s): s is LifecycleHookRegistration => s.kind === 'lifecycle-hook',
    );
    const checkSlots = this.slots.filter(
      (s): s is ProviderCheckRegistration => s.kind === 'provider-check',
    );

    // Collect all registered extension IDs that participate in ordering (insert-step)
    const allExtIds = new Set(insertSlots.map((s) => s.extensionId));

    // Validate unknown dependency targets
    for (const slot of insertSlots) {
      for (const dep of [...(slot.before ?? []), ...(slot.after ?? [])]) {
        if (!allExtIds.has(dep)) {
          throw new ExtensionRegistryError(
            'unknown-dependency',
            `extension '${slot.extensionId}' declares dependency on unknown extension '${dep}'`,
            { extensionId: slot.extensionId, unknownDep: dep },
          );
        }
      }
    }

    // Build ordering edge map (before/after → directed edges)
    const edges = new Map<string, string[]>(insertSlots.map((s) => [s.extensionId, []]));
    for (const slot of insertSlots) {
      for (const target of slot.before ?? []) {
        edges.get(slot.extensionId)?.push(target);
      }
      for (const target of slot.after ?? []) {
        edges.get(target)?.push(slot.extensionId);
      }
    }

    // Cycle detection
    const cycleChain = findCycle(edges);
    if (cycleChain) {
      throw new ExtensionRegistryError(
        'cycle-detected',
        `extension ordering cycle detected: ${cycleChain.join(' -> ')}`,
        { cycle: cycleChain },
      );
    }

    // Detect co-anchored extensions with no declared relative ordering
    // Group insert slots by (anchorStepId, position)
    const anchorGroups = new Map<string, InsertStepRegistration[]>();
    for (const slot of insertSlots) {
      const key = `${slot.anchorStepId}:${slot.position}`;
      const group = anchorGroups.get(key) ?? [];
      group.push(slot);
      anchorGroups.set(key, group);
    }

    for (const [, group] of anchorGroups) {
      if (group.length < 2) continue;
      // Check each pair for declared ordering
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]!;
          const b = group[j]!;
          const aOrdersB =
            (a.before ?? []).includes(b.extensionId) ||
            (b.after ?? []).includes(a.extensionId);
          const bOrdersA =
            (b.before ?? []).includes(a.extensionId) ||
            (a.after ?? []).includes(b.extensionId);
          if (!aOrdersB && !bOrdersA) {
            warnings.push({
              code: 'EXT-01',
              kind: 'extension',
              id: a.extensionId,
              path: `extension:${a.extensionId}`,
              message: `unordered-co-anchor: extensions '${a.extensionId}' and '${b.extensionId}' share anchor '${a.anchorStepId}' (${a.position}) with no declared order; using registration order as tie-break`,
              hint: 'add before/after ordering to suppress this warning',
              severity: 'warning',
            });
          }
        }
      }
    }

    // Topological sort of insert slots — registration order as tie-break
    const orderedInserts = topologicalSort(insertSlots, edges);

    // Build replacement map (stepId → replacement)
    const replacements = new Map<string, ReplaceInstructionRegistration>();
    for (const slot of replacementSlots) {
      replacements.set(slot.targetStepId, slot);
    }

    return new SealedExtensionGraph(
      orderedInserts,
      replacements,
      gateSlots,
      hookSlots,
      checkSlots,
      warnings,
    );
  }

  // ---- Local invariant validation (eager at register()) ----

  private validateLocalInvariants(slot: ExtensionSlot): void {
    const { extensionId } = slot;

    // Validate extensionId pattern
    if (!isValidExtensionIdPart(extensionId)) {
      throw new ExtensionRegistryError(
        'invalid-namespace',
        `extensionId '${extensionId}' is invalid: must match ^[a-z][a-z0-9-]*$`,
        { extensionId },
      );
    }

    // Validate reserved prefix
    if (isReservedPrefix(extensionId)) {
      throw new ExtensionRegistryError(
        'reserved-prefix',
        `extensionId '${extensionId}' uses a reserved prefix (gsd, core)`,
        { extensionId },
      );
    }

    // Validate slot-specific shapes (reject positional references)
    this.validateSlotShape(slot);

    // Validate duplicate ID (same extensionId + same slot kind)
    const isDuplicate = this.slots.some(
      (existing) =>
        existing.extensionId === extensionId && existing.kind === slot.kind,
    );
    if (isDuplicate) {
      throw new ExtensionRegistryError(
        'duplicate-id',
        `extension '${extensionId}' already has a registered '${slot.kind}' slot`,
        { extensionId, kind: slot.kind },
      );
    }
  }

  private validateSlotShape(slot: ExtensionSlot): void {
    if (slot.kind === 'insert-step') {
      if (typeof slot.anchorStepId !== 'string') {
        throw new ExtensionRegistryError(
          'invalid-slot-shape',
          `insert-step slot for '${slot.extensionId}': anchorStepId must be a string, not a positional reference`,
          { extensionId: slot.extensionId, field: 'anchorStepId' },
        );
      }
    }
    if (slot.kind === 'gate') {
      if (typeof slot.targetStepId !== 'string') {
        throw new ExtensionRegistryError(
          'invalid-slot-shape',
          `gate slot for '${slot.extensionId}': targetStepId must be a string, not a positional reference`,
          { extensionId: slot.extensionId, field: 'targetStepId' },
        );
      }
    }
    if (slot.kind === 'replace-instruction') {
      if (typeof slot.targetStepId !== 'string') {
        throw new ExtensionRegistryError(
          'invalid-slot-shape',
          `replace-instruction slot for '${slot.extensionId}': targetStepId must be a string, not a positional reference`,
          { extensionId: slot.extensionId, field: 'targetStepId' },
        );
      }
    }
  }
}

// ============================================================
// Topological sort preserving registration order as tie-break
// ============================================================

function topologicalSort(
  slots: InsertStepRegistration[],
  edges: Map<string, string[]>,
): InsertStepRegistration[] {
  if (slots.length === 0) return [];

  // Build in-degree map
  const inDegree = new Map<string, number>(slots.map((s) => [s.extensionId, 0]));
  for (const [, targets] of edges) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  // Queue starts with nodes that have in-degree 0, in registration order
  const queue: string[] = slots
    .map((s) => s.extensionId)
    .filter((id) => (inDegree.get(id) ?? 0) === 0);

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const neighbor of edges.get(id) ?? []) {
      const degree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Return slots in topological order
  const slotByExtId = new Map(slots.map((s) => [s.extensionId, s]));
  return sorted.map((id) => slotByExtId.get(id)!).filter(Boolean);
}
