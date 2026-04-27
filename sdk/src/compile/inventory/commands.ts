/**
 * Command inventory collector for gsd-sdk compile.
 * Traverses commands/gsd/*.md, extracts frontmatter and workflow refs,
 * and emits diagnostics for unknown refs and parity gaps. Per COMP-01, COMP-07, COMP-08.
 */

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extractFrontmatter } from '../../query/frontmatter.js';
import { mkError, mkWarning } from '../diagnostics.js';
import { fileContentHash } from '../hash.js';
import { toRepoRelative } from '../paths.js';
import type { CommandEntry, CompileDiagnostic, WorkflowRefAssociation } from '../types.js';

type WorkflowAssociationCandidate = {
  workflowId: string;
  rawRef: string;
  source: WorkflowRefAssociation['source'];
  index: number;
  branch?: WorkflowRefAssociation['branch'];
};

const COMMAND_ONLY_IDS = new Set([
  '/gsd-debug',
  '/gsd-graphify',
  '/gsd-from-gsd2',
  '/gsd-intel',
  '/gsd-reapply-patches',
  '/gsd-set-profile',
  '/gsd-thread',
  '/gsd-workstreams',
]);

const WORKFLOW_REF_PATTERN =
  /@?(?:(?:\$HOME|~|\.{1,2}|\/|[A-Za-z]:)[^\s"'`)<]*)?get-shit-done\/workflows\/[A-Za-z0-9_-]+(?:\.md)?/g;

const BROAD_WORKFLOW_REF_PATTERN = /@?[^\s"'`)<]*get-shit-done\/workflows\/[^\s"'`)<]+/g;

const BRANCH_PATTERN =
  /\b(if|else|when|switch|case|mode|default|fallback|unset)\b|workflow\.|DISCUSS_MODE|config-get|--[A-Za-z0-9-]+|any other value/i;

const ROUTING_SIGNAL_PATTERN = /mode|workflow\.|DISCUSS_MODE|config-get|--[A-Za-z0-9-]+|default|fallback|unset|any other value/i;

const DEFAULT_BRANCH_PATTERN = /default|fallback|unset|any other value/i;

function parseAllowedTools(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tools = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    return tools.length > 0 ? tools : undefined;
  }
  if (typeof value === 'string') {
    const tools = value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  return undefined;
}

function normalizeWorkflowRef(rawRef: string): string | null {
  const cleaned = rawRef
    .trim()
    .replace(/^@/, '')
    .replace(/[.;:,]+$/, '');
  const match = cleaned.match(/(?:^|\/)get-shit-done\/workflows\/([A-Za-z0-9_-]+)(?:\.md)?$/);
  return match ? `/workflows/${match[1]}` : null;
}

function findExecutionContext(content: string): { executionContext: string; body: string } {
  const blocks = [...content.matchAll(/<execution_context>([\s\S]*?)<\/execution_context>/g)];
  const executionContext = blocks.map((match) => match[1]).join('\n');
  const body = content.replace(/<execution_context>[\s\S]*?<\/execution_context>/g, '\n');
  return { executionContext, body };
}

function findBranchForRef(content: string, index: number): WorkflowRefAssociation['branch'] | undefined {
  const beforeLines = content.slice(0, index).split(/\r?\n/);
  const currentLine = content.slice(index).split(/\r?\n/)[0] ?? '';
  const candidates = [...beforeLines.slice(-4).reverse(), currentLine];
  const sourceText = candidates.map((line) => line.trim()).find((line) => BRANCH_PATTERN.test(line));
  if (!sourceText) return undefined;
  return {
    condition: sourceText.replace(/:$/, ''),
    sourceText,
  };
}

function scanWorkflowRefs(
  content: string,
  source: WorkflowRefAssociation['source'],
): { refs: WorkflowAssociationCandidate[]; unparseable: string[] } {
  const refs: WorkflowAssociationCandidate[] = [];
  const unparseable: string[] = [];
  const recognized = new Set<string>();

  for (const match of content.matchAll(WORKFLOW_REF_PATTERN)) {
    const rawRef = match[0];
    recognized.add(rawRef);
    const workflowId = normalizeWorkflowRef(rawRef);
    if (!workflowId) {
      unparseable.push(rawRef);
      continue;
    }
    refs.push({
      workflowId,
      rawRef,
      source,
      index: match.index ?? 0,
      branch: findBranchForRef(content, match.index ?? 0),
    });
  }

  for (const match of content.matchAll(BROAD_WORKFLOW_REF_PATTERN)) {
    const rawRef = match[0].replace(/[.;:,]+$/, '');
    if (recognized.has(rawRef)) continue;
    if (!normalizeWorkflowRef(rawRef)) unparseable.push(rawRef);
  }

  return { refs, unparseable };
}

function dedupeByWorkflowId(candidates: WorkflowAssociationCandidate[]): WorkflowAssociationCandidate[] {
  const byWorkflowId = new Map<string, WorkflowAssociationCandidate>();
  for (const candidate of candidates) {
    if (!byWorkflowId.has(candidate.workflowId)) {
      byWorkflowId.set(candidate.workflowId, candidate);
    }
  }
  return [...byWorkflowId.values()];
}

function buildSingleWorkflowAssociations(
  candidates: WorkflowAssociationCandidate[],
): { workflowRef: string | null; workflowRefs: WorkflowRefAssociation[] } {
  const candidate = candidates[0];
  return {
    workflowRef: candidate.workflowId,
    workflowRefs: [
      {
        workflowId: candidate.workflowId,
        rawRef: candidate.rawRef,
        source: candidate.source,
        primary: true,
      },
    ],
  };
}

function buildDynamicWorkflowAssociations(
  id: string,
  candidates: WorkflowAssociationCandidate[],
): { valid: boolean; workflowRef: string | null; workflowRefs: WorkflowRefAssociation[] } {
  const distinct = dedupeByWorkflowId(candidates);
  const allBranched = distinct.every((candidate) => candidate.branch);
  const hasRoutingSignal = distinct.some((candidate) => ROUTING_SIGNAL_PATTERN.test(candidate.branch?.sourceText ?? ''));
  if (!allBranched || !hasRoutingSignal) {
    return {
      valid: false,
      workflowRef: null,
      workflowRefs: distinct.map((candidate) => ({
        workflowId: candidate.workflowId,
        rawRef: candidate.rawRef,
        source: candidate.source,
        primary: false,
      })),
    };
  }

  const commandStem = id.replace(/^\/gsd-/, '');
  const defaultCandidate =
    distinct.find((candidate) => DEFAULT_BRANCH_PATTERN.test(candidate.branch?.sourceText ?? '')) ??
    distinct.find((candidate) => candidate.workflowId === `/workflows/${commandStem}`) ??
    distinct[0];

  return {
    valid: true,
    workflowRef: defaultCandidate.workflowId,
    workflowRefs: distinct.map((candidate) => ({
      workflowId: candidate.workflowId,
      rawRef: candidate.rawRef,
      source: 'mode-routing',
      primary: candidate.workflowId === defaultCandidate.workflowId,
      branch: candidate.branch,
    })),
  };
}

function rawRefsByWorkflowId(candidates: WorkflowAssociationCandidate[]): Map<string, string[]> {
  const byWorkflowId = new Map<string, string[]>();
  for (const candidate of candidates) {
    const rawRefs = byWorkflowId.get(candidate.workflowId) ?? [];
    rawRefs.push(candidate.rawRef);
    byWorkflowId.set(candidate.workflowId, rawRefs);
  }
  return byWorkflowId;
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

function parseCommandIdsFromMarkdown(content: string): Set<string> {
  return new Set(content.match(/\/gsd-[A-Za-z0-9_-]+/g) ?? []);
}

function parseCommandIdsFromManifest(content: string): Set<string> {
  const ids = new Set<string>();
  const manifest = JSON.parse(content) as { families?: { commands?: unknown } };
  if (!Array.isArray(manifest.families?.commands)) return ids;
  for (const commandId of manifest.families.commands) {
    if (typeof commandId === 'string' && commandId.startsWith('/gsd-')) {
      ids.add(commandId);
    }
  }
  return ids;
}

async function collectDocumentedCommandIds(
  projectDir: string,
  diagnostics: CompileDiagnostic[],
): Promise<{ markdown: Set<string>; manifest: Set<string>; all: Set<string> }> {
  const inventoryPath = join(projectDir, 'docs', 'INVENTORY.md');
  const manifestPath = join(projectDir, 'docs', 'INVENTORY-MANIFEST.json');
  const inventory = await readIfPresent(inventoryPath);
  const manifest = await readIfPresent(manifestPath);
  const markdown = inventory ? parseCommandIdsFromMarkdown(inventory) : new Set<string>();
  const manifestIds = manifest ? parseCommandIdsFromManifest(manifest) : new Set<string>();

  if (!inventory) {
    diagnostics.push(
      mkWarning('COMP-08', 'command', 'docs/INVENTORY.md', 'docs/INVENTORY.md', 'docs inventory file missing'),
    );
  }
  if (!manifest) {
    diagnostics.push(
      mkWarning(
        'COMP-08',
        'command',
        'docs/INVENTORY-MANIFEST.json',
        'docs/INVENTORY-MANIFEST.json',
        'docs inventory manifest missing',
      ),
    );
  }

  return { markdown, manifest: manifestIds, all: new Set([...markdown, ...manifestIds]) };
}

function emitDocsParityWarnings(
  entries: CommandEntry[],
  documentedIds: { markdown: Set<string>; manifest: Set<string>; all: Set<string> },
  diagnostics: CompileDiagnostic[],
): void {
  const liveById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    if (!documentedIds.markdown.has(entry.id) && !documentedIds.manifest.has(entry.id)) {
      diagnostics.push(
        mkWarning('COMP-08', 'command', entry.id, entry.path, 'command missing from docs inventory', {
          hint: 'update docs/INVENTORY.md or docs/INVENTORY-MANIFEST.json',
        }),
      );
    }
  }

  for (const commandId of documentedIds.all) {
    if (!liveById.has(commandId)) {
      diagnostics.push(
        mkWarning('COMP-08', 'command', commandId, 'docs/INVENTORY.md', 'docs inventory references missing command', {
          hint: 'remove stale docs entry or restore command file',
        }),
      );
    }
  }
}

function extractWorkflowAssociations(
  id: string,
  relPath: string,
  content: string,
  fm: Record<string, unknown>,
  diagnostics: CompileDiagnostic[],
): { workflowRef: string | null; workflowRefs: WorkflowRefAssociation[]; candidates: WorkflowAssociationCandidate[] } {
  const candidates: WorkflowAssociationCandidate[] = [];
  const unparseableRefs: string[] = [];

  if (typeof fm.workflow === 'string') {
    const workflowId = normalizeWorkflowRef(fm.workflow);
    if (workflowId) {
      candidates.push({ workflowId, rawRef: fm.workflow, source: 'frontmatter', index: 0 });
    } else {
      unparseableRefs.push(fm.workflow);
    }
  }

  if (candidates.length === 0) {
    const { executionContext, body } = findExecutionContext(content);
    const executionContextScan = scanWorkflowRefs(executionContext, 'execution_context');
    candidates.push(...executionContextScan.refs);
    unparseableRefs.push(...executionContextScan.unparseable);

    if (candidates.length === 0) {
      const bodyScan = scanWorkflowRefs(body, 'body');
      candidates.push(...bodyScan.refs);
      unparseableRefs.push(...bodyScan.unparseable);
    }
  }

  for (const rawRef of unparseableRefs) {
    diagnostics.push(
      mkError('COMP-07', 'command', id, relPath, 'unparseable workflow reference', {
        field: 'workflowRef',
        hint: `raw reference: ${rawRef}`,
      }),
    );
  }

  const distinct = dedupeByWorkflowId(candidates);
  if (distinct.length === 0) return { workflowRef: null, workflowRefs: [], candidates };
  if (distinct.length === 1) return { ...buildSingleWorkflowAssociations(distinct), candidates };

  const dynamic = buildDynamicWorkflowAssociations(id, candidates);
  if (!dynamic.valid) {
    diagnostics.push(
      mkError('COMP-07', 'command', id, relPath, 'ambiguous unconditioned workflow references', {
        field: 'workflowRefs',
        hint: `raw references: ${candidates.map((candidate) => candidate.rawRef).join(', ')}`,
      }),
    );
  }
  return { workflowRef: dynamic.workflowRef, workflowRefs: dynamic.workflowRefs, candidates };
}

function validateWorkflowRefs(
  id: string,
  relPath: string,
  workflowRefs: WorkflowRefAssociation[],
  candidates: WorkflowAssociationCandidate[],
  knownWorkflowIds: Set<string> | undefined,
  diagnostics: CompileDiagnostic[],
): void {
  if (!knownWorkflowIds) return;
  const refsByWorkflowId = rawRefsByWorkflowId(candidates);
  for (const workflowId of new Set(workflowRefs.map((ref) => ref.workflowId))) {
    if (knownWorkflowIds.has(workflowId)) continue;
    diagnostics.push(
      mkError('COMP-07', 'command', id, relPath, `unknown workflow reference: ${workflowId}`, {
        field: 'workflowRefs',
        hint: `raw references: ${
          refsByWorkflowId.get(workflowId)?.join(', ') ?? '(none captured)'
        }; check get-shit-done/workflows/ for available workflows`,
      }),
    );
  }
}

export async function collectCommands(
  projectDir: string,
  diagnostics: CompileDiagnostic[],
  knownWorkflowIds?: Set<string>,
): Promise<CommandEntry[]> {
  const dir = join(projectDir, 'commands', 'gsd');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
  const entries: CommandEntry[] = [];

  for (const file of files) {
    const absPath = join(dir, file);
    const content = await readFile(absPath, 'utf-8');
    const fm = extractFrontmatter(content);
    const relPath = toRepoRelative(projectDir, absPath);
    const id = `/gsd-${basename(file, '.md')}`;
    const name = typeof fm.name === 'string' ? fm.name : undefined;
    const agent = typeof fm.agent === 'string' ? fm.agent : undefined;
    const allowedTools = parseAllowedTools(fm['allowed-tools']);
    const workflowAssociations = extractWorkflowAssociations(id, relPath, content, fm, diagnostics);

    validateWorkflowRefs(
      id,
      relPath,
      workflowAssociations.workflowRefs,
      workflowAssociations.candidates,
      knownWorkflowIds,
      diagnostics,
    );

    if (
      workflowAssociations.workflowRef === null &&
      workflowAssociations.workflowRefs.length === 0 &&
      !COMMAND_ONLY_IDS.has(id)
    ) {
      diagnostics.push(
        mkError('COMP-07', 'command', id, relPath, 'missing workflow reference for workflow-backed command', {
          field: 'workflowRefs',
          hint: 'add a supported get-shit-done/workflows/<slug>.md reference or add this command to the command-only list with evidence',
        }),
      );
    }

    entries.push({
      id,
      path: relPath,
      hash: await fileContentHash(absPath),
      ...(name ? { name } : {}),
      ...(agent ? { agent } : {}),
      ...(allowedTools ? { allowedTools } : {}),
      workflowRef: workflowAssociations.workflowRef,
      workflowRefs: workflowAssociations.workflowRefs,
      confidence: name ? 'extracted' : 'unknown',
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const documentedIds = await collectDocumentedCommandIds(projectDir, diagnostics);
  emitDocsParityWarnings(entries, documentedIds, diagnostics);
  return entries;
}
