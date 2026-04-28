import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBaselines, writeBaselines } from '../compile/baselines.js';
import type { CompileDiagnostic } from '../compile/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const GENERATED_PARITY_DIR = 'sdk/src/generated/parity';

type DispositionEntry = {
  id: string;
  behaviour: string;
  requirementId: string;
  targetSurface: string;
  disposition: 'absorbed' | 'open-gap';
  retirementStatus: 'blocked' | 'unblocked';
  evidenceCheck: string;
};

type BehaviourInventoryEntry = {
  id: string;
  behaviour: string;
  requirementId: string;
  targetSurface: string;
  absorptionCommand: string;
  open: boolean;
};

type ClassificationEntry = {
  commandId: string;
  workflowId?: string | null;
  category: string;
  isHardOutlier?: boolean;
};

type WorkflowSemanticEntry = {
  workflowId: string;
  semantics: Array<{
    branchIds?: string[];
    suspensionPoints?: string[];
  }>;
};

type ParityWorkflowEntry = {
  workflowId: string | null;
  commandId: string;
  category: string;
  parityTier: 'deterministic' | 'dynamic-branch' | 'hitl' | 'hard-outlier' | 'query-native';
  branchIds?: string[];
  suspensionPoints?: string[];
};

function assertString(value: unknown, field: string, id: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid behaviour inventory entry ${id}: ${field} must be a non-empty string`);
  }
}

function validateInventoryEntry(value: unknown, index: number): BehaviourInventoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid behaviour inventory entry at index ${index}: expected object`);
  }
  const entry = value as Partial<BehaviourInventoryEntry>;
  const id = typeof entry.id === 'string' && entry.id.trim() !== '' ? entry.id : `#${index}`;

  assertString(entry.id, 'id', id);
  assertString(entry.behaviour, 'behaviour', id);
  assertString(entry.requirementId, 'requirementId', id);
  assertString(entry.targetSurface, 'targetSurface', id);
  assertString(entry.absorptionCommand, 'absorptionCommand', id);
  if (/todo/i.test(entry.absorptionCommand) || /todo/i.test(entry.behaviour)) {
    throw new Error(`Invalid behaviour inventory entry ${id}: TODO strings are not permitted`);
  }
  if (typeof entry.open !== 'boolean') {
    throw new Error(`Invalid behaviour inventory entry ${id}: open must be a boolean`);
  }

  return {
    id: entry.id,
    behaviour: entry.behaviour,
    requirementId: entry.requirementId,
    targetSurface: entry.targetSurface,
    absorptionCommand: entry.absorptionCommand,
    open: entry.open,
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function buildDispositionManifest(): Promise<DispositionEntry[]> {
  const inventoryPath = join(PROJECT_ROOT, 'sdk/src/parity/behaviour-inventory.json');
  const rawInventory = await readJson<unknown[]>(inventoryPath);
  const inventory = rawInventory.map(validateInventoryEntry);
  const ids = new Set<string>();
  for (const item of inventory) {
    if (ids.has(item.id)) {
      throw new Error(`Duplicate behaviour inventory id: ${item.id}`);
    }
    ids.add(item.id);
  }

  return inventory.map((item) => ({
    id: item.id,
    behaviour: item.behaviour,
    requirementId: item.requirementId,
    targetSurface: item.targetSurface,
    disposition: item.open ? 'open-gap' : 'absorbed',
    retirementStatus: item.open ? 'blocked' : 'unblocked',
    evidenceCheck: item.absorptionCommand,
  }));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function buildParityWorkflowIndex(): Promise<ParityWorkflowEntry[]> {
  const classificationPath = join(PROJECT_ROOT, 'sdk/src/generated/compile/command-classification.json');
  const semanticsPath = join(PROJECT_ROOT, 'sdk/src/generated/compile/workflow-semantics.json');
  const classification = await readJson<ClassificationEntry[]>(classificationPath);
  const semantics = await readJson<WorkflowSemanticEntry[]>(semanticsPath);

  const branchIdsFor = new Map<string, string[]>();
  const suspensionPointsFor = new Map<string, string[]>();
  for (const entry of semantics) {
    const branchIds = unique(
      entry.semantics.flatMap((semantic) => (Array.isArray(semantic.branchIds) ? semantic.branchIds : [])),
    );
    if (branchIds.length > 0) {
      branchIdsFor.set(entry.workflowId, branchIds);
    }

    const suspensionPoints = unique(
      entry.semantics.flatMap((semantic) =>
        Array.isArray(semantic.suspensionPoints) ? semantic.suspensionPoints : [],
      ),
    );
    if (suspensionPoints.length > 0) {
      suspensionPointsFor.set(entry.workflowId, suspensionPoints);
    }
  }

  return classification.map((entry) => {
    const workflowId = entry.workflowId ?? null;
    const parityTier: ParityWorkflowEntry['parityTier'] =
      entry.isHardOutlier ||
      entry.category === 'hard-outlier' ||
      (entry.category === 'dynamic-branch' && (!workflowId || !branchIdsFor.has(workflowId)))
        ? 'hard-outlier'
        : entry.category === 'query-utility'
          ? 'query-native'
          : entry.category === 'dynamic-branch'
            ? 'dynamic-branch'
            : workflowId && suspensionPointsFor.has(workflowId)
              ? 'hitl'
              : 'deterministic';

    const result: ParityWorkflowEntry = {
      workflowId,
      commandId: entry.commandId,
      category: entry.category,
      parityTier,
    };

    if (parityTier === 'dynamic-branch' && workflowId) {
      result.branchIds = branchIdsFor.get(workflowId) ?? [];
    }

    if (parityTier === 'hitl' && workflowId) {
      result.suspensionPoints = suspensionPointsFor.get(workflowId) ?? [];
    }

    return result;
  });
}

export async function generateParityFixtures(mode: 'write' | 'check'): Promise<void> {
  const dispositionManifest = await buildDispositionManifest();
  const parityWorkflowIndex = await buildParityWorkflowIndex();
  const data = {
    'disposition-manifest': dispositionManifest,
    'parity-workflow-index': parityWorkflowIndex,
  };

  if (mode === 'write') {
    await mkdir(join(PROJECT_ROOT, GENERATED_PARITY_DIR), { recursive: true });
    await writeBaselines(join(PROJECT_ROOT, GENERATED_PARITY_DIR), data);
    console.log('[PRTY-06] Parity fixtures written to', GENERATED_PARITY_DIR);
    return;
  }

  const diagnostics: CompileDiagnostic[] = [];
  await checkBaselines(PROJECT_ROOT, GENERATED_PARITY_DIR, data, diagnostics);
  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) {
      process.stderr.write(`[PRTY-06] ${diagnostic.code} ${diagnostic.message ?? diagnostic.id}\n`);
    }
    process.exit(1);
  }
  console.log('[PRTY-06] Parity fixtures are up to date');
}

const mode = process.argv.includes('--check') ? 'check' : 'write';
generateParityFixtures(mode).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[PRTY-06] Fixture generation failed: ${message}\n`);
  process.exit(1);
});
