import { describe, expect, it } from 'vitest';
import { validateAdvisoryControlEvent } from './control-events.js';

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
