import { describe, expect, it } from 'vitest';
import { formatQueryOutput } from './output.js';

const migrationEvent = {
  kind: 'control' as const,
  event: 'migration-required' as const,
  detectedVersion: 0,
  currentVersion: 1,
  statePath: '/tmp/fsm-state.json',
  migrationSteps: [{ description: 'Run gsd-sdk migrate' }],
};

const resumeBlockedEvent = {
  kind: 'control' as const,
  event: 'resume-blocked' as const,
  detectedVersion: 999,
  currentVersion: 1,
  statePath: '/tmp/fsm-state.json',
};

describe('formatQueryOutput - control event payloads', () => {
  it('fsm.state with migration-required event prints JSON, not [object Object]', () => {
    const output = formatQueryOutput({ command: 'fsm.state', args: [], result: migrationEvent });
    expect(output.exitCode).toBe(0);
    expect(output.stdout).not.toContain('[object Object]');
    const parsed = JSON.parse(output.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ kind: 'control', event: 'migration-required' });
  });

  it('fsm.run-id with resume-blocked event prints JSON, not [object Object]', () => {
    const output = formatQueryOutput({ command: 'fsm.run-id', args: [], result: resumeBlockedEvent });
    expect(output.exitCode).toBe(0);
    expect(output.stdout).not.toContain('[object Object]');
    const parsed = JSON.parse(output.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ kind: 'control', event: 'resume-blocked' });
  });

  it('fsm.confidence with migration-required event prints JSON, not [object Object]', () => {
    const output = formatQueryOutput({ command: 'fsm.confidence', args: [], result: migrationEvent });
    expect(output.exitCode).toBe(0);
    expect(output.stdout).not.toContain('[object Object]');
    const parsed = JSON.parse(output.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ kind: 'control', event: 'migration-required' });
  });

  it('fsm.history with migration-required event prints JSON control event, not empty entries', () => {
    const output = formatQueryOutput({ command: 'fsm.history', args: [], result: migrationEvent });
    expect(output.exitCode).toBe(0);
    expect(output.stdout).not.toContain('[object Object]');
    const parsed = JSON.parse(output.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ kind: 'control', event: 'migration-required' });
  });
});

describe('formatQueryOutput - normal payloads (regression guard)', () => {
  it('fsm.state with normal FsmRunState result returns scalar currentState', () => {
    const output = formatQueryOutput({
      command: 'fsm.state',
      args: [],
      result: { currentState: 'verify', runId: 'r1', stateSchemaVersion: 1 },
    });
    expect(output.stdout.trim()).toBe('verify');
    expect(output.exitCode).toBe(0);
  });

  it('fsm.run-id with normal result returns scalar runId', () => {
    const output = formatQueryOutput({
      command: 'fsm.run-id',
      args: [],
      result: { runId: 'run-123', workstream: null },
    });
    expect(output.stdout.trim()).toBe('run-123');
    expect(output.exitCode).toBe(0);
  });

  it('fsm.confidence with normal result returns scalar confidence string', () => {
    const output = formatQueryOutput({
      command: 'fsm.confidence',
      args: [],
      result: { confidence: 'full', workstream: null },
    });
    expect(output.stdout.trim()).toBe('full');
    expect(output.exitCode).toBe(0);
  });
});
