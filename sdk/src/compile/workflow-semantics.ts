/**
 * Workflow semantic inference and compile validators.
 * Converts prose workflow inventory into a structured advisory FSM contract.
 */

import {
  validateWorkflowSemanticManifest,
  type WorkflowSemanticEntry,
  type WorkflowSemanticManifest,
} from '../advisory/workflow-semantics.js';
import type { ProviderName } from '../advisory/provider-availability.js';
import { sortKeysDeep } from './baselines.js';
import { mkError } from './diagnostics.js';
import type { ClassificationEntry, CompileDiagnostic } from './types.js';

type SemanticCheck = {
  pattern: RegExp;
  create: () => WorkflowSemanticEntry;
};

type CountResult = {
  count: number;
};

type WorkflowProviderConfig = {
  agent_routing?: Record<string, unknown>;
};

const SEMANTIC_CHECKS: SemanticCheck[] = [
  {
    pattern: /--(?:auto|reviews|gaps|prd|skip-research|skip-verify)|mode|flag/i,
    create: () => {
      const modes = ['auto', 'reviews', 'gaps', 'prd', 'skip-research', 'skip-verify'];
      return {
        family: 'mode-dispatch',
        modes,
        priority: ['flag', 'mode', 'default'],
        branchIds: modes.map((mode) => `mode:${mode}`),
        provenance: 'audit-inference',
      };
    },
  },
  {
    pattern: /AskUserQuestion|checkpoint|human-verify|pause/i,
    create: () => ({
      family: 'hitl',
      suspensionPoints: ['AskUserQuestion', 'checkpoint', 'human-verify', 'pause'],
      resumableOutcomes: ['success', 'failure', 'resume'],
      mockInputSeam: 'AskUserQuestion',
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /config-get|\.planning\/config\.json|workflow\./i,
    create: () => ({
      family: 'config-gate',
      configKeys: ['workflow.*', '.planning/config.json'],
      guardName: 'workflow-config-gate',
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /context budget|context window|token/i,
    create: () => ({
      family: 'context-budget-branch',
      inputs: ['context budget', 'context window', 'token'],
      thresholds: ['context-window-limit'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /parallel wave|Task\(|spawn_agent|multi-agent/i,
    create: () => ({
      family: 'parallel-wave',
      lifecycle: ['spawn', 'poll', 'collect', 'merge'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /fallback|filesystem|file exists/i,
    create: () => ({
      family: 'filesystem-fallback',
      fallbackPaths: ['filesystem fallback'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /sentinel|poll/i,
    create: () => ({
      family: 'sentinel-polling',
      sentinelFiles: ['sentinel files'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /non-blocking|side effect|fire-and-forget/i,
    create: () => ({
      family: 'non-blocking-side-effect',
      sideEffects: ['non-blocking side effect'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /nested FSM|debugger|node repair|review loop|verifier escalation/i,
    create: () => ({
      family: 'nested-fsm',
      parentStateKey: 'parentRunState',
      childStateKey: 'childRunState',
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /roadmap.*re-read|re-read.*roadmap/i,
    create: () => ({
      family: 'dynamic-roadmap',
      inputs: ['roadmap'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /workstream|--ws/i,
    create: () => ({
      family: 'workstream-namespace',
      injectedKeys: ['workstream', '--ws'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /runtime|Codex|Claude|Gemini|OpenCode/i,
    create: () => ({
      family: 'runtime-type-branch',
      runtimes: ['Codex', 'Claude', 'Gemini', 'OpenCode'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /text_mode|text-mode|AskUserQuestion.*fallback/i,
    create: () => ({
      family: 'text-mode-substitution',
      substitutions: ['AskUserQuestion fallback', 'text_mode', 'text-mode'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /threshold|minimum|maximum|count|score/i,
    create: () => ({
      family: 'quantitative-gate',
      metric: 'workflow-threshold',
      operator: 'gte',
      threshold: 1,
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /completion marker|COMPLETION|PLAN COMPLETE|SUMMARY/i,
    create: () => ({
      family: 'completion-marker',
      markers: ['COMPLETION', 'PLAN COMPLETE', 'SUMMARY'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /fallback posture|reduced-confidence|provider fallback/i,
    create: () => ({
      family: 'fallback-posture',
      postures: ['fallback posture', 'reduced-confidence', 'provider fallback'],
      provenance: 'audit-inference',
    }),
  },
  {
    pattern: /evidence|required evidence|expectedEvidence/i,
    create: () => ({
      family: 'evidence-requirement',
      evidenceIds: ['evidence', 'required evidence', 'expectedEvidence'],
      provenance: 'audit-inference',
    }),
  },
];

function semanticSortKey(entry: WorkflowSemanticEntry): string {
  return JSON.stringify(sortKeysDeep(entry));
}

function sortSemanticEntries(entries: WorkflowSemanticEntry[]): WorkflowSemanticEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      a.provenance.localeCompare(b.provenance) ||
      semanticSortKey(a).localeCompare(semanticSortKey(b)),
  );
}

function providerNameFromRoute(value: unknown): ProviderName | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('codex')) return 'codex';
  if (normalized.startsWith('gemini')) return 'gemini';
  if (
    normalized.startsWith('claude') ||
    normalized === 'opus' ||
    normalized === 'sonnet' ||
    normalized === 'haiku'
  ) {
    return 'claude';
  }
  return null;
}

function mandatoryProvidersForWorkflow(
  workflowId: string,
  classifications: ClassificationEntry[],
  config: WorkflowProviderConfig | undefined,
): ProviderName[] {
  const providers = new Set<ProviderName>();
  const agentRouting = config?.agent_routing ?? {};

  for (const classification of classifications) {
    if (classification.workflowId !== workflowId) continue;
    for (const agentType of classification.agentTypes) {
      const provider = providerNameFromRoute(agentRouting[agentType]);
      if (provider) providers.add(provider);
    }
  }

  return ['claude', 'codex', 'gemini'].filter((provider): provider is ProviderName => providers.has(provider as ProviderName));
}

function withMandatoryProviders(
  semantic: WorkflowSemanticEntry,
  providers: ProviderName[],
): WorkflowSemanticEntry {
  if (providers.length === 0) return semantic;
  return {
    ...semantic,
    mandatoryProviders: [...new Set([...(semantic.mandatoryProviders ?? []), ...providers])].sort(),
  } as WorkflowSemanticEntry;
}

export function emitWorkflowSemanticMetadata(
  manifests: WorkflowSemanticManifest[],
  classifications: ClassificationEntry[],
  config?: WorkflowProviderConfig,
): WorkflowSemanticManifest[] {
  return manifests.map((manifest) => {
    const mandatoryProviders = mandatoryProvidersForWorkflow(manifest.workflowId, classifications, config);
    if (mandatoryProviders.length === 0) return manifest;
    return {
      ...manifest,
      semantics: manifest.semantics.map(semantic => withMandatoryProviders(semantic, mandatoryProviders)),
    };
  });
}

export function inferWorkflowSemanticManifest(workflowId: string, content: string): WorkflowSemanticManifest {
  const semantics: WorkflowSemanticEntry[] = [];

  for (const check of SEMANTIC_CHECKS) {
    if (check.pattern.test(content)) {
      semantics.push(check.create());
    }
  }

  return {
    workflowId,
    semantics: sortSemanticEntries(semantics),
  };
}

function manifestWorkflowId(manifest: WorkflowSemanticManifest): string {
  return typeof manifest.workflowId === 'string' && manifest.workflowId.trim() !== ''
    ? manifest.workflowId
    : 'unknown';
}

export function validateWorkflowSemanticManifests(
  manifests: WorkflowSemanticManifest[],
  diagnostics: CompileDiagnostic[],
  classifications: ClassificationEntry[] = [],
): CountResult {
  const manifestsByWorkflowId = new Map(manifests.map(manifest => [manifest.workflowId, manifest]));

  for (const manifest of manifests) {
    const workflowId = manifestWorkflowId(manifest);
    for (const issue of validateWorkflowSemanticManifest(manifest)) {
      diagnostics.push(
        mkError('WFSM-08', 'workflow', workflowId, workflowId, issue.message, {
          field: issue.field,
        }),
      );
    }
  }

  for (const classification of classifications) {
    if (classification.category !== 'dynamic-branch' || !classification.workflowId) continue;
    const manifest = manifestsByWorkflowId.get(classification.workflowId);
    const branchIds = (manifest?.semantics ?? [])
      .flatMap(semantic => ('branchIds' in semantic ? semantic.branchIds : []))
      .filter((branchId): branchId is string => typeof branchId === 'string' && branchId.trim() !== '');
    if (branchIds.length === 0) {
      diagnostics.push(
        mkError(
          'UNKNOWN_BRANCH_ID',
          'workflow',
          classification.workflowId,
          classification.workflowId,
          `Dynamic-branch workflow '${classification.workflowId}' has no branchIds declared in its semantic entry. Add branchIds to the manifest.`,
          { field: 'semantics.branchIds' },
        ),
      );
    }
  }

  return { count: manifests.length };
}
