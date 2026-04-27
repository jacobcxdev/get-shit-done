import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEntry, CompileDiagnostic } from '../types.js';
import {
  collectAgents,
  DISK_WRITE_MANDATE_AGENTS,
  extractOutputArtifacts,
  inferRoleClass,
  parseAgentTools,
} from './agents.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-agent-inventory-'));
  await mkdir(join(projectDir, 'agents'), { recursive: true });
  await mkdir(join(projectDir, 'get-shit-done', 'references'), { recursive: true });
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeAgent(id: string, content: string): Promise<void> {
  await writeFile(join(projectDir, 'agents', `${id}.md`), content);
}

async function writeAgentContracts(rows: string[]): Promise<void> {
  await writeFile(
    join(projectDir, 'get-shit-done', 'references', 'agent-contracts.md'),
    [
      '# Agent Contracts',
      '',
      '| Agent | Role | Completion Markers |',
      '|-------|------|--------------------|',
      ...rows,
      '',
    ].join('\n'),
  );
}

function agentFrontmatter(id: string, overrides: { name?: string; description?: string; tools?: string; color?: string } = {}) {
  return [
    '---',
    overrides.name === undefined ? `name: ${id}` : overrides.name === '' ? '' : `name: ${overrides.name}`,
    `description: ${overrides.description ?? `${id} test agent`}`,
    `tools: ${overrides.tools ?? 'Read Write'}`,
    `color: ${overrides.color ?? 'green'}`,
    '---',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function comp08(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  return diagnostics.filter((d) => d.code === 'COMP-08');
}

function byId(entries: AgentEntry[], id: string): AgentEntry {
  const entry = entries.find((agent) => agent.id === id);
  if (!entry) throw new Error(`missing agent ${id}`);
  return entry;
}

describe('DISK_WRITE_MANDATE_AGENTS', () => {
  it('contains exactly the 14 audited mandate agents', () => {
    expect([...DISK_WRITE_MANDATE_AGENTS].sort()).toEqual([
      'gsd-codebase-mapper',
      'gsd-debugger',
      'gsd-eval-auditor',
      'gsd-eval-planner',
      'gsd-executor',
      'gsd-integration-checker',
      'gsd-nyquist-auditor',
      'gsd-phase-researcher',
      'gsd-planner',
      'gsd-security-auditor',
      'gsd-ui-auditor',
      'gsd-ui-checker',
      'gsd-ui-researcher',
      'gsd-verifier',
    ]);
  });
});

describe('parseAgentTools', () => {
  it('returns string values from YAML array input', () => {
    expect(parseAgentTools(['Read', 'Write', 42, ''])).toEqual(['Read', 'Write', '42']);
  });

  it('splits space-separated frontmatter strings', () => {
    expect(parseAgentTools('Read Write Bash')).toEqual(['Read', 'Write', 'Bash']);
  });

  it('returns an empty array for undefined input', () => {
    expect(parseAgentTools(undefined)).toEqual([]);
  });
});

describe('inferRoleClass', () => {
  it.each([
    ['gsd-planner', 'Creates plans', 'planner'],
    ['gsd-executor', 'Executes plans', 'executor'],
    ['gsd-verifier', 'Verifies work', 'verifier'],
    ['gsd-phase-researcher', 'Researches a phase', 'researcher'],
    ['gsd-security-auditor', 'Audits security', 'auditor'],
    ['gsd-codebase-mapper', 'Maps codebase structure', 'mapper'],
    ['gsd-debugger', 'Debugs failures', 'debugger'],
    ['gsd-ui-checker', 'Checks UI work', 'ui'],
    ['gsd-utility', 'Utility agent', 'unknown'],
  ] as const)('infers %s as %s', (id, description, roleClass) => {
    expect(inferRoleClass(id, { name: id, description }, '')).toBe(roleClass);
  });
});

describe('extractOutputArtifacts', () => {
  it('includes contract markers and nearby body artifact filenames', () => {
    const markers = new Map([['gsd-planner', '## PLANNING COMPLETE']]);

    expect(
      extractOutputArtifacts(
        'gsd-planner',
        'The agent must write PLAN.md and produce metadata.json before returning.',
        markers,
      ),
    ).toEqual(['## PLANNING COMPLETE', 'PLAN.md', 'metadata.json']);
  });

  it('returns an empty array when no markers or body artifacts are present', () => {
    expect(extractOutputArtifacts('gsd-utility', 'No output contract here.', new Map())).toEqual([]);
  });
});

describe('collectAgents', () => {
  it('marks diskWriteMandate from the audited set, independent of allowed tools', async () => {
    await writeAgentContracts([
      '| gsd-planner | Plan creation | `## PLANNING COMPLETE` |',
      '| gsd-write-tool | Utility | `## WRITE TOOL COMPLETE` |',
    ]);
    await writeAgent('gsd-planner', `${agentFrontmatter('gsd-planner', { tools: 'Read Bash' })}Body without write tools.\n`);
    await writeAgent(
      'gsd-write-tool',
      `${agentFrontmatter('gsd-write-tool', { tools: 'Read Write Edit' })}Body with write tools.\n`,
    );

    const entries = await collectAgents(projectDir, []);

    expect(byId(entries, 'gsd-planner')).toMatchObject({
      allowedTools: ['Read', 'Bash'],
      diskWriteMandate: true,
    });
    expect(byId(entries, 'gsd-write-tool')).toMatchObject({
      allowedTools: ['Read', 'Write', 'Edit'],
      diskWriteMandate: false,
    });
  });

  it('merges completion markers and body output artifacts', async () => {
    await writeAgentContracts(['| gsd-planner | Plan creation | `## PLANNING COMPLETE` |']);
    await writeAgent('gsd-planner', `${agentFrontmatter('gsd-planner')}Create PLAN.md and output SUMMARY.md.\n`);

    const [entry] = await collectAgents(projectDir, []);

    expect(entry.completionMarker).toBe('## PLANNING COMPLETE');
    expect(entry.outputArtifacts).toEqual(['## PLANNING COMPLETE', 'PLAN.md', 'SUMMARY.md']);
  });

  it('sets worktreeRequired from case-insensitive body text', async () => {
    await writeAgentContracts([
      '| gsd-with-worktree | Fixture | `## DONE` |',
      '| gsd-without-worktree | Fixture | `## DONE` |',
    ]);
    await writeAgent('gsd-with-worktree', `${agentFrontmatter('gsd-with-worktree')}Uses a Worktree for isolation.\n`);
    await writeAgent('gsd-without-worktree', `${agentFrontmatter('gsd-without-worktree')}No isolation requirement.\n`);

    const entries = await collectAgents(projectDir, []);

    expect(byId(entries, 'gsd-with-worktree').worktreeRequired).toBe(true);
    expect(byId(entries, 'gsd-without-worktree').worktreeRequired).toBe(false);
  });

  it('emits COMP-08 when required frontmatter is missing', async () => {
    await writeAgentContracts(['| gsd-missing-name | Fixture | `## DONE` |']);
    await writeAgent(
      'gsd-missing-name',
      `${agentFrontmatter('gsd-missing-name', { name: '' })}Agent body.\n`,
    );
    const diagnostics: CompileDiagnostic[] = [];

    await collectAgents(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        id: 'gsd-missing-name',
        field: 'name',
        message: expect.stringContaining('missing required frontmatter field'),
      }),
    );
  });

  it('emits COMP-08 when a live agent is missing from agent-contracts.md', async () => {
    await writeAgentContracts([]);
    await writeAgent('gsd-uncontracted', `${agentFrontmatter('gsd-uncontracted')}Agent body.\n`);
    const diagnostics: CompileDiagnostic[] = [];

    await collectAgents(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        id: 'gsd-uncontracted',
        path: 'agents/gsd-uncontracted.md',
        message: expect.stringContaining('agent missing from agent contracts'),
      }),
    );
  });

  it('emits COMP-08 when agent-contracts.md references a missing agent id', async () => {
    await writeAgentContracts(['| gsd-stale | Stale contract | `## STALE` |']);
    await writeAgent('gsd-live', `${agentFrontmatter('gsd-live')}Agent body.\n`);
    const diagnostics: CompileDiagnostic[] = [];

    await collectAgents(projectDir, diagnostics);

    expect(comp08(diagnostics)).toContainEqual(
      expect.objectContaining({
        id: 'gsd-stale',
        path: 'get-shit-done/references/agent-contracts.md',
        message: expect.stringContaining('references missing agent file'),
      }),
    );
  });

  it('returns sorted entries with POSIX repo-relative paths', async () => {
    await writeAgentContracts([
      '| gsd-a | Fixture | `## A` |',
      '| gsd-b | Fixture | `## B` |',
    ]);
    await writeAgent('gsd-b', `${agentFrontmatter('gsd-b')}Agent body.\n`);
    await writeAgent('gsd-a', `${agentFrontmatter('gsd-a')}Agent body.\n`);

    const entries = await collectAgents(projectDir, []);

    expect(entries.map((entry) => entry.id)).toEqual(['gsd-a', 'gsd-b']);
    expect(entries.map((entry) => entry.path)).toEqual(['agents/gsd-a.md', 'agents/gsd-b.md']);
    for (const entry of entries) {
      expect(isAbsolute(entry.path)).toBe(false);
      expect(entry.path).not.toContain('\\');
      expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
