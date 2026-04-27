/**
 * Unit tests for compile type contracts.
 */

import { describe, it, expect } from 'vitest';
import type {
  AgentEntry,
  CommandEntry,
  CompileReport,
  HookEntry,
  WorkflowEntry,
} from './types.js';

describe('compile type contracts', () => {
  it('supports command entries with primary and branch-conditioned workflow refs', () => {
    const command: CommandEntry = {
      id: '/gsd-do',
      path: 'commands/gsd/do.md',
      hash: '0'.repeat(64),
      workflowRef: 'do',
      workflowRefs: [
        {
          workflowId: 'do',
          rawRef: '@get-shit-done/workflows/do.md',
          source: 'frontmatter',
          primary: true,
        },
        {
          workflowId: 'quick',
          rawRef: '@get-shit-done/workflows/quick.md',
          source: 'mode-routing',
          primary: false,
          branch: {
            condition: 'quick task',
            sourceText: 'route quick tasks to quick workflow',
          },
        },
      ],
      confidence: 'extracted',
    };

    expect(command.workflowRefs).toHaveLength(2);
    expect(command.workflowRefs[1]?.branch?.condition).toBe('quick task');
  });

  it('supports workflow entries with determinism and semantic feature inference metadata', () => {
    const workflow: WorkflowEntry = {
      id: 'execute-plan',
      path: 'get-shit-done/workflows/execute-plan.md',
      hash: '1'.repeat(64),
      stepCount: { value: 24, inferred: true },
      runnerType: { value: 'markdown-workflow', inferred: true },
      determinism: { value: 'dynamic', inferred: true },
      semanticFeatures: {
        values: ['hitl', 'task-spawn', 'state-write'],
        inferred: true,
      },
      semanticManifest: {
        workflowId: 'execute-plan',
        semantics: [
          {
            family: 'hitl',
            suspensionPoints: ['checkpoint'],
            resumableOutcomes: ['resume'],
            mockInputSeam: 'AskUserQuestion',
            provenance: 'workflow-text',
          },
        ],
      },
      isTopLevel: true,
    };

    expect(workflow.determinism.value).toBe('dynamic');
    expect(workflow.semanticFeatures.values).toContain('state-write');
  });

  it('supports agent entries with role class and output artifacts', () => {
    const agent: AgentEntry = {
      id: 'gsd-executor',
      path: 'agents/gsd-executor.md',
      hash: '2'.repeat(64),
      name: 'gsd-executor',
      description: 'Executes plans',
      roleClass: 'executor',
      allowedTools: ['Read', 'Write'],
      diskWriteMandate: true,
      worktreeRequired: false,
      outputArtifacts: ['SUMMARY.md'],
      completionMarker: 'SUMMARY.md written',
      color: 'yellow',
    };

    expect(agent.roleClass).toBe('executor');
    expect(agent.outputArtifacts).toEqual(['SUMMARY.md']);
  });

  it('supports hook entries with install target classification', () => {
    const hook: HookEntry = {
      id: 'gsd-check-update-worker',
      path: 'hooks/gsd-check-update-worker.js',
      hash: '3'.repeat(64),
      kind: 'js',
      installTargetClass: 'worker',
      distPath: 'hooks/dist/gsd-check-update-worker.js',
      distExists: true,
      executable: false,
    };

    expect(hook.installTargetClass).toBe('worker');
  });

  it('supports compile reports with counts, manifests, and diagnostics', () => {
    const report: CompileReport = {
      counts: { commands: 1, workflows: 1, agents: 1, hooks: 1 },
      manifests: {
        commands: [],
        workflows: [],
        workflowSemantics: [],
        agents: [],
        hooks: [],
        classification: [],
        billing: {
          entrypoints: ['sdk/src/compile/index.ts'],
          violations: [],
          clean: true,
        },
      },
      diagnostics: [],
    };

    expect(report.counts.commands).toBe(1);
    expect(report.manifests.billing.clean).toBe(true);
    expect(report.diagnostics).toEqual([]);
  });
});
