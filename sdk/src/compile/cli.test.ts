import { afterEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
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
});
