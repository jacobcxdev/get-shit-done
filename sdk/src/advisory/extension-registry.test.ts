import { describe, expect, it } from 'vitest';
import {
  ExtensionRegistry,
  ExtensionRegistryError,
  SealedExtensionGraph,
} from './extension-registry.js';
import type {
  GateRegistration,
  InsertStepRegistration,
  LifecycleHookRegistration,
  ProviderCheckRegistration,
  ReplaceInstructionRegistration,
} from './extension-registry.js';
import type { FsmRunState } from './fsm-state.js';
import type { AdvisoryPacket } from './packet.js';

// Minimal valid AdvisoryPacket for InsertStepRegistration tests
function makePacket(overrides: Partial<AdvisoryPacket> = {}): AdvisoryPacket {
  return {
    schemaVersion: 1,
    runId: 'run-01',
    workflowId: '/workflows/test',
    stateId: 'step-state',
    stepId: 'my-ext/custom-step',
    goal: 'do something',
    instruction: 'Execute the thing',
    requiredContext: [],
    allowedTools: [],
    agents: [],
    expectedEvidence: [],
    allowedOutcomes: ['success'],
    reportCommand: 'gsd-report',
    onSuccess: 'done',
    onFailure: 'fail',
    checkpoint: false,
    configSnapshotHash: 'a'.repeat(64),
    extensionIds: ['my-ext'],
    executionConstraints: {},
    ...overrides,
  };
}

// Minimal valid FsmRunState snapshot for gate predicate tests
function makeFsmSnapshot(overrides: Partial<FsmRunState> = {}): FsmRunState {
  return {
    runId: 'run-01',
    stateSchemaVersion: 1,
    workflowId: '/workflows/test',
    workstream: null,
    currentState: 'execute',
    configSnapshotHash: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    transitionHistory: [],
    migration: { status: 'none' },
    resume: { status: 'active' },
    autoMode: { active: false, source: 'none' },
    ...overrides,
  };
}

// ============================================================
// ExtensionRegistry.register() — local invariant checks
// ============================================================

describe('ExtensionRegistry.register', () => {
  it('accepts a valid InsertStepRegistration', () => {
    const registry = new ExtensionRegistry();
    const slot: InsertStepRegistration = {
      kind: 'insert-step',
      extensionId: 'my-ext',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket(),
    };
    expect(() => registry.register(slot)).not.toThrow();
  });

  it('accepts a valid ReplaceInstructionRegistration', () => {
    const registry = new ExtensionRegistry();
    const slot: ReplaceInstructionRegistration = {
      kind: 'replace-instruction',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      instruction: 'Replacement instruction text',
    };
    expect(() => registry.register(slot)).not.toThrow();
  });

  it('accepts a valid GateRegistration', () => {
    const registry = new ExtensionRegistry();
    const slot: GateRegistration = {
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      predicate: () => true,
    };
    expect(() => registry.register(slot)).not.toThrow();
  });

  it('accepts a valid LifecycleHookRegistration', () => {
    const registry = new ExtensionRegistry();
    const slot: LifecycleHookRegistration = {
      kind: 'lifecycle-hook',
      extensionId: 'my-ext',
      onAfterTransition: () => {},
    };
    expect(() => registry.register(slot)).not.toThrow();
  });

  it('accepts a valid ProviderCheckRegistration', () => {
    const registry = new ExtensionRegistry();
    const slot: ProviderCheckRegistration = {
      kind: 'provider-check',
      extensionId: 'my-ext',
      providerName: 'my-cloud',
      check: () => ({ available: [], unavailable: [] }),
    };
    expect(() => registry.register(slot)).not.toThrow();
  });

  it('throws ExtensionRegistryError duplicate-id for same extensionId + same slot kind', () => {
    const registry = new ExtensionRegistry();
    const slot: GateRegistration = {
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      predicate: () => true,
    };
    registry.register(slot);
    expect(() => registry.register({ ...slot })).toThrow(ExtensionRegistryError);
    expect(() => registry.register({ ...slot })).toThrow(
      expect.objectContaining({ code: 'duplicate-id' }),
    );
  });

  it('allows same extensionId with different slot kinds', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      predicate: () => true,
    });
    expect(() =>
      registry.register({
        kind: 'lifecycle-hook',
        extensionId: 'my-ext',
        onAfterTransition: () => {},
      }),
    ).not.toThrow();
  });

  it('throws ExtensionRegistryError reserved-prefix for gsd extension ID', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: 'gsd',
        targetStepId: 'execute',
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'reserved-prefix' }));
  });

  it('throws ExtensionRegistryError reserved-prefix for core extension ID', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: 'core',
        targetStepId: 'execute',
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'reserved-prefix' }));
  });

  it('throws ExtensionRegistryError reserved-prefix for gsd- prefixed extension ID', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: 'gsd-tools',
        targetStepId: 'execute',
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'reserved-prefix' }));
  });

  it('throws ExtensionRegistryError invalid-namespace for uppercase extensionId', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: 'MyExt',
        targetStepId: 'execute',
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-namespace' }));
  });

  it('throws ExtensionRegistryError invalid-namespace for extensionId starting with digit', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: '1bad',
        targetStepId: 'execute',
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-namespace' }));
  });

  it('throws ExtensionRegistryError invalid-namespace for extensionId with underscore', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: 'my_ext',
        targetStepId: 'execute',
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-namespace' }));
  });

  it('throws ExtensionRegistryError invalid-slot-shape for positional integer anchorStepId', () => {
    const registry = new ExtensionRegistry();
    // TypeScript would normally catch this, but test runtime enforcement too
    expect(() =>
      registry.register({
        kind: 'insert-step',
        extensionId: 'my-ext',
        anchorStepId: 3 as unknown as string,
        position: 'before',
        packet: makePacket(),
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-slot-shape' }));
  });

  it('throws ExtensionRegistryError invalid-slot-shape for positional integer targetStepId in gate', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'gate',
        extensionId: 'my-ext',
        targetStepId: 0 as unknown as string,
        predicate: () => true,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-slot-shape' }));
  });

  it('accepts extensionId with hyphens and digits', () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.register({
        kind: 'provider-check',
        extensionId: 'my-ext-123',
        providerName: 'custom',
        check: () => ({ available: [], unavailable: [] }),
      }),
    ).not.toThrow();
  });
});

// ============================================================
// ExtensionRegistry.finalize() — dependency / cycle / anchor validation
// ============================================================

describe('ExtensionRegistry.finalize', () => {
  it('returns a SealedExtensionGraph when registry is clean', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/step1' }),
    });
    const graph = registry.finalize();
    expect(graph).toBeInstanceOf(SealedExtensionGraph);
  });

  it('can be called on an empty registry without error', () => {
    const registry = new ExtensionRegistry();
    expect(() => registry.finalize()).not.toThrow();
  });

  it('detects a cycle A→B→A and throws or returns diagnostics with the cycle chain', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/step1', extensionIds: ['ext-a'] }),
      before: ['ext-b'],
    });
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-b',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-b/step1', extensionIds: ['ext-b'] }),
      before: ['ext-a'],
    });
    expect(() => registry.finalize()).toThrow(ExtensionRegistryError);
    expect(() => registry.finalize()).toThrow(
      expect.objectContaining({ code: 'cycle-detected' }),
    );
  });

  it('rejects unknown dependency targets as hard diagnostics', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/step1', extensionIds: ['ext-a'] }),
      after: ['ext-unknown'],
    });
    expect(() => registry.finalize()).toThrow(ExtensionRegistryError);
    expect(() => registry.finalize()).toThrow(
      expect.objectContaining({ code: 'unknown-dependency' }),
    );
  });

  it('emits unordered-co-anchor warning for co-anchored extensions with no ordering', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/step1', extensionIds: ['ext-a'] }),
    });
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-b',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-b/step1', extensionIds: ['ext-b'] }),
    });
    const graph = registry.finalize();
    expect(graph.warnings.length).toBeGreaterThan(0);
    expect(graph.warnings.some((w) => w.code === 'EXT-01')).toBe(true);
  });

  it('does not emit co-anchor warning when ordering is declared', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/step1', extensionIds: ['ext-a'] }),
      before: ['ext-b'],
    });
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-b',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-b/step1', extensionIds: ['ext-b'] }),
      after: ['ext-a'],
    });
    const graph = registry.finalize();
    expect(graph.warnings.filter((w) => w.code === 'EXT-01').length).toBe(0);
  });
});

// ============================================================
// SealedExtensionGraph surfaces
// ============================================================

describe('SealedExtensionGraph.insertedStepForStepId', () => {
  it('returns the registration whose packet.stepId matches', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'step-1',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/before-plan', extensionIds: ['ext-a'] }),
    });
    const graph = registry.finalize();
    const result = graph.insertedStepForStepId('ext-a/before-plan');
    expect(result).toBeDefined();
    expect(result?.packet.stepId).toBe('ext-a/before-plan');
    expect(result?.extensionId).toBe('ext-a');
  });

  it('returns undefined for a step ID not in any inserted packet', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'step-1',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/before-plan', extensionIds: ['ext-a'] }),
    });
    const graph = registry.finalize();
    expect(graph.insertedStepForStepId('missing-step')).toBeUndefined();
  });
});

describe('SealedExtensionGraph.insertedStepsFor', () => {
  it('returns steps inserted before the anchor in order', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-a',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-a/step1', extensionIds: ['ext-a'] }),
      before: ['ext-b'],
    });
    registry.register({
      kind: 'insert-step',
      extensionId: 'ext-b',
      anchorStepId: 'execute',
      position: 'before',
      packet: makePacket({ stepId: 'ext-b/step1', extensionIds: ['ext-b'] }),
      after: ['ext-a'],
    });
    const graph = registry.finalize();
    const before = graph.insertedStepsFor('execute', 'before');
    expect(before.length).toBe(2);
    // ext-a must come before ext-b
    const aIdx = before.findIndex((s) => s.extensionId === 'ext-a');
    const bIdx = before.findIndex((s) => s.extensionId === 'ext-b');
    expect(aIdx).toBeLessThan(bIdx);
  });

  it('returns empty array when no steps are inserted for given anchor and position', () => {
    const registry = new ExtensionRegistry();
    const graph = registry.finalize();
    expect(graph.insertedStepsFor('execute', 'before')).toEqual([]);
    expect(graph.insertedStepsFor('execute', 'after')).toEqual([]);
  });
});

describe('SealedExtensionGraph.instructionReplacementFor', () => {
  it('returns the replacement for the target step ID', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'replace-instruction',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      instruction: 'New instruction',
    });
    const graph = registry.finalize();
    const replacement = graph.instructionReplacementFor('execute');
    expect(replacement).toBeDefined();
    expect(replacement?.instruction).toBe('New instruction');
    expect(replacement?.extensionId).toBe('my-ext');
  });

  it('returns undefined when no replacement is registered for a step', () => {
    const registry = new ExtensionRegistry();
    const graph = registry.finalize();
    expect(graph.instructionReplacementFor('execute')).toBeUndefined();
  });
});

describe('SealedExtensionGraph.evaluateGates', () => {
  it('returns { kind: "pass" } when gate predicate returns true', () => {
    const registry = new ExtensionRegistry();
    const gate: GateRegistration = {
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      predicate: () => true,
    };
    registry.register(gate);
    const graph = registry.finalize();
    const snapshot = makeFsmSnapshot();
    const result = graph.evaluateGates('execute', snapshot);
    expect(result).toEqual({ kind: 'pass' });
  });

  it('returns { kind: "gate-failed", extensionId } when gate predicate returns false', () => {
    const registry = new ExtensionRegistry();
    const gate: GateRegistration = {
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      predicate: () => false,
    };
    registry.register(gate);
    const graph = registry.finalize();
    const snapshot = makeFsmSnapshot();
    const result = graph.evaluateGates('execute', snapshot);
    expect(result).toEqual({ kind: 'gate-failed', extensionId: 'my-ext' });
  });

  it('returns pass when no gate targets the given step', () => {
    const registry = new ExtensionRegistry();
    registry.register({
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'some-other-step',
      predicate: () => false,
    });
    const graph = registry.finalize();
    const snapshot = makeFsmSnapshot();
    const result = graph.evaluateGates('execute', snapshot);
    expect(result).toEqual({ kind: 'pass' });
  });

  it('passes a Readonly<FsmRunState> snapshot to the gate predicate', () => {
    const registry = new ExtensionRegistry();
    let capturedSnapshot: Readonly<FsmRunState> | undefined;
    registry.register({
      kind: 'gate',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      predicate: (snapshot) => {
        capturedSnapshot = snapshot;
        return true;
      },
    });
    const graph = registry.finalize();
    const snapshot = makeFsmSnapshot({ currentState: 'execute' });
    graph.evaluateGates('execute', snapshot);
    expect(capturedSnapshot?.currentState).toBe('execute');
  });
});

describe('SealedExtensionGraph.lifecycleHooks', () => {
  it('returns all registered lifecycle hooks', () => {
    const registry = new ExtensionRegistry();
    const hook: LifecycleHookRegistration = {
      kind: 'lifecycle-hook',
      extensionId: 'my-ext',
      onAfterTransition: () => {},
    };
    registry.register(hook);
    const graph = registry.finalize();
    const hooks = graph.lifecycleHooks();
    expect(hooks.length).toBe(1);
    expect(hooks[0]?.extensionId).toBe('my-ext');
  });

  it('returns empty array when no lifecycle hooks are registered', () => {
    const registry = new ExtensionRegistry();
    const graph = registry.finalize();
    expect(graph.lifecycleHooks()).toEqual([]);
  });
});

describe('SealedExtensionGraph.providerChecks', () => {
  it('returns all registered provider checks', () => {
    const registry = new ExtensionRegistry();
    const check: ProviderCheckRegistration = {
      kind: 'provider-check',
      extensionId: 'my-ext',
      providerName: 'my-cloud',
      check: () => ({ available: [], unavailable: [] }),
    };
    registry.register(check);
    const graph = registry.finalize();
    const checks = graph.providerChecks();
    expect(checks.length).toBe(1);
    expect(checks[0]?.extensionId).toBe('my-ext');
    expect(checks[0]?.providerName).toBe('my-cloud');
  });

  it('returns empty array when no provider checks are registered', () => {
    const registry = new ExtensionRegistry();
    const graph = registry.finalize();
    expect(graph.providerChecks()).toEqual([]);
  });
});

// ============================================================
// TypeScript structural constraint: ReplaceInstructionRegistration
// This test verifies runtime enforcement of instruction-only replacement.
// The TypeScript compile-time constraint is enforced by the type definition itself.
// ============================================================

describe('ReplaceInstructionRegistration structural constraint', () => {
  it('only exposes instruction field (TypeScript type-level enforcement)', () => {
    // This is purely a compile-time check — if this file compiles,
    // TypeScript confirms ReplaceInstructionRegistration has only:
    // kind, extensionId, targetStepId, instruction
    const slot: ReplaceInstructionRegistration = {
      kind: 'replace-instruction',
      extensionId: 'my-ext',
      targetStepId: 'execute',
      instruction: 'Only this field',
      // agents: [],       // ← TypeScript compile error if uncommented
      // allowedTools: [], // ← TypeScript compile error if uncommented
    };
    expect(slot.instruction).toBe('Only this field');
  });
});
