/**
 * Unit tests for compile diagnostics helpers.
 */

import { describe, it, expect } from 'vitest';
import { mkError, mkWarning, sortDiagnostics } from './diagnostics.js';
import type { CompileDiagnostic } from './types.js';

describe('compile diagnostics', () => {
  it('constructs error diagnostics without optional fields by default', () => {
    expect(mkError('C01', 'command', 'gsd-foo', 'commands/gsd/foo.md', 'msg')).toEqual({
      code: 'C01',
      severity: 'error',
      message: 'msg',
      kind: 'command',
      id: 'gsd-foo',
      path: 'commands/gsd/foo.md',
    });
  });

  it('includes optional field and hint when provided', () => {
    expect(
      mkError('C02', 'workflow', 'execute-plan', 'get-shit-done/workflows/execute-plan.md', 'fix', {
        field: 'name',
        hint: 'fix it',
      }),
    ).toEqual({
      code: 'C02',
      severity: 'error',
      message: 'fix',
      kind: 'workflow',
      id: 'execute-plan',
      path: 'get-shit-done/workflows/execute-plan.md',
      field: 'name',
      hint: 'fix it',
    });
  });

  it('constructs warning diagnostics', () => {
    const diagnostic = mkWarning('W01', 'agent', 'gsd-executor', 'agents/gsd-executor.md', 'warn');

    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic).toEqual({
      code: 'W01',
      severity: 'warning',
      message: 'warn',
      kind: 'agent',
      id: 'gsd-executor',
      path: 'agents/gsd-executor.md',
    });
  });

  it('sorts diagnostics deterministically without mutating input', () => {
    const a = mkError('C01', 'command', 'a', 'commands/gsd/a.md', 'a', { field: 'alpha' });
    const b = mkError('C02', 'command', 'b', 'commands/gsd/b.md', 'b', { field: 'beta' });
    const c = mkWarning('W01', 'agent', 'c', 'agents/c.md', 'c');
    const input: CompileDiagnostic[] = [c, b, a];
    const before = JSON.stringify(input);

    const sortedOnce = sortDiagnostics(input);
    const sortedTwice = sortDiagnostics([c, b, a]);

    expect(sortedOnce).toEqual([a, b, c]);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(sortedOnce)).toBe(JSON.stringify(sortedTwice));
    expect(sortedOnce).not.toBe(input);
  });
});
