import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { COMPILE_USAGE, parseCompileArgs, runCompileCommand } from './cli.js';

describe('compile CLI parsing', () => {
  it('parses default compile args', () => {
    expect(parseCompileArgs([])).toEqual({
      projectDir: process.cwd(),
      json: false,
      check: false,
      write: false,
      checkBillingBoundary: true,
      help: false,
    });
  });

  it('parses supported compile flags', () => {
    expect(parseCompileArgs(['--json'])).toMatchObject({ json: true, check: false, write: false });
    expect(parseCompileArgs(['--check'])).toMatchObject({ json: false, check: true, write: false });
    expect(parseCompileArgs(['--write'])).toMatchObject({ json: false, check: false, write: true });
  });

  it('accepts the default-on billing boundary compatibility flag', () => {
    expect(parseCompileArgs(['--check-billing-boundary']).checkBillingBoundary).toBe(true);
  });

  it('parses help flags', () => {
    expect(parseCompileArgs(['-h']).help).toBe(true);
    expect(parseCompileArgs(['--help']).help).toBe(true);
  });

  it('rejects unknown compile flags in strict mode', () => {
    expect(() => parseCompileArgs(['--unknown-flag'])).toThrow();
  });

  it('documents key compile flags in usage text', () => {
    expect(COMPILE_USAGE).toContain('--json');
    expect(COMPILE_USAGE).toContain('--check');
    expect(COMPILE_USAGE).toContain('--write');
  });
});

describe('runCompileCommand parser-only paths', () => {
  const originalExitCode = process.exitCode;
  const projects: string[] = [];

  afterEach(async () => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    await Promise.all(projects.splice(0).map((projectDir) => rm(projectDir, { recursive: true, force: true })));
  });

  it('rejects --ws with a repo-scoped diagnostic before compiler loading', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;

    await runCompileCommand(['--ws', 'foo']);

    expect(process.exitCode).toBe(10);
    const stderr = errorSpy.mock.calls.flat().join('\n');
    expect(stderr).toContain('--ws is not supported');
    expect(stderr).toContain('repo-scoped');
  });

  it('prints compile help without an error exit code', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;

    await runCompileCommand(['--help'], process.cwd());

    expect(process.exitCode ?? 0).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(COMPILE_USAGE);
  });

  it('writes compile-report.json for --json runs outside the committed baseline directory', async () => {
    const projectDir = join(tmpdir(), `gsd-compile-cli-${process.pid}-${Date.now()}-${Math.random()}`);
    projects.push(projectDir);
    await mkdir(join(projectDir, 'commands', 'gsd'), { recursive: true });
    await mkdir(join(projectDir, 'get-shit-done', 'workflows'), { recursive: true });
    await mkdir(join(projectDir, 'agents'), { recursive: true });
    await mkdir(join(projectDir, 'hooks'), { recursive: true });
    await mkdir(join(projectDir, '.planning'), { recursive: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;

    await runCompileCommand(['--json', '--project-dir', projectDir]);

    const reportJson = await readFile(join(projectDir, '.planning', 'compile', 'compile-report.json'), 'utf-8');
    expect(JSON.parse(reportJson).counts).toEqual({ commands: 0, workflows: 0, agents: 0, hooks: 0 });
    expect(logSpy.mock.calls.flat().join('\n')).toContain('"counts"');
  });
});
