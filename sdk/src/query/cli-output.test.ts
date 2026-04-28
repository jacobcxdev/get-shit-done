import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli.js';
import { createRegistry } from './index.js';

const UI_SPEC = '03-UI-SPEC';

type CapturedCli = {
  stdout: string;
  stderr: string;
  exitCode: string | number | undefined;
};

async function captureMain(argv: string[]): Promise<CapturedCli> {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  let stdout = '';
  let stderr = '';
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  });
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout += `${args.map(String).join(' ')}\n`;
  });
  const stderrSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr += `${args.map(String).join(' ')}\n`;
  });

  try {
    await main(argv);
    return { stdout, stderr, exitCode: process.exitCode };
  } finally {
    stdoutSpy.mockRestore();
    logSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
  }
}

function queryArgs(projectDir: string, ...args: string[]): string[] {
  return ['query', ...args, '--project-dir', projectDir];
}

async function writePlanningConfig(projectDir: string): Promise<void> {
  await mkdir(join(projectDir, '.planning'), { recursive: true });
  await writeFile(join(projectDir, '.planning', 'config.json'), JSON.stringify({
    workflow: { auto_advance: false },
    codex_model: 'gpt-5.5',
  }), 'utf-8');
}

async function initFlatState(projectDir: string): Promise<void> {
  await createRegistry().dispatch('fsm.state.init', ['run-abc123', 'workflow-1', 'verify', 'flat'], projectDir);
}

describe(`${UI_SPEC} CLI output contract`, () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'gsd-cli-output-'));
    await writePlanningConfig(projectDir);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints scalar FSM read aliases as plain stdout with empty stderr', async () => {
    await initFlatState(projectDir);

    const dotted = await captureMain(queryArgs(projectDir, 'fsm.state', 'flat'));
    const spaced = await captureMain(queryArgs(projectDir, 'fsm', 'state', 'flat'));

    expect(dotted).toMatchObject({ stdout: 'verify\n', stderr: '', exitCode: undefined });
    expect(spaced).toMatchObject({ stdout: 'verify\n', stderr: '', exitCode: undefined });
  });

  it('prints run id and reduced confidence scalars without JSON quoting', async () => {
    await initFlatState(projectDir);
    await createRegistry().dispatch('fsm.transition', [
      'flat',
      'p4-compliance',
      'success',
      JSON.stringify({ providerConfidence: 'reduced', missingProviders: ['gemini'] }),
    ], projectDir);

    await expect(captureMain(queryArgs(projectDir, 'fsm.run-id', 'flat')))
      .resolves.toMatchObject({ stdout: 'run-abc123\n', stderr: '', exitCode: undefined });
    await expect(captureMain(queryArgs(projectDir, 'fsm.confidence', 'flat')))
      .resolves.toMatchObject({ stdout: 'reduced:gemini\n', stderr: '', exitCode: undefined });
  });

  it('prints thread read outputs as scalar id/workstream and session JSON', async () => {
    await initFlatState(projectDir);

    await expect(captureMain(queryArgs(projectDir, 'thread.id', 'flat')))
      .resolves.toMatchObject({ stdout: 'run-abc123\n', stderr: '', exitCode: undefined });
    await expect(captureMain(queryArgs(projectDir, 'thread.workstream', 'flat')))
      .resolves.toMatchObject({ stdout: 'flat\n', stderr: '', exitCode: undefined });

    const session = await captureMain(queryArgs(projectDir, 'thread.session', 'flat'));
    expect(JSON.parse(session.stdout)).toEqual({
      sessionId: 'run-abc123',
      threadId: 'run-abc123',
      workstream: 'flat',
      startedAt: expect.any(String),
    });
    expect(session.stderr).toBe('');
  });

  it('prints fsm.history as a JSON array with confidence defaults', async () => {
    await initFlatState(projectDir);
    await createRegistry().dispatch('fsm.transition', ['flat', 'p4-compliance', 'success'], projectDir);

    const result = await captureMain(queryArgs(projectDir, 'fsm.history', 'flat'));
    const history = JSON.parse(result.stdout) as Array<Record<string, unknown>>;

    expect(Array.isArray(history)).toBe(true);
    expect(history).toEqual([
      expect.objectContaining({
        fromState: 'verify',
        toState: 'p4-compliance',
        reducedConfidence: false,
        missingProviders: [],
      }),
    ]);
    expect(result.stderr).toBe('');
  });

  it('routes successful transition OK text to stderr before stdout JSON', async () => {
    await initFlatState(projectDir);

    const result = await captureMain(queryArgs(projectDir, 'fsm.transition', 'flat', 'p4-compliance', 'success'));

    expect(result.stderr).toBe('[OK] FSMTransition: verify → p4-compliance (outcome: success)\n');
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      fromState: 'verify',
      toState: 'p4-compliance',
      runId: 'run-abc123',
      outcome: 'success',
      reducedConfidence: false,
      missingProviders: [],
    }));
    expect(result.exitCode).toBeUndefined();
  });

  it('routes reduced-confidence WARN text to stderr before transition JSON', async () => {
    await initFlatState(projectDir);

    const result = await captureMain(queryArgs(
      projectDir,
      'fsm.transition',
      'flat',
      'p4-compliance',
      'success',
      JSON.stringify({ providerConfidence: 'reduced', missingProviders: ['gemini'] }),
    ));

    expect(result.stderr).toContain('[WARN] PROVIDER_REDUCED: gemini unavailable — continuing with reduced confidence');
    expect(result.stderr).toContain('  missing: gemini');
    expect(result.stderr).toContain('  confidence: reduced:gemini');
    expect(result.stderr).toContain('[OK] FSMTransition: verify → p4-compliance (outcome: success)');
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      ok: true,
      reducedConfidence: true,
      missingProviders: ['gemini'],
    }));
  });

  it('formats mutation failures as ERROR stderr plus typed stdout JSON without EVENT output', async () => {
    await initFlatState(projectDir);

    const invalid = await captureMain(queryArgs(projectDir, 'fsm.transition', 'flat', '', 'success'));

    expect(invalid.stderr).toContain('[ERROR] INVALID_TRANSITION:');
    expect(invalid.stderr).toContain('Run \'gsd-sdk query fsm.history <workstream>\'');
    expect(invalid.stderr).not.toContain('[EVENT]');
    expect(JSON.parse(invalid.stdout)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'INVALID_TRANSITION',
        message: expect.any(String),
        recoveryHint: expect.any(String),
        fromState: 'verify',
        toState: '',
      }),
    });
    expect(Number(invalid.exitCode)).toBeGreaterThan(0);
  });

  it('formats phase edit, init, lock, and runtime contract error cases as typed envelopes', async () => {
    await initFlatState(projectDir);
    const lockPath = join(projectDir, '.planning', 'workstreams', 'flat', 'fsm-state.json.lock');
    await writeFile(lockPath, 'stale-holder', 'utf-8');
    const staleTime = new Date(Date.now() - 15_000);
    await import('node:fs/promises').then(({ utimes }) => utimes(lockPath, staleTime, staleTime));

    const phaseEdit = await captureMain(queryArgs(projectDir, 'phase.edit', 'flat', 'arbitraryField', 'value'));
    expect(phaseEdit.stderr).toContain('[ERROR] FIELD_NOT_EDITABLE:');
    expect(JSON.parse(phaseEdit.stdout)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'FIELD_NOT_EDITABLE', recoveryHint: expect.any(String) }),
    });

    const missingPlanningDir = await mkdtemp(join(tmpdir(), 'gsd-cli-output-missing-'));
    try {
      const initRequired = await captureMain(queryArgs(missingPlanningDir, 'fsm.state', 'flat'));
      expect(initRequired.stderr).toContain('[ERROR] INIT_REQUIRED:');
      expect(JSON.parse(initRequired.stdout)).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'INIT_REQUIRED', missingPath: '.planning/' }),
      });
    } finally {
      await rm(missingPlanningDir, { recursive: true, force: true });
    }

    const lockStale = await captureMain(queryArgs(projectDir, 'fsm.transition', 'flat', 'p4-compliance', 'success'));
    expect(lockStale.stderr).toContain('[ERROR] LOCK_STALE:');
    expect(JSON.parse(lockStale.stdout)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'LOCK_STALE', holder: 'stale-holder' }),
    });

    const { formatQueryOutput } = await import('./output.js');
    for (const code of ['WORKTREE_REQUIRED', 'COMPLETION_MARKER_MISSING', 'COMPLETION_MARKER_ABSENT']) {
      const formatted = formatQueryOutput({
        command: 'runtime.event',
        args: [],
        error: {
          code,
          message: `${code} fixture`,
          recoveryHint: `${code} recovery`,
          workflowId: 'workflow-1',
          stepId: 'step-1',
          markerId: code === 'COMPLETION_MARKER_ABSENT' ? '## PLAN COMPLETE' : undefined,
          agentId: code === 'WORKTREE_REQUIRED' ? 'gsd-executor' : undefined,
        },
      });
      expect(formatted.stderr).toContain(`[ERROR] ${code}: ${code} fixture`);
      expect(JSON.parse(formatted.stdout)).toEqual({
        ok: false,
        error: expect.objectContaining({ code, recoveryHint: `${code} recovery` }),
      });
      expect(formatted.stderr).not.toContain('[EVENT]');
    }
  });

  it('documents that [EVENT] is intentionally absent from terminal output', async () => {
    const source = await readFile(new URL('./cli-output.test.ts', import.meta.url), 'utf-8');
    expect(source).toContain('[EVENT]');
  });
});
