import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkWarning } from './diagnostics.js';
import { buildManifestRecord, runCompiler } from './compiler.js';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PacketDefinitionCandidate } from './inventory/packets.js';

async function loadPacketDefinitions(): Promise<PacketDefinitionCandidate[]> {
  const raw = await readFile(new URL('./__fixtures__/phase-02/packet-definitions.json', import.meta.url), 'utf-8');
  return JSON.parse(raw) as PacketDefinitionCandidate[];
}

async function makeProject(): Promise<string> {
  const projectDir = join(tmpdir(), `gsd-compiler-${process.pid}-${Date.now()}-${Math.random()}`);
  await mkdir(join(projectDir, 'commands', 'gsd'), { recursive: true });
  await mkdir(join(projectDir, 'get-shit-done', 'workflows'), { recursive: true });
  await mkdir(join(projectDir, 'agents'), { recursive: true });
  await mkdir(join(projectDir, 'hooks'), { recursive: true });
  await mkdir(join(projectDir, '.planning'), { recursive: true });
  await writeFile(join(projectDir, '.planning', 'config.json'), '{}\n');
  return projectDir;
}

async function writeWorkflow(projectDir: string, id: string): Promise<void> {
  await writeFile(
    join(projectDir, 'get-shit-done', 'workflows', `${id}.md`),
    `# ${id}\n\n## Step 1\nDo work.\n`,
  );
}

async function writeCommand(projectDir: string, id: string, workflowId: string): Promise<void> {
  await writeFile(
    join(projectDir, 'commands', 'gsd', `${id}.md`),
    `---\nname: gsd:${id}\n---\n\n<execution_context>\n@get-shit-done/workflows/${workflowId}.md\n</execution_context>\n`,
  );
}

describe('runCompiler', () => {
  const projects: string[] = [];
  const originalExitCode = process.exitCode;

  afterEach(async () => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    await Promise.all(projects.splice(0).map((projectDir) => rm(projectDir, { recursive: true, force: true })));
  });

  it('returns empty counts and no hard errors for empty corpus directories', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });

    expect(report.counts).toEqual({ commands: 0, workflows: 0, agents: 0, hooks: 0 });
    expect(report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('does not emit COMP-07 for a command referencing a known workflow', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeWorkflow(projectDir, 'demo');
    await writeCommand(projectDir, 'demo', 'demo');

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });

    expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'COMP-07')).toEqual([]);
  });

  it('emits COMP-07 for a command referencing an unknown workflow', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeCommand(projectDir, 'demo', 'missing');

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'COMP-07',
      id: '/gsd-demo',
      severity: 'error',
    }));
  });

  it('sorts diagnostics with errors before warnings', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeCommand(projectDir, 'demo', 'missing');

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });

    const severities = report.diagnostics.map((diagnostic) => diagnostic.severity);
    expect(severities.indexOf('error')).toBeLessThan(severities.lastIndexOf('warning'));
  });

  it('reports counts matching fixture files', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeWorkflow(projectDir, 'demo');
    await writeCommand(projectDir, 'demo', 'demo');
    await writeFile(
      join(projectDir, 'agents', 'gsd-demo.md'),
      '---\nname: gsd-demo\ndescription: Demo agent\ntools: Read\n---\n\n# Demo\n',
    );
    await writeFile(join(projectDir, 'hooks', 'gsd-demo.js'), 'console.log("demo");\n');

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });

    expect(report.counts).toEqual({ commands: 1, workflows: 1, agents: 1, hooks: 1 });
  });

  it('leaves terminal count formatting to the compile CLI', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeWorkflow(projectDir, 'demo');
    await writeCommand(projectDir, 'add-phase', 'demo');
    await writeFile(
      join(projectDir, 'agents', 'gsd-demo.md'),
      '---\nname: gsd-demo\ndescription: Demo agent\ntools: Read\n---\n\n# Demo\n',
    );
    await writeFile(join(projectDir, 'hooks', 'gsd-demo.js'), 'console.log("demo");\n');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runCompiler(projectDir, { json: false, check: false, write: false });

    expect(log).not.toHaveBeenCalled();
  });

  it('validates non-empty packetDefinitions through compiler integration', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeFile(
      join(projectDir, 'agents', 'gsd-demo.md'),
      '---\nname: gsd-demo\ndescription: Demo agent\ntools: Read\n---\n\n# Demo\n',
    );

    const report = await runCompiler(projectDir, {
      json: false,
      check: false,
      write: false,
      packetDefinitions: await loadPacketDefinitions(),
    });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'PCKT-04',
      field: 'actionCount',
      message: expect.stringContaining('workflow-a step step-b'),
    }));
  });

  it('includes workflow-semantics in manifest records', async () => {
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeWorkflow(projectDir, 'demo');

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });
    const manifests = buildManifestRecord(report);

    expect(report.manifests.workflowSemantics).toEqual([
      expect.objectContaining({ workflowId: '/workflows/demo' }),
    ]);
    expect(manifests['workflow-semantics']).toEqual(report.manifests.workflowSemantics);
  });

  it('uses deterministic diagnostic sorting independent of collector order', async () => {
    const warning = mkWarning('ZZZ-99', 'hook', 'z', 'z', 'late warning');
    const projectDir = await makeProject();
    projects.push(projectDir);
    await writeCommand(projectDir, 'demo', 'missing');

    const report = await runCompiler(projectDir, { json: false, check: false, write: false });
    const combined = [...report.diagnostics, warning];

    expect(combined[0]?.severity).toBe('error');
  });
});
