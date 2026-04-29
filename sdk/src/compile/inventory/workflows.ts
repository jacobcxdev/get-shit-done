/**
 * Workflow inventory collector for gsd-sdk compile.
 * Traverses top-level get-shit-done/workflows/*.md only.
 * Nested files are supporting assets, not counted as workflows.
 * Semantic feature fields are marked inferred:true per D-08. Per COMP-02.
 */

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { mkWarning } from '../diagnostics.js';
import { fileContentHash } from '../hash.js';
import { toRepoRelative } from '../paths.js';
import { extractLauncherBlock, validateLauncherMetadata } from '../slim-launcher.js';
import { parsePostureYaml } from '../outlier-postures.js';
import { inferWorkflowSemanticManifest } from '../workflow-semantics.js';
import type { CompileDiagnostic, WorkflowEntry } from '../types.js';

type SemanticFeature = WorkflowEntry['semanticFeatures']['values'][number];

const SEMANTIC_FEATURE_ORDER: SemanticFeature[] = [
  'mode-dispatch',
  'hitl',
  'provider-fallback',
  'filesystem-polling',
  'config-read',
  'task-spawn',
  'state-write',
];

function countSteps(content: string): number {
  const stepTags = content.match(/<step\b/g)?.length ?? 0;
  const headings = content.match(/^##\s+/gm)?.length ?? 0;
  return Math.max(stepTags, headings);
}

function inferRunnerType(content: string): string {
  if (/PhaseRunner|gsd-execute-phase|gsd-verify-phase/.test(content)) return 'phase-runner';
  if (/InitRunner|gsd-init/.test(content)) return 'init-runner';
  if (/gsd-sdk|SDK advisory/i.test(content)) return 'standalone';
  return 'unknown';
}

function inferDeterminism(content: string, stepCount: number): WorkflowEntry['determinism']['value'] {
  if (/AskUserQuestion|multi-model|provider fallback|Task\(|\bwhile\b|\bpoll\w*|\bmode\b|--auto/i.test(content)) {
    return 'dynamic';
  }
  if (stepCount > 0) return 'deterministic';
  return 'unknown';
}

function inferSemanticFeatures(content: string): SemanticFeature[] {
  const matches = new Set<SemanticFeature>();
  const checks: Array<[SemanticFeature, RegExp]> = [
    ['mode-dispatch', /\bmode\b|--(?:auto|reviews|gaps)|branch dispatch|\bflag\b/i],
    ['hitl', /AskUserQuestion|checkpoint|pause|human verification|human-verify/i],
    ['provider-fallback', /provider fallback|reduced-confidence|multi-model/i],
    ['filesystem-polling', /\bpoll\w*|waiting on files|lock files|generated outputs/i],
    ['config-read', /\.planning\/config\.json|config-get|routing config/i],
    ['task-spawn', /Task\(|agent spawning|spawn agents|multi-agent orchestration/i],
    ['state-write', /\.planning\/STATE\.md|FSM state|\block\b|transition|write-state/i],
  ];

  for (const [feature, pattern] of checks) {
    if (pattern.test(content)) matches.add(feature);
  }

  return SEMANTIC_FEATURE_ORDER.filter((feature) => matches.has(feature));
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeWorkflowDocId(value: string): string | null {
  const trimmed = value.trim().replace(/^`|`$/g, '').replace(/[.;:,]+$/, '');
  const workflowPathMatch = trimmed.match(/(?:^|\/)workflows\/([A-Za-z0-9_-]+)(?:\.md)?$/);
  if (workflowPathMatch) return `/workflows/${workflowPathMatch[1]}`;
  const directMatch = trimmed.match(/^\/workflows\/([A-Za-z0-9_-]+)$/);
  if (directMatch) return `/workflows/${directMatch[1]}`;
  const fileMatch = trimmed.match(/^([A-Za-z0-9_-]+)\.md$/);
  if (fileMatch) return `/workflows/${fileMatch[1]}`;
  return null;
}

function parseWorkflowIdsFromMarkdown(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(/(?:\/workflows\/[A-Za-z0-9_-]+(?:\.md)?|[A-Za-z0-9_-]+\.md)/g)) {
    const workflowId = normalizeWorkflowDocId(match[0]);
    if (workflowId) ids.add(workflowId);
  }
  return ids;
}

function parseWorkflowIdsFromManifest(content: string): Set<string> {
  const ids = new Set<string>();
  const manifest = JSON.parse(content) as { families?: { workflows?: unknown } };
  if (!Array.isArray(manifest.families?.workflows)) return ids;
  for (const value of manifest.families.workflows) {
    if (typeof value !== 'string') continue;
    const workflowId = normalizeWorkflowDocId(value);
    if (workflowId) ids.add(workflowId);
  }
  return ids;
}

async function collectDocumentedWorkflowIds(
  projectDir: string,
  diagnostics: CompileDiagnostic[],
): Promise<{ markdown: Set<string>; manifest: Set<string>; all: Set<string> }> {
  const inventoryPath = join(projectDir, 'docs', 'INVENTORY.md');
  const manifestPath = join(projectDir, 'docs', 'INVENTORY-MANIFEST.json');
  const inventory = await readIfPresent(inventoryPath);
  const manifest = await readIfPresent(manifestPath);
  const markdown = inventory ? parseWorkflowIdsFromMarkdown(inventory) : new Set<string>();
  const manifestIds = manifest ? parseWorkflowIdsFromManifest(manifest) : new Set<string>();

  if (!inventory) {
    diagnostics.push(
      mkWarning('COMP-08', 'workflow', 'docs/INVENTORY.md', 'docs/INVENTORY.md', 'docs inventory file missing'),
    );
  }
  if (!manifest) {
    diagnostics.push(
      mkWarning(
        'COMP-08',
        'workflow',
        'docs/INVENTORY-MANIFEST.json',
        'docs/INVENTORY-MANIFEST.json',
        'docs inventory manifest missing',
      ),
    );
  }

  return { markdown, manifest: manifestIds, all: new Set([...markdown, ...manifestIds]) };
}

function emitDocsParityWarnings(
  entries: WorkflowEntry[],
  documentedIds: { markdown: Set<string>; manifest: Set<string>; all: Set<string> },
  diagnostics: CompileDiagnostic[],
): void {
  const liveById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    if (!documentedIds.markdown.has(entry.id) && !documentedIds.manifest.has(entry.id)) {
      diagnostics.push(
        mkWarning('COMP-08', 'workflow', entry.id, entry.path, 'workflow missing from docs inventory', {
          hint: 'update docs/INVENTORY.md or docs/INVENTORY-MANIFEST.json',
        }),
      );
    }
  }

  for (const workflowId of documentedIds.all) {
    if (!liveById.has(workflowId)) {
      diagnostics.push(
        mkWarning(
          'COMP-08',
          'workflow',
          workflowId,
          'docs/INVENTORY.md',
          'docs inventory references missing workflow',
          {
            hint: 'remove stale docs entry or restore workflow file',
          },
        ),
      );
    }
  }
}

export async function collectWorkflows(projectDir: string, diagnostics: CompileDiagnostic[]): Promise<WorkflowEntry[]> {
  const dir = join(projectDir, 'get-shit-done', 'workflows');
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  const entries: WorkflowEntry[] = [];

  for (const file of files) {
    const absPath = join(dir, file);
    const content = await readFile(absPath, 'utf-8');
    const stepCount = countSteps(content);
    const workflowId = `/workflows/${basename(file, '.md')}`;

    // Determine if this file is a thin launcher (SLIM-02).
    const launcherBlock = extractLauncherBlock(content);
    const isLauncher = launcherBlock !== null;
    if (isLauncher) {
      // Validate launcher metadata and emit SLIM-02 diagnostics for invalid launchers.
      // isLauncher remains true even when metadata is invalid — the compiler will report
      // SLIM-02 but still process the workflow entry for other checks.
      const raw = parsePostureYaml(launcherBlock);
      validateLauncherMetadata(raw, absPath, diagnostics);
    }

    entries.push({
      id: workflowId,
      path: toRepoRelative(projectDir, absPath),
      hash: await fileContentHash(absPath),
      stepCount: { value: stepCount, inferred: true },
      runnerType: { value: inferRunnerType(content), inferred: true },
      determinism: { value: inferDeterminism(content, stepCount), inferred: true },
      semanticFeatures: { values: inferSemanticFeatures(content), inferred: true },
      semanticManifest: inferWorkflowSemanticManifest(workflowId, content),
      isTopLevel: true,
      isLauncher,
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const documentedIds = await collectDocumentedWorkflowIds(projectDir, diagnostics);
  emitDocsParityWarnings(entries, documentedIds, diagnostics);
  return entries;
}
