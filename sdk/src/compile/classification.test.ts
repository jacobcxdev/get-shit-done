/**
 * Unit tests for command classification.
 */

import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  SEED_HARD_OUTLIERS,
  classifyCommands,
  matchingCategoriesForCommand,
} from './classification.js';
import type { CommandCategory, CommandEntry, CompileDiagnostic } from './types.js';

function command(id: string, overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id,
    path: `commands/gsd/${id.replace('/gsd-', '')}.md`,
    hash: '0'.repeat(64),
    workflowRef: overrides.workflowRef ?? `/workflows/${id.replace('/gsd-', '')}`,
    workflowRefs: overrides.workflowRefs ?? [],
    confidence: 'extracted',
    ...overrides,
  };
}

describe('command classification', () => {
  it('classifies all five seed hard outliers without diagnostics', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const entries = classifyCommands([...SEED_HARD_OUTLIERS].map((id) => command(id)), diagnostics);

    expect(entries).toHaveLength(5);
    expect(diagnostics).toEqual([]);
    expect(entries).toEqual(
      expect.arrayContaining(
        [...SEED_HARD_OUTLIERS].map((id) =>
          expect.objectContaining({
            commandId: id,
            category: 'hard-outlier',
            isHardOutlier: true,
            migrationDisposition: 'manual-posture-required',
            outlierPosture: 'seed-outlier',
          }),
        ),
      ),
    );
  });

  it('emits CLSS-04 when a command matches no category', () => {
    const diagnostics: CompileDiagnostic[] = [];

    classifyCommands([command('/gsd-new-hard-outlier')], diagnostics);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CLSS-04',
          kind: 'command',
          id: '/gsd-new-hard-outlier',
          path: 'commands/gsd/new-hard-outlier.md',
          message: expect.stringContaining('unclassifiable command'),
        }),
      ]),
    );
  });

  it('emits CLSS-04 when a non-seed command is classified as a hard outlier', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const rules = [{ category: 'hard-outlier' as const, ids: new Set(['/gsd-new-hard-outlier']) }];

    classifyCommands([command('/gsd-new-hard-outlier')], diagnostics, rules);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'CLSS-04',
        id: '/gsd-new-hard-outlier',
        message: expect.stringContaining('not in the seed set'),
        hint: 'see CONTEXT D-22',
      }),
    ]);
  });

  it('returns every matching category for a fixture overlap', () => {
    const rules = [
      { category: 'core-lifecycle' as const, ids: new Set(['/fixture-overlap']) },
      { category: 'composite' as const, ids: new Set(['/fixture-overlap']) },
    ];

    expect(matchingCategoriesForCommand('/fixture-overlap', rules)).toEqual(['core-lifecycle', 'composite']);
  });

  it('emits CLSS-04 when fixture rules match multiple taxonomy categories', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const rules = [
      { category: 'core-lifecycle' as const, ids: new Set(['/fixture-overlap']) },
      { category: 'composite' as const, ids: new Set(['/fixture-overlap']) },
    ];

    classifyCommands([command('/fixture-overlap')], diagnostics, rules);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'CLSS-04',
        id: '/fixture-overlap',
        field: 'category',
        message: expect.stringContaining('multiple taxonomy categories'),
        hint: expect.stringContaining('CLSS-01'),
      }),
    ]);
  });

  it('does not treat multiple conditioned workflow refs as multiple taxonomy categories', () => {
    const diagnostics: CompileDiagnostic[] = [];

    classifyCommands(
      [
        command('/gsd-discuss-phase', {
          workflowRef: '/workflows/discuss-phase',
          workflowRefs: [
            {
              workflowId: '/workflows/discuss-phase-assumptions',
              rawRef: '@get-shit-done/workflows/discuss-phase-assumptions.md',
              source: 'mode-routing',
              primary: false,
              branch: {
                condition: 'DISCUSS_MODE is assumptions',
                sourceText: 'If DISCUSS_MODE is "assumptions"',
              },
            },
            {
              workflowId: '/workflows/discuss-phase',
              rawRef: '@get-shit-done/workflows/discuss-phase.md',
              source: 'mode-routing',
              primary: true,
              branch: {
                condition: 'default',
                sourceText: 'If DISCUSS_MODE is "discuss" (or unset, or any other value)',
              },
            },
          ],
        }),
      ],
      diagnostics,
    );

    expect(diagnostics.filter((d) => d.code === 'CLSS-04')).toEqual([]);
  });

  it('assigns deterministic posture to core lifecycle commands', () => {
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = classifyCommands([command('/gsd-plan-phase')], diagnostics);

    expect(diagnostics).toEqual([]);
    expect(entry?.category).toBe('core-lifecycle');
    expect(entry?.determinismPosture).toBe('deterministic');
  });

  it('assigns dynamic posture to dynamic branch commands', () => {
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = classifyCommands([command('/gsd-do')], diagnostics);

    expect(diagnostics).toEqual([]);
    expect(entry?.category).toBe('dynamic-branch');
    expect(entry?.determinismPosture).toBe('dynamic');
  });

  it('populates agent types from the command entry', () => {
    const diagnostics: CompileDiagnostic[] = [];

    const [entry] = classifyCommands([command('/gsd-plan-phase', { agent: 'gsd-planner' })], diagnostics);

    expect(entry?.agentTypes).toEqual(['gsd-planner']);
  });

  it('keeps the locked taxonomy and seed set sizes stable', () => {
    expect(CATEGORIES).toHaveLength(6);
    expect(new Set<CommandCategory>(CATEGORIES).size).toBe(6);
    expect(SEED_HARD_OUTLIERS.size).toBe(5);
  });

  it('returns one sorted entry per input command', () => {
    const diagnostics: CompileDiagnostic[] = [];

    const entries = classifyCommands(
      [command('/gsd-plan-phase'), command('/gsd-do'), command('/gsd-help')],
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    expect(entries.map((entry) => entry.commandId)).toEqual(['/gsd-do', '/gsd-help', '/gsd-plan-phase']);
  });
});
