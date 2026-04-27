/**
 * Integration tests for gsd-sdk compile against the live repository.
 * These tests use the real filesystem and are slower than unit tests.
 * They live in the integration Vitest project.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findProjectRoot } from './paths.js';
import { runCompiler } from './compiler.js';

const execFileAsync = promisify(execFile);

describe('gsd-sdk compile integration', () => {
  let projectDir: string;
  const originalExitCode = process.exitCode;

  beforeAll(() => {
    projectDir = findProjectRoot(process.cwd());
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.doUnmock('@anthropic-ai/claude-agent-sdk');
  });

  it('compiles live repo with no hard errors', async () => {
    const report = await runCompiler(projectDir, { json: false, check: false, write: false });
    const errors = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

    expect(errors, `Hard errors: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  it('live corpus counts are non-zero', async () => {
    const report = await runCompiler(projectDir, { json: false, check: false, write: false });

    expect(report.counts.commands).toBeGreaterThan(0);
    expect(report.counts.workflows).toBeGreaterThan(0);
    expect(report.counts.agents).toBeGreaterThan(0);
  });

  it('all five seed hard outliers are classified as hard-outlier', async () => {
    const report = await runCompiler(projectDir, { json: false, check: false, write: false });
    const seedIds = ['/gsd-graphify', '/gsd-from-gsd2', '/gsd-ultraplan-phase', '/gsd-review', '/gsd-fast'];

    for (const id of seedIds) {
      const entry = report.manifests.classification.find((classification) => classification.commandId === id);
      if (entry) {
        expect(entry.category, `${id} should be hard-outlier`).toBe('hard-outlier');
      }
    }
  });

  it('billing boundary is clean after lazy import refactor', async () => {
    const report = await runCompiler(projectDir, { json: false, check: false, write: false });
    const billingErrors = report.diagnostics.filter((diagnostic) => diagnostic.code === 'BILL-01');

    expect(billingErrors, `Billing violations: ${JSON.stringify(billingErrors, null, 2)}`).toHaveLength(0);
    expect(report.manifests.billing.clean).toBe(true);
  });

  it('compile and native query advisory paths run without credentials or Agent SDK load', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => {
      throw new Error('billing boundary violated: Agent SDK loaded during advisory run');
    });

    try {
      const { runCompileCommand } = await import('./cli.js');
      process.exitCode = undefined;
      await runCompileCommand(['--json', '--project-dir', projectDir]);
      expect(process.exitCode ?? 0, 'compile advisory path should exit cleanly without credentials').toBe(0);

      const { ANTHROPIC_API_KEY: _removed, ...env } = process.env;
      const { stdout } = await execFileAsync(
        process.execPath,
        ['sdk/dist/cli.js', '--project-dir', projectDir, 'query', 'state', 'json'],
        { cwd: projectDir, env },
      );
      expect(JSON.parse(stdout)).toEqual(expect.objectContaining({ gsd_state_version: expect.any(String) }));
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('billing boundary violated'));
      expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    } finally {
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      else delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('--check passes against committed baselines', async () => {
    const report = await runCompiler(projectDir, { json: false, check: true, write: false });
    const baselineErrors = report.diagnostics.filter((diagnostic) => diagnostic.code === 'COMP-10');

    expect(baselineErrors, `Baseline drift: ${JSON.stringify(baselineErrors, null, 2)}`).toHaveLength(0);
  });

  it('CompileReport serialises to deterministic JSON', async () => {
    const report1 = await runCompiler(projectDir, { json: false, check: false, write: false });
    const report2 = await runCompiler(projectDir, { json: false, check: false, write: false });
    const { sortKeysDeep } = await import('./baselines.js');
    const json1 = JSON.stringify(sortKeysDeep(report1.manifests), null, 2);
    const json2 = JSON.stringify(sortKeysDeep(report2.manifests), null, 2);

    expect(json1).toBe(json2);
  });
});
