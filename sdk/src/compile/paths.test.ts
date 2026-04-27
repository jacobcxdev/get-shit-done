/**
 * Unit tests for compile path helpers.
 */

import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { compileCorpusPaths, toPosixPath, toRepoRelative } from './paths.js';

describe('compile path helpers', () => {
  it('returns canonical corpus directories as repo-relative POSIX paths', () => {
    expect(compileCorpusPaths('/repo')).toEqual({
      commands: 'commands/gsd',
      workflows: 'get-shit-done/workflows',
      agents: 'agents',
      hooks: 'hooks',
      generated: 'sdk/src/generated/compile',
    });
  });

  it('converts absolute paths to repo-relative POSIX paths', () => {
    const result = toRepoRelative('/repo', '/repo/commands/gsd/foo.md');
    const currentDirectory = process['cwd']();

    expect(result).toBe('commands/gsd/foo.md');
    expect(result.startsWith('/')).toBe(false);
    expect(result).not.toContain('/repo');
    expect(result).not.toContain(currentDirectory);
    expect(result).not.toContain(homedir());
  });

  it('rejects paths outside the project root', () => {
    expect(() => toRepoRelative('/repo', '/tmp/outside.md')).toThrow('outside projectDir');
  });

  it('re-exports POSIX path normalization from query helpers', () => {
    expect(toPosixPath('a\\b\\c')).toBe('a/b/c');
    expect(toPosixPath('a/b/c')).toBe('a/b/c');
  });
});
