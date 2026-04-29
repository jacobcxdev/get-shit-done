/**
 * CLI parser and command runner for `gsd-sdk compile`.
 */

import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ParsedCompileArgs {
  projectDir: string;
  json: boolean;
  check: boolean;
  write: boolean;
  checkBillingBoundary: boolean;
  checkSlimEligibility?: string;
  help: boolean;
}

export const COMPILE_USAGE = `
gsd-sdk compile [options]

Compile and audit the full GSD corpus. Produces machine-readable manifests,
billing-boundary checks, and per-command classifications.

Options:
  --json            Emit machine-readable CompileReport to stdout
  --check           Compare current output against committed baselines (CI mode)
  --write           Regenerate committed baselines under sdk/src/generated/compile/
  --check-billing-boundary
                    Compatibility alias; billing-boundary checks always run
  --check-slim-eligibility <workflow-id>
                    Evaluate slim eligibility for the given workflow ID; emits
                    structured JSON verdict and exits non-zero for fail/indeterminate
  --project-dir     Project directory (default: cwd)
  -h, --help        Show this help

Note: --ws is not supported. gsd-sdk compile is repo-scoped only.
`.trim();

export function parseCompileArgs(argv: string[]): ParsedCompileArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      'project-dir': { type: 'string', default: process.cwd() },
      json: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      write: { type: 'boolean', default: false },
      'check-billing-boundary': { type: 'boolean', default: true },
      'check-slim-eligibility': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  return {
    projectDir: values['project-dir'] as string,
    json: values.json as boolean,
    check: values.check as boolean,
    write: values.write as boolean,
    checkBillingBoundary: values['check-billing-boundary'] as boolean,
    checkSlimEligibility: values['check-slim-eligibility'] as string | undefined,
    help: values.help as boolean,
  };
}

export async function runCompileCommand(argv: string[], projectDir?: string): Promise<void> {
  if (argv.includes('--ws')) {
    const { mkError } = await import('./diagnostics.js');
    const d = mkError(
      'COMP-00',
      'command',
      'compile',
      'sdk/src/cli.ts',
      'compile is repo-scoped; --ws is not supported',
      { hint: 'remove --ws flag; gsd-sdk compile always operates on the full repo corpus' },
    );
    console.error(`[${d.severity.toUpperCase()}] ${d.code}: ${d.message}`);
    if (d.hint) console.error(`  hint: ${d.hint}`);
    process.exitCode = 10;
    return;
  }

  let args: ParsedCompileArgs;
  try {
    args = parseCompileArgs(argv);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(COMPILE_USAGE);
    process.exitCode = 10;
    return;
  }

  if (args.help) {
    console.log(COMPILE_USAGE);
    return;
  }

  const { findProjectRoot } = await import('./paths.js');
  const resolvedProjectDir = findProjectRoot(projectDir ?? args.projectDir);
  const { runCompiler } = await import('./compiler.js');
  const report = await runCompiler(resolvedProjectDir, args);
  const errorCount = report.diagnostics.filter(d => d.severity === 'error').length;
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const shouldWriteReportFile = args.json || args.check || args.write || errorCount > 0;

  if (shouldWriteReportFile) {
    const reportsDir = join(resolvedProjectDir, '.planning', 'compile');
    await mkdir(reportsDir, { recursive: true });
    await writeFile(join(reportsDir, 'compile-report.json'), reportJson, 'utf-8');
  }

  // --check-slim-eligibility dispatch: runs after full CompileReport is built so
  // eligibility evaluation has access to all manifests. slim-eligibility.ts must
  // not import session-runner.ts or any model-backed module (billing boundary).
  if (args.checkSlimEligibility) {
    const { evaluateSlimEligibility } = await import('./slim-eligibility.js');
    const verdict = evaluateSlimEligibility(args.checkSlimEligibility, report);
    console.log(JSON.stringify(verdict, null, 2));
    if (verdict.status !== 'pass') {
      process.exitCode = 1;
    }
    return;
  }

  if (errorCount > 0) {
    process.exitCode = 1;
  }

  if (args.json) {
    console.log(reportJson);
    return;
  }

  const { commands, workflows, agents, hooks } = report.counts;
  const outliers = report.manifests.classification.filter((entry) => entry.isHardOutlier).length;
  console.log([
    'Compile complete.',
    `  commands:  ${commands}`,
    `  workflows: ${workflows}`,
    `  agents:    ${agents}`,
    `  hooks:     ${hooks}`,
    `  outliers:  ${outliers}`,
  ].join('\n'));
}
