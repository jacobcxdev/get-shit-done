/**
 * Typed compiler orchestrator contract for `gsd-sdk compile`.
 * Plan 07 replaces this shell with the full inventory/baseline implementation.
 */

import { mkError, sortDiagnostics } from './diagnostics.js';
import type { CompileReport } from './types.js';

export async function runCompiler(
  projectDir: string,
  opts: { json: boolean; check: boolean; write: boolean },
): Promise<CompileReport> {
  const diagnostics = [
    mkError(
      'COMP-00',
      'baseline',
      'compile-orchestrator',
      'sdk/src/compile/compiler.ts',
      'compile orchestrator is wired in Plan 07',
      {
        hint:
          `Plan 07 replaces this typed contract with the real orchestrator for ${projectDir}; ` +
          `flags json=${opts.json} check=${opts.check} write=${opts.write}`,
      },
    ),
  ];

  return {
    counts: { commands: 0, workflows: 0, agents: 0, hooks: 0 },
    manifests: {
      commands: [],
      workflows: [],
      agents: [],
      hooks: [],
      classification: [],
      billing: { entrypoints: [], violations: [], clean: true },
    },
    diagnostics: sortDiagnostics(diagnostics),
  };
}
