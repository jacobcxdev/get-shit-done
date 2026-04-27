/**
 * Agent inventory collector for gsd-sdk compile.
 * Merges frontmatter tools with audited disk-write mandate set and
 * completion marker registry. Per COMP-03, AGNT-01, AGNT-02.
 *
 * IMPORTANT: diskWriteMandate is determined by DISK_WRITE_MANDATE_AGENTS set,
 * NOT by presence of 'Write'/'Edit' in tools frontmatter. These are separate
 * semantic concepts. Per RESEARCH.md anti-pattern warning.
 */

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extractFrontmatter, stripFrontmatter } from '../../query/frontmatter.js';
import { mkWarning } from '../diagnostics.js';
import { fileContentHash } from '../hash.js';
import { toRepoRelative } from '../paths.js';
import type { AgentEntry, CompileDiagnostic } from '../types.js';

export const DISK_WRITE_MANDATE_AGENTS = new Set([
  'gsd-phase-researcher',
  'gsd-planner',
  'gsd-verifier',
  'gsd-executor',
  'gsd-integration-checker',
  'gsd-nyquist-auditor',
  'gsd-ui-auditor',
  'gsd-ui-researcher',
  'gsd-ui-checker',
  'gsd-debugger',
  'gsd-codebase-mapper',
  'gsd-eval-planner',
  'gsd-eval-auditor',
  'gsd-security-auditor',
]);

const CONTRACTS_REL_PATH = 'get-shit-done/references/agent-contracts.md';

const ROLE_CHECKS: Array<[AgentEntry['roleClass'], RegExp]> = [
  ['ui', /\bui[-\s]?(?:researcher|checker|auditor)?\b|user interface/i],
  ['debugger', /\bdebug(?:ger|ging)?\b/i],
  ['mapper', /\bmapper\b|codebase[-\s]?map/i],
  ['auditor', /\baudit(?:or)?\b|security[-\s]?audit/i],
  ['researcher', /\bresearch(?:er)?\b/i],
  ['verifier', /\bverif(?:y|ier|ication)\b|\bchecker\b/i],
  ['executor', /\bexecut(?:e|or|ion)\b/i],
  ['planner', /\bplann(?:er|ing)?\b|\broadmap\b/i],
];

export function parseAgentTools(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
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

function normalizeMarkerCell(cell: string): string | undefined {
  if (/^no marker\b/i.test(cell.trim())) return undefined;
  const markers = [...cell.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (markers.length > 0) return markers.join(', ');
  const cleaned = cell.trim();
  return cleaned ? cleaned : undefined;
}

function parseAgentContracts(content: string): { agentIds: Set<string>; markers: Map<string, string> } {
  const agentIds = new Set<string>();
  const markers = new Map<string, string>();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const [agentCell, , markerCell] = cells;
    if (agentCell === 'Agent' || /^-+$/.test(agentCell)) continue;
    const idMatch = agentCell.match(/\bgsd-[A-Za-z0-9_-]+\b/);
    if (!idMatch) continue;

    const id = idMatch[0];
    agentIds.add(id);
    const marker = normalizeMarkerCell(markerCell);
    if (marker) markers.set(id, marker);
  }

  return { agentIds, markers };
}

async function loadAgentContracts(projectDir: string): Promise<{ agentIds: Set<string>; markers: Map<string, string> }> {
  const content = await readIfPresent(join(projectDir, CONTRACTS_REL_PATH));
  if (!content) return { agentIds: new Set(), markers: new Map() };
  return parseAgentContracts(content);
}

export async function loadCompletionMarkers(projectDir: string): Promise<Map<string, string>> {
  return (await loadAgentContracts(projectDir)).markers;
}

export function inferRoleClass(
  id: string,
  frontmatter: Record<string, unknown>,
  content: string,
): AgentEntry['roleClass'] {
  const text = [id, frontmatter.name, frontmatter.description, content]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
  for (const [roleClass, pattern] of ROLE_CHECKS) {
    if (pattern.test(text)) return roleClass;
  }
  return 'unknown';
}

export function extractOutputArtifacts(
  id: string,
  content: string,
  completionMarkers: Map<string, string>,
): string[] {
  const artifacts = new Set<string>();
  const marker = completionMarkers.get(id);
  if (marker) artifacts.add(marker);

  const artifactPattern = /\b[A-Za-z0-9_.-]+\.(?:md|json|txt|ya?ml|ts|js)\b/g;
  const signalPattern = /\b(?:write|output|produce|create|summary)\b/i;
  for (const match of content.matchAll(artifactPattern)) {
    const start = Math.max(0, (match.index ?? 0) - 120);
    const end = Math.min(content.length, (match.index ?? 0) + match[0].length + 120);
    if (signalPattern.test(content.slice(start, end))) {
      artifacts.add(match[0]);
    }
  }

  return [...artifacts].sort();
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function maybeStringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function warnMissingFrontmatterField(
  id: string,
  relPath: string,
  field: 'name' | 'description',
  diagnostics: CompileDiagnostic[],
): void {
  diagnostics.push(
    mkWarning('COMP-08', 'agent', id, relPath, 'missing required frontmatter field', {
      field,
      hint: `add ${field} to agent frontmatter`,
    }),
  );
}

function emitContractParityWarnings(
  entries: AgentEntry[],
  contractAgentIds: Set<string>,
  diagnostics: CompileDiagnostic[],
): void {
  const liveById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    if (!contractAgentIds.has(entry.id)) {
      diagnostics.push(
        mkWarning('COMP-08', 'agent', entry.id, entry.path, 'agent missing from agent contracts', {
          hint: 'update get-shit-done/references/agent-contracts.md',
        }),
      );
    }
  }

  for (const id of contractAgentIds) {
    if (!liveById.has(id)) {
      diagnostics.push(
        mkWarning(
          'COMP-08',
          'agent',
          id,
          CONTRACTS_REL_PATH,
          'agent contract references missing agent file',
          {
            hint: 'remove stale agent contract or restore agent file',
          },
        ),
      );
    }
  }
}

export async function collectAgents(projectDir: string, diagnostics: CompileDiagnostic[]): Promise<AgentEntry[]> {
  const { agentIds: contractAgentIds, markers } = await loadAgentContracts(projectDir);
  const dir = join(projectDir, 'agents');
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith('gsd-') && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  const entries: AgentEntry[] = [];

  for (const file of files) {
    const absPath = join(dir, file);
    const relPath = toRepoRelative(projectDir, absPath);
    const content = await readFile(absPath, 'utf-8');
    const frontmatter = extractFrontmatter(content);
    const body = stripFrontmatter(content);
    const id = basename(file, '.md');
    const name = stringField(frontmatter.name);
    const description = stringField(frontmatter.description);

    if (!name) warnMissingFrontmatterField(id, relPath, 'name', diagnostics);
    if (!description) warnMissingFrontmatterField(id, relPath, 'description', diagnostics);

    const color = maybeStringField(frontmatter.color);
    entries.push({
      id,
      path: relPath,
      hash: await fileContentHash(absPath),
      name,
      description,
      roleClass: inferRoleClass(id, frontmatter, body),
      allowedTools: parseAgentTools(frontmatter.tools),
      diskWriteMandate: DISK_WRITE_MANDATE_AGENTS.has(id),
      worktreeRequired: /worktree/i.test(body),
      outputArtifacts: extractOutputArtifacts(id, body, markers),
      completionMarker: markers.get(id),
      ...(color ? { color } : {}),
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  emitContractParityWarnings(entries, contractAgentIds, diagnostics);
  return entries;
}
