import { describe, expect, it } from 'vitest';
import { inferWorkflowSemanticManifest, validateWorkflowSemanticManifests } from './workflow-semantics.js';
import type { CompileDiagnostic } from './types.js';

const FAMILY_FIXTURES = [
  ['mode-dispatch', 'Choose mode from --auto, --reviews, and flag priority.'],
  ['hitl', 'Pause at checkpoint:human-verify and AskUserQuestion before resume.'],
  ['config-gate', 'Read config-get workflow.auto_advance from .planning/config.json.'],
  ['context-budget-branch', 'If context budget or token count exceeds the context window, branch.'],
  ['parallel-wave', 'Start a parallel wave with Task(gsd-executor) and spawn_agent workers.'],
  ['filesystem-fallback', 'Use filesystem fallback when file exists checks show completed work.'],
  ['sentinel-polling', 'Poll sentinel files until the sentinel marker is present.'],
  ['non-blocking-side-effect', 'Run the watchdog as a non-blocking side effect fire-and-forget step.'],
  ['nested-fsm', 'Nested FSM debugger and verifier escalation loops are preserved.'],
  ['dynamic-roadmap', 'Re-read roadmap after each phase; roadmap must be re-read before transition.'],
  ['workstream-namespace', 'Inject workstream namespace from --ws into state paths.'],
  ['runtime-type-branch', 'Branch on runtime provider: Codex, Claude, Gemini, or OpenCode.'],
  ['text-mode-substitution', 'Use text_mode or text-mode when AskUserQuestion fallback is required.'],
  ['quantitative-gate', 'Require threshold minimum count score before continuing.'],
  ['completion-marker', 'Require COMPLETION marker, PLAN COMPLETE, or SUMMARY evidence.'],
  ['fallback-posture', 'Record fallback posture and reduced-confidence provider fallback.'],
  ['evidence-requirement', 'Collect evidence, required evidence, and expectedEvidence.'],
] as const;

describe('inferWorkflowSemanticManifest', () => {
  it.each(FAMILY_FIXTURES)('infers %s from representative workflow text', (family, content) => {
    const manifest = inferWorkflowSemanticManifest('/workflows/demo', content);

    expect(manifest.workflowId).toBe('/workflows/demo');
    expect(manifest.semantics).toContainEqual(expect.objectContaining({
      family,
      provenance: 'audit-inference',
    }));
  });

  it('orders semantic entries deterministically by family and value', () => {
    const content = [
      'SUMMARY evidence with expectedEvidence.',
      'Use --auto mode with Task(gsd-executor).',
      'Pause at checkpoint and read workflow.auto_advance.',
    ].join('\n');

    const first = inferWorkflowSemanticManifest('/workflows/demo', content);
    const second = inferWorkflowSemanticManifest('/workflows/demo', content);

    expect(second).toEqual(first);
    expect(first.semantics.map((entry) => entry.family)).toEqual(
      [...first.semantics.map((entry) => entry.family)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('includes deterministic branchIds for inferred mode-dispatch semantics', () => {
    const manifest = inferWorkflowSemanticManifest('/workflows/demo', 'Choose mode from --auto.');

    expect(manifest.semantics).toContainEqual(expect.objectContaining({
      family: 'mode-dispatch',
      branchIds: ['mode:auto', 'mode:reviews', 'mode:gaps', 'mode:prd', 'mode:skip-research', 'mode:skip-verify'],
    }));
  });
});

describe('validateWorkflowSemanticManifests', () => {
  it('maps semantic manifest validation issues to WFSM-08 diagnostics', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(validateWorkflowSemanticManifests([
      {
        workflowId: '/workflows/demo',
        semantics: [
          {
            family: 'unknown-family',
            provenance: 'audit-inference',
          },
        ],
      } as never,
    ], diagnostics)).toEqual({ count: 1 });

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'WFSM-08',
      kind: 'workflow',
      id: '/workflows/demo',
      path: '/workflows/demo',
      field: 'semantics[0].family',
    }));
  });

  it('maps missing mode-dispatch branchIds to WFSM-08 diagnostics', () => {
    const diagnostics: CompileDiagnostic[] = [];

    expect(validateWorkflowSemanticManifests([
      {
        workflowId: '/workflows/demo',
        semantics: [
          {
            family: 'mode-dispatch',
            modes: ['auto'],
            priority: ['mode'],
            provenance: 'audit-inference',
          },
        ],
      } as never,
    ], diagnostics)).toEqual({ count: 1 });

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'WFSM-08',
      kind: 'workflow',
      id: '/workflows/demo',
      path: '/workflows/demo',
      field: 'semantics[0].branchIds',
    }));
  });
});
