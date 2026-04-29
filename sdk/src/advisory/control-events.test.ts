import { describe, expect, it } from 'vitest';
import { validateAdvisoryControlEvent } from './control-events.js';
import { FsmStateError, parseFsmRunStateOrControlEvent } from './fsm-state.js';

describe('validateAdvisoryControlEvent', () => {
  describe('gate-failed', () => {
    it('passes with all required fields', () => {
      const event = {
        kind: 'control',
        event: 'gate-failed',
        extensionId: 'my-ext',
        targetStepId: 'step-1',
        workflowId: 'wf-1',
        runId: 'run-1',
      };
      expect(validateAdvisoryControlEvent(event)).toEqual([]);
    });

    it('rejects missing extensionId', () => {
      const event = {
        kind: 'control',
        event: 'gate-failed',
        targetStepId: 'step-1',
        workflowId: 'wf-1',
        runId: 'run-1',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(i => i.field === 'extensionId' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing targetStepId', () => {
      const event = {
        kind: 'control',
        event: 'gate-failed',
        extensionId: 'my-ext',
        workflowId: 'wf-1',
        runId: 'run-1',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'targetStepId' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing workflowId', () => {
      const event = {
        kind: 'control',
        event: 'gate-failed',
        extensionId: 'my-ext',
        targetStepId: 'step-1',
        runId: 'run-1',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'workflowId' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing runId', () => {
      const event = {
        kind: 'control',
        event: 'gate-failed',
        extensionId: 'my-ext',
        targetStepId: 'step-1',
        workflowId: 'wf-1',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'runId' && i.code === 'missing-field')).toBe(true);
    });
  });

  describe('migration-required', () => {
    it('passes with all required fields', () => {
      const event = {
        kind: 'control',
        event: 'migration-required',
        statePath: '/path/to/state',
        detectedVersion: 0,
        currentVersion: 1,
        supportedRange: { min: 1, max: 1 },
        migrationSteps: [{ description: 'Upgrade schema version' }],
      };
      expect(validateAdvisoryControlEvent(event)).toEqual([]);
    });

    it('rejects missing statePath', () => {
      const event = {
        kind: 'control',
        event: 'migration-required',
        detectedVersion: 0,
        currentVersion: 1,
        supportedRange: { min: 1, max: 1 },
        migrationSteps: [{ description: 'Upgrade schema version' }],
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'statePath' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing detectedVersion', () => {
      const event = {
        kind: 'control',
        event: 'migration-required',
        statePath: '/path/to/state',
        currentVersion: 1,
        supportedRange: { min: 1, max: 1 },
        migrationSteps: [{ description: 'Upgrade schema version' }],
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'detectedVersion' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing supportedRange', () => {
      const event = {
        kind: 'control',
        event: 'migration-required',
        statePath: '/path/to/state',
        detectedVersion: 0,
        currentVersion: 1,
        migrationSteps: [{ description: 'Upgrade schema version' }],
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'supportedRange' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing migrationSteps', () => {
      const event = {
        kind: 'control',
        event: 'migration-required',
        statePath: '/path/to/state',
        detectedVersion: 0,
        currentVersion: 1,
        supportedRange: { min: 1, max: 1 },
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'migrationSteps' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects migrationSteps element missing description', () => {
      const event = {
        kind: 'control',
        event: 'migration-required',
        statePath: '/path/to/state',
        detectedVersion: 0,
        currentVersion: 1,
        supportedRange: { min: 1, max: 1 },
        migrationSteps: [{}],
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'migrationSteps[0].description' && i.code === 'missing-field')).toBe(true);
    });
  });

  describe('resume-blocked', () => {
    it('passes with all required fields', () => {
      const event = {
        kind: 'control',
        event: 'resume-blocked',
        statePath: '/path/to/state',
        detectedVersion: 2,
        currentVersion: 1,
      };
      expect(validateAdvisoryControlEvent(event)).toEqual([]);
    });

    it('rejects missing statePath', () => {
      const event = {
        kind: 'control',
        event: 'resume-blocked',
        detectedVersion: 2,
        currentVersion: 1,
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'statePath' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing detectedVersion', () => {
      const event = {
        kind: 'control',
        event: 'resume-blocked',
        statePath: '/path/to/state',
        currentVersion: 1,
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'detectedVersion' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing currentVersion', () => {
      const event = {
        kind: 'control',
        event: 'resume-blocked',
        statePath: '/path/to/state',
        detectedVersion: 2,
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'currentVersion' && i.code === 'missing-field')).toBe(true);
    });
  });

  describe('rollback-blocked', () => {
    it('passes with all required fields', () => {
      const event = {
        kind: 'control',
        event: 'rollback-blocked',
        statePath: '/path/to/state',
        reason: 'no-checkpoint',
      };
      expect(validateAdvisoryControlEvent(event)).toEqual([]);
    });

    it('rejects missing statePath', () => {
      const event = {
        kind: 'control',
        event: 'rollback-blocked',
        reason: 'no-checkpoint',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'statePath' && i.code === 'missing-field')).toBe(true);
    });

    it('rejects missing reason', () => {
      const event = {
        kind: 'control',
        event: 'rollback-blocked',
        statePath: '/path/to/state',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'reason' && i.code === 'missing-field')).toBe(true);
    });
  });

  describe('wrong kind discriminant', () => {
    it('rejects kind !== control', () => {
      const event = {
        kind: 'packet',
        event: 'gate-failed',
        extensionId: 'my-ext',
        targetStepId: 'step-1',
        workflowId: 'wf-1',
        runId: 'run-1',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'kind' && i.code === 'invalid-field')).toBe(true);
    });

    it('rejects non-object value', () => {
      const issues = validateAdvisoryControlEvent('not-an-object');
      expect(issues.some(i => i.code === 'invalid-field')).toBe(true);
    });
  });

  describe('unknown event discriminant', () => {
    it('rejects unknown event value', () => {
      const event = {
        kind: 'control',
        event: 'unknown-event-type',
      };
      const issues = validateAdvisoryControlEvent(event);
      expect(issues.some(i => i.field === 'event' && i.code === 'invalid-field')).toBe(true);
    });
  });
});

// Minimal valid FsmRunState JSON with stateSchemaVersion: 1 for MIGR-05 round-trip test
const VALID_FSM_STATE_JSON = JSON.stringify({
  runId: 'run-1',
  stateSchemaVersion: 1,
  workflowId: 'wf-1',
  workstream: null,
  currentState: 'start',
  configSnapshotHash: 'abc123',
  createdAt: '2026-04-29T00:00:00.000Z',
  updatedAt: '2026-04-29T00:00:00.000Z',
  transitionHistory: [],
  migration: { status: 'none' },
  resume: { status: 'new' },
  autoMode: { active: false, source: 'none' },
});

describe('parseFsmRunStateOrControlEvent', () => {
  it('returns MigrationRequiredEvent when stateSchemaVersion is 0 (< 1)', () => {
    const raw = JSON.stringify({ stateSchemaVersion: 0 });
    const result = parseFsmRunStateOrControlEvent(raw, '/some/path/fsm-state.json');
    expect(result).toMatchObject({
      kind: 'control',
      event: 'migration-required',
      statePath: '/some/path/fsm-state.json',
      detectedVersion: 0,
      currentVersion: 1,
    });
    const event = result as { migrationSteps: Array<{ description: string }> };
    expect(event.migrationSteps.length).toBeGreaterThan(0);
    expect(typeof event.migrationSteps[0].description).toBe('string');
    expect(event.migrationSteps[0].description.trim()).not.toBe('');
  });

  it('returns MigrationRequiredEvent when stateSchemaVersion field is missing (detectedVersion -1)', () => {
    const raw = JSON.stringify({ someOtherField: 'value' });
    const result = parseFsmRunStateOrControlEvent(raw, '/path/fsm-state.json');
    expect(result).toMatchObject({
      kind: 'control',
      event: 'migration-required',
      detectedVersion: -1,
      currentVersion: 1,
    });
  });

  it('returns ResumeBlockedEvent when stateSchemaVersion is 2 (> 1)', () => {
    const raw = JSON.stringify({ stateSchemaVersion: 2 });
    const result = parseFsmRunStateOrControlEvent(raw, '/path/fsm-state.json');
    expect(result).toMatchObject({
      kind: 'control',
      event: 'resume-blocked',
      statePath: '/path/fsm-state.json',
      detectedVersion: 2,
      currentVersion: 1,
    });
  });

  it('returns valid FsmRunState when stateSchemaVersion is 1 (MIGR-05 round-trip)', () => {
    const result = parseFsmRunStateOrControlEvent(VALID_FSM_STATE_JSON, '/path/fsm-state.json');
    // Must NOT be a control event
    expect((result as { kind?: string }).kind).not.toBe('control');
    const state = result as { stateSchemaVersion: number; runId: string; workflowId: string };
    expect(state.stateSchemaVersion).toBe(1);
    expect(state.runId).toBe('run-1');
    expect(state.workflowId).toBe('wf-1');
  });

  it('throws FsmStateError with read-failed code on malformed JSON', () => {
    expect(() => parseFsmRunStateOrControlEvent('not valid json', '/path/fsm-state.json'))
      .toThrow(FsmStateError);
    expect(() => parseFsmRunStateOrControlEvent('not valid json', '/path/fsm-state.json'))
      .toThrow(expect.objectContaining({ code: 'read-failed' }));
  });

  it('migrationSteps description mentions the detected and target version', () => {
    const raw = JSON.stringify({ stateSchemaVersion: 0 });
    const result = parseFsmRunStateOrControlEvent(raw, '/path/fsm-state.json') as {
      migrationSteps: Array<{ description: string }>;
    };
    const desc = result.migrationSteps[0].description;
    expect(desc).toContain('0');
    expect(desc).toContain('1');
  });
});
