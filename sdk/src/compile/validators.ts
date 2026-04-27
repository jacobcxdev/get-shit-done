/**
 * Corpus validation checks for gsd-sdk compile.
 * Each validator accepts an array of items + diagnostics accumulator.
 * Validators push errors/warnings and never throw on corpus failures.
 * Per COMP-05 through COMP-10, D-09 through D-10.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { mkError, mkWarning } from './diagnostics.js';
import { toPosixPath, toRepoRelative } from './paths.js';
import type { CommandEntry, CompileDiagnostic, DiagnosticKind, WorkflowEntry } from './types.js';

type IdPathEntry = {
  id: string;
  path: string;
};

type CategoryCount = {
  count: number;
};

const REQUIRED_GENERATED_BASELINES = [
  'command-coverage',
  'workflow-coverage',
  'agent-contracts',
  'hook-install',
  'command-classification',
  'billing-boundary',
  'compile-summary',
] as const;

function emitDuplicateId(kind: DiagnosticKind, entries: IdPathEntry[], diagnostics: CompileDiagnostic[]): void {
  const byId = new Map<string, IdPathEntry[]>();
  for (const entry of entries) {
    const existing = byId.get(entry.id) ?? [];
    existing.push(entry);
    byId.set(entry.id, existing);
  }

  for (const [id, matches] of byId) {
    if (matches.length < 2) continue;
    diagnostics.push(
      mkError(
        'COMP-05',
        kind,
        id,
        matches[0]?.path ?? id,
        `duplicate ${kind} ID: ${id} appears in ${matches.map((entry) => entry.path).join(', ')}`,
        { field: 'id', hint: `each ${kind} must have a unique ID` },
      ),
    );
  }
}

export function validateDuplicateIds(
  commands: CommandEntry[],
  diagnostics: CompileDiagnostic[],
  workflows: WorkflowEntry[] = [],
  packets: Array<{ id: string; path: string }> = [],
  extensions: Array<{ id: string; path: string }> = [],
): void {
  emitDuplicateId('command', commands, diagnostics);
  emitDuplicateId('workflow', workflows, diagnostics);
  if (packets.length > 0) emitDuplicateId('packet', packets, diagnostics);
  if (extensions.length > 0) emitDuplicateId('extension', extensions, diagnostics);
}

export function validatePacketBudgets(
  packets: Array<{ workflowId: string; stepId: string; actionCount: number; budget: number }>,
  diagnostics: CompileDiagnostic[],
): CategoryCount {
  for (const packet of packets) {
    if (packet.actionCount <= packet.budget) continue;
    diagnostics.push(
      mkError(
        'COMP-06',
        'packet',
        packet.workflowId,
        `${packet.workflowId}#${packet.stepId}`,
        `packet budget exceeded in ${packet.workflowId} step ${packet.stepId}: ${packet.actionCount} actions > budget ${packet.budget}`,
        { field: 'actionCount', hint: `reduce actions to <= ${packet.budget} per packet` },
      ),
    );
  }
  return { count: packets.length };
}

function findCycle(edges: Map<string, string[]>): string[] | null {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    stack.push(id);
    for (const next of [...(edges.get(id) ?? [])].sort()) {
      if (!edges.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of [...edges.keys()].sort()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }

  return null;
}

export function validateExtensionDeps(
  extensions: Array<{ id: string; dependsOn: string[] }>,
  diagnostics: CompileDiagnostic[],
): CategoryCount {
  if (extensions.length === 0) return { count: 0 };

  const edges = new Map<string, string[]>();
  for (const extension of extensions) {
    edges.set(extension.id, extension.dependsOn);
  }

  const cycleChain = findCycle(edges);
  if (cycleChain) {
    diagnostics.push(
      mkError(
        'COMP-09',
        'extension',
        cycleChain[0] ?? extensions[0]?.id ?? 'extension',
        'sdk/src/generated/compile/command-classification.json',
        `extension dependency cycle detected: ${cycleChain.join(' -> ')}`,
        { hint: 'remove circular extension dependencies' },
      ),
    );
  }

  return { count: extensions.length };
}

export function validateTransformOrdering(
  transforms: Array<{ id: string; path: string; transformOrder: number; before?: string[]; after?: string[] }>,
  diagnostics: CompileDiagnostic[],
): CategoryCount {
  if (transforms.length === 0) return { count: 0 };

  const byId = new Map(transforms.map((transform) => [transform.id, transform]));
  const orderOwner = new Map<number, string>();
  for (const transform of transforms) {
    const existing = orderOwner.get(transform.transformOrder);
    if (existing) {
      diagnostics.push(
        mkError(
          'COMP-10',
          'baseline',
          transform.id,
          transform.path,
          `duplicate transform order ${transform.transformOrder}`,
          { field: 'transformOrder' },
        ),
      );
      continue;
    }
    orderOwner.set(transform.transformOrder, transform.id);
  }

  const edges = new Map<string, string[]>(transforms.map((transform) => [transform.id, []]));
  for (const transform of transforms) {
    for (const target of transform.before ?? []) {
      if (!byId.has(target)) {
        diagnostics.push(
          mkError('COMP-10', 'baseline', transform.id, transform.path, `unknown transform ordering target: ${target}`, {
            field: 'before',
          }),
        );
        continue;
      }
      edges.get(transform.id)?.push(target);
    }
    for (const target of transform.after ?? []) {
      if (!byId.has(target)) {
        diagnostics.push(
          mkError('COMP-10', 'baseline', transform.id, transform.path, `unknown transform ordering target: ${target}`, {
            field: 'after',
          }),
        );
        continue;
      }
      edges.get(target)?.push(transform.id);
    }
  }

  const cycleChain = findCycle(edges);
  if (cycleChain) {
    const offender = byId.get(cycleChain[0] ?? '');
    diagnostics.push(
      mkError(
        'COMP-10',
        'baseline',
        cycleChain[0] ?? 'transform',
        offender?.path ?? 'sdk/src/generated/compile/compile-summary.json',
        `transform ordering cycle detected: ${cycleChain.join(' -> ')}`,
        { field: 'transformOrder' },
      ),
    );
  }

  return { count: transforms.length };
}

export function validateStateReferences(
  references: Array<{ workflowId: string; stepId: string; stateId: string; path: string }>,
  validStateIds: Set<string>,
  diagnostics: CompileDiagnostic[],
): CategoryCount {
  for (const ref of references) {
    if (validStateIds.has(ref.stateId)) continue;
    diagnostics.push(
      mkError(
        'COMP-10',
        'state',
        ref.stateId,
        ref.path,
        `invalid state reference ${ref.stateId} in ${ref.workflowId}#${ref.stepId}`,
        { field: 'stateId', hint: 'state references must target declared FSM states' },
      ),
    );
  }

  return { count: references.length };
}

export function validateGeneratedArtifactDeclarations(
  declarations: Array<{ id: string; path: string; idempotent?: boolean; atomicWrite?: boolean }>,
  diagnostics: CompileDiagnostic[],
): CategoryCount {
  for (const declaration of declarations) {
    if (declaration.idempotent !== true) {
      diagnostics.push(
        mkError(
          'COMP-10',
          'baseline',
          declaration.id,
          declaration.path,
          `generated artifact ${declaration.id} is missing idempotency metadata`,
          { field: 'idempotent' },
        ),
      );
    }
    if (declaration.atomicWrite !== true) {
      diagnostics.push(
        mkError(
          'COMP-10',
          'baseline',
          declaration.id,
          declaration.path,
          `generated artifact ${declaration.id} is missing atomic-write declaration`,
          { field: 'atomicWrite' },
        ),
      );
    }
  }

  return { count: declarations.length };
}

export function validateGeneratedArtifacts(
  projectDir: string,
  generatedDir: string,
  requiredBaselines: string[],
  isCheckMode: boolean,
  diagnostics: CompileDiagnostic[],
): void {
  if (!isCheckMode) return;

  const absGeneratedDir = isAbsolute(generatedDir) ? generatedDir : join(projectDir, generatedDir);
  for (const name of requiredBaselines) {
    const filePath = join(absGeneratedDir, `${name}.json`);
    const relPath = isAbsolute(filePath) ? toRepoRelative(projectDir, filePath) : toPosixPath(filePath);
    if (existsSync(filePath)) continue;
    diagnostics.push(
      mkError('COMP-10', 'baseline', name, relPath, `missing required baseline: ${name}.json`, {
        hint: 'run gsd-sdk compile --write to generate committed baselines',
      }),
    );
  }
}
