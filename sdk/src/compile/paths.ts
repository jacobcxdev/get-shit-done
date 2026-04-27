/**
 * Path helpers for gsd-sdk compile.
 * All output paths are repo-relative POSIX strings. Per CONTEXT D-07.
 * Never emit absolute paths, home dirs, or cwd in manifests/baselines.
 */

import { isAbsolute, join, relative, resolve } from 'node:path';

// Import, never re-implement - preserves parity with query path handling.
export { findProjectRoot } from '../query/helpers.js';
export { toPosixPath } from '../query/helpers.js';

import { toPosixPath } from '../query/helpers.js';

/**
 * Canonical corpus directory paths for compile operations.
 * Returns repo-relative POSIX strings suitable for manifest entries.
 * Per CONTEXT D-07: no absolute paths in committed baselines.
 */
export function compileCorpusPaths(projectDir: string) {
  const r = resolve(projectDir);
  const rel = (sub: string) => toPosixPath(relative(r, join(r, sub)));
  return {
    commands: rel('commands/gsd'),
    workflows: rel('get-shit-done/workflows'),
    agents: rel('agents'),
    hooks: rel('hooks'),
    generated: rel('sdk/src/generated/compile'),
  };
}

/**
 * Convert an absolute path to a repo-relative POSIX path.
 * Used by all inventory collectors when building manifest entries.
 * Per CONTEXT D-07: never store absolute paths in generated baselines.
 */
export function toRepoRelative(projectDir: string, absPath: string): string {
  const rel = toPosixPath(relative(resolve(projectDir), resolve(absPath)));
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) {
    throw new Error(`path is outside projectDir: ${absPath}`);
  }
  return rel;
}
