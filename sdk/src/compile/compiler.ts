/**
 * Compiler orchestrator for gsd-sdk compile.
 * Collects live corpus, validates, classifies, checks billing boundary,
 * and returns a CompileReport. Per COMP-00 through COMP-13, CLSS-01-04, BILL-01-04, AGNT-01-02.
 */

import { join } from 'node:path';
import { checkBillingBoundary } from './billing-boundary.js';
import { checkBaselines, writeBaselines } from './baselines.js';
import { classifyCommands } from './classification.js';
import { sortDiagnostics } from './diagnostics.js';
import { collectAgents } from './inventory/agents.js';
import { collectCommands } from './inventory/commands.js';
import { collectHooks } from './inventory/hooks.js';
import { collectPacketDefinitionCandidates } from './inventory/packets.js';
import { collectWorkflows } from './inventory/workflows.js';
import { validateAdvisoryPacketDefinitions, validatePacketAtomicity } from './packet-contracts.js';
import { compileCorpusPaths } from './paths.js';
import { validateWorkflowSemanticManifests } from './workflow-semantics.js';
import {
  validateDuplicateIds,
  validateExtensionDeps,
  validateGeneratedArtifactDeclarations,
  validateGeneratedArtifacts,
  validatePacketBudgets,
  validateStateReferences,
  validateTransformOrdering,
} from './validators.js';
import type { CompileDiagnostic, CompileReport } from './types.js';
import type { PacketDefinitionCandidate } from './inventory/packets.js';

export const REQUIRED_BASELINES = [
  'command-coverage',
  'workflow-coverage',
  'workflow-semantics',
  'agent-contracts',
  'hook-install',
  'command-classification',
  'billing-boundary',
  'compile-summary',
] as const;

type CompileOptions = {
  json: boolean;
  check: boolean;
  write: boolean;
  packetDefinitions?: PacketDefinitionCandidate[];
};

type GeneratedArtifactDeclaration = {
  id: string;
  path: string;
  transformOrder: number;
  idempotent: true;
  atomicWrite: true;
};

export function buildManifestRecord(report: CompileReport): Record<string, unknown> {
  return {
    'command-coverage': report.manifests.commands,
    'workflow-coverage': report.manifests.workflows,
    'workflow-semantics': report.manifests.workflowSemantics,
    'agent-contracts': report.manifests.agents,
    'hook-install': report.manifests.hooks,
    'command-classification': report.manifests.classification,
    'billing-boundary': report.manifests.billing,
    'compile-summary': {
      counts: report.counts,
      outlierCount: report.manifests.classification.filter((entry) => entry.isHardOutlier).length,
    },
  };
}

function generatedArtifactDeclarations(generatedDir: string): GeneratedArtifactDeclaration[] {
  return REQUIRED_BASELINES.map((id, index) => ({
    id,
    path: `${generatedDir}/${id}.json`,
    transformOrder: (index + 1) * 10,
    idempotent: true,
    atomicWrite: true,
  }));
}

function outlierCount(report: CompileReport): number {
  return report.manifests.classification.filter((entry) => entry.isHardOutlier).length;
}

export async function runCompiler(projectDir: string, opts: CompileOptions): Promise<CompileReport> {
  const diagnostics: CompileDiagnostic[] = [];

  const workflows = await collectWorkflows(projectDir, diagnostics);
  const knownWorkflowIds = new Set(workflows.map((workflow) => workflow.id));
  const commands = await collectCommands(projectDir, diagnostics, knownWorkflowIds);
  const agents = await collectAgents(projectDir, diagnostics);
  const hooks = await collectHooks(projectDir, diagnostics);
  const classification = classifyCommands(commands, diagnostics);
  const packetCandidates = collectPacketDefinitionCandidates({ explicit: opts.packetDefinitions });

  validateDuplicateIds(
    commands,
    diagnostics,
    workflows,
    packetCandidates.map((packet) => ({ id: `${packet.workflowId}#${packet.stepId}`, path: packet.sourcePath })),
  );
  validatePacketBudgets([], diagnostics);
  validateAdvisoryPacketDefinitions(packetCandidates, agents, diagnostics);
  validatePacketAtomicity(packetCandidates, diagnostics);
  const workflowSemantics = workflows.map((workflow) => workflow.semanticManifest);
  validateWorkflowSemanticManifests(workflowSemantics, diagnostics);
  validateExtensionDeps([], diagnostics);

  const billing = await checkBillingBoundary(projectDir, diagnostics);
  const paths = compileCorpusPaths(projectDir);
  const declarations = generatedArtifactDeclarations(paths.generated);
  validateTransformOrdering(declarations, diagnostics);
  validateGeneratedArtifactDeclarations(declarations, diagnostics);
  validateStateReferences([], new Set(), diagnostics);
  validateGeneratedArtifacts(projectDir, paths.generated, [...REQUIRED_BASELINES], opts.check, diagnostics);

  const report: CompileReport = {
    counts: {
      commands: commands.length,
      workflows: workflows.length,
      agents: agents.length,
      hooks: hooks.length,
    },
    manifests: {
      commands,
      workflows,
      workflowSemantics,
      agents,
      hooks,
      classification,
      billing,
    },
    diagnostics: sortDiagnostics(diagnostics),
  };

  const manifests = buildManifestRecord(report);
  if (opts.write) {
    await writeBaselines(join(projectDir, paths.generated), manifests);
  }
  if (opts.check) {
    await checkBaselines(projectDir, paths.generated, manifests, report.diagnostics);
    report.diagnostics = sortDiagnostics(report.diagnostics);
  }

  if (!opts.json) {
    console.log(
      `Commands: ${report.counts.commands} | Workflows: ${report.counts.workflows} | ` +
      `Agents: ${report.counts.agents} | Hooks: ${report.counts.hooks} | Outliers: ${outlierCount(report)}`,
    );
  }

  if (report.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    process.exitCode = 1;
  }

  return report;
}
