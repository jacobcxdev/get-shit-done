#!/usr/bin/env node
/**
 * CLI entry point for gsd-sdk.
 *
 * Usage: gsd-sdk run "<prompt>" [--project-dir <dir>] [--ws-port <port>]
 *                                [--model <model>] [--max-budget <n>]
 */

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWorkstreamName } from './workstream-utils.js';
import { createGeneratedWorkflowRunner } from './advisory/workflow-runner.js';

// ─── Parsed CLI args ─────────────────────────────────────────────────────────

export interface ParsedCliArgs {
  command: string | undefined;
  prompt: string | undefined;
  /** For 'init' command: the raw input source (@file, text, or undefined for stdin). */
  initInput: string | undefined;
  /** For 'auto --init': bootstrap from a PRD before running the autonomous loop. */
  init: string | undefined;
  projectDir: string;
  wsPort: number | undefined;
  model: string | undefined;
  maxBudget: number | undefined;
  /** Workstream name for multi-workstream projects. Routes .planning/ to .planning/workstreams/<name>/. */
  ws: string | undefined;
  help: boolean;
  version: boolean;
  /**
   * When `command === 'query'`, tokens after `query` with only known SDK flags removed.
   * Extra flags are kept so handlers that share gsd-tools-style argv (e.g. `--pick`) still receive them.
   */
  queryArgv?: string[];
  /** When `command === 'compile'`, compile-specific argv after top-level project-dir extraction. */
  compileArgv?: string[];
}

/**
 * Parse `gsd-sdk query …` without rejecting unknown flags (query argv is forwarded to the registry).
 */
function parseCliArgsQueryPermissive(argv: string[]): ParsedCliArgs {
  let projectDir = process.cwd();
  let ws: string | undefined;
  let wsPort: number | undefined;
  let model: string | undefined;
  let maxBudget: number | undefined;
  let help = false;
  let version = false;
  const queryArgv: string[] = [];

  let i = 1;
  while (i < argv.length) {
    const a = argv[i];
    if (a === undefined) break;
    if (a === '--project-dir' && argv[i + 1]) {
      projectDir = argv[i + 1];
      i += 2;
      continue;
    }
    if (a === '--ws' && argv[i + 1]) {
      ws = argv[i + 1];
      i += 2;
      continue;
    }
    if (a === '--ws-port' && argv[i + 1]) {
      wsPort = Number(argv[i + 1]);
      i += 2;
      continue;
    }
    if (a === '--model' && argv[i + 1]) {
      model = argv[i + 1];
      i += 2;
      continue;
    }
    if (a === '--max-budget' && argv[i + 1]) {
      maxBudget = Number(argv[i + 1]);
      i += 2;
      continue;
    }
    if (a === '-h' || a === '--help') {
      help = true;
      i += 1;
      continue;
    }
    if (a === '-v' || a === '--version') {
      version = true;
      i += 1;
      continue;
    }
    queryArgv.push(a);
    i += 1;
  }

  return {
    command: 'query',
    prompt: undefined,
    initInput: undefined,
    init: undefined,
    projectDir,
    wsPort,
    model,
    maxBudget,
    ws,
    help,
    version,
    queryArgv,
  };
}

/**
 * Parse `gsd-sdk compile …` without rejecting compile-specific flags.
 */
function parseCliArgsCompilePermissive(argv: string[]): ParsedCliArgs {
  let projectDir = process.cwd();
  let version = false;
  const compileArgv: string[] = [];

  let i = 1;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--project-dir' && argv[i + 1]) {
      projectDir = argv[i + 1];
      i += 2;
      continue;
    }
    if (a.startsWith('--project-dir=')) {
      projectDir = a.slice('--project-dir='.length);
      i += 1;
      continue;
    }
    if (a === '-v' || a === '--version') {
      version = true;
      i += 1;
      continue;
    }
    compileArgv.push(a);
    i += 1;
  }

  return {
    command: 'compile',
    prompt: undefined,
    initInput: undefined,
    init: undefined,
    projectDir,
    wsPort: undefined,
    model: undefined,
    maxBudget: undefined,
    ws: undefined,
    help: false,
    version,
    compileArgv,
  };
}

function leadingTokensAreGlobalOptions(tokens: string[]): boolean {
  const valueOptions = new Set(['--project-dir', '--ws', '--ws-port', '--model', '--max-budget']);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i += 1;
      continue;
    }
    if (token === '-h' || token === '--help' || token === '-v' || token === '--version') {
      i += 1;
      continue;
    }
    if ([...valueOptions].some((option) => token.startsWith(`${option}=`))) {
      i += 1;
      continue;
    }
    if (valueOptions.has(token) && tokens[i + 1]) {
      i += 2;
      continue;
    }
    return false;
  }
  return true;
}

function parsePermissiveCommandAfterGlobalOptions(
  argv: string[],
  command: 'query' | 'compile',
): ParsedCliArgs | null {
  const commandIndex = argv.indexOf(command);
  if (commandIndex <= 0) return null;
  const before = argv.slice(0, commandIndex);
  if (!leadingTokensAreGlobalOptions(before)) return null;
  const normalizedArgv = [command, ...argv.slice(commandIndex + 1), ...before];
  return command === 'query'
    ? parseCliArgsQueryPermissive(normalizedArgv)
    : parseCliArgsCompilePermissive(normalizedArgv);
}

/**
 * Parse CLI arguments into a structured object.
 * Exported for testing — the main() function uses this internally.
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  if (argv[0] === 'query') {
    return parseCliArgsQueryPermissive(argv);
  }
  if (argv[0] === 'compile') {
    return parseCliArgsCompilePermissive(argv);
  }
  const queryAfterGlobalOptions = parsePermissiveCommandAfterGlobalOptions(argv, 'query');
  if (queryAfterGlobalOptions) return queryAfterGlobalOptions;
  const compileAfterGlobalOptions = parsePermissiveCommandAfterGlobalOptions(argv, 'compile');
  if (compileAfterGlobalOptions) return compileAfterGlobalOptions;

  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'project-dir': { type: 'string', default: process.cwd() },
      'ws-port': { type: 'string' },
      ws: { type: 'string' },
      model: { type: 'string' },
      'max-budget': { type: 'string' },
      init: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  const command = positionals[0] as string | undefined;
  const prompt = positionals.slice(1).join(' ') || undefined;

  // For 'init' command, the positional after 'init' is the input source.
  // For 'run' command, it's the prompt. Both use positionals[1+].
  const initInput = command === 'init' ? prompt : undefined;

  return {
    command,
    prompt,
    initInput,
    init: values.init as string | undefined,
    projectDir: values['project-dir'] as string,
    wsPort: values['ws-port'] ? Number(values['ws-port']) : undefined,
    model: values.model as string | undefined,
    maxBudget: values['max-budget'] ? Number(values['max-budget']) : undefined,
    ws: values.ws as string | undefined,
    help: values.help as boolean,
    version: values.version as boolean,
  };
}

// ─── Usage ───────────────────────────────────────────────────────────────────

export const USAGE = `
Usage: gsd-sdk <command> [args] [options]

Commands:
  run <prompt>          Run a full milestone from a text prompt
  auto                  Run the full autonomous lifecycle (discover -> execute -> advance)
  init [input]          Bootstrap a new project from a PRD or description
                        input can be:
                          @path/to/prd.md   Read input from a file
                          "description"     Use text directly
                          (empty)           Read from stdin
  query <argv...>       Registered query handlers only (longest-prefix argv match; see QUERY-HANDLERS.md)
                        Use --pick <field> to extract a specific field from JSON output
  compile               Compile and audit the full GSD corpus
                        --json  machine-readable CompileReport
                        --check verify committed baselines (CI)
                        --write regenerate committed baselines
                        --check-billing-boundary accepted; billing checks always run

Options:
  --init <input>        Bootstrap from a PRD before running (auto only)
                        Accepts @path/to/prd.md or "description text"
  --project-dir <dir>   Project directory (default: cwd)
  --ws <name>           Route .planning/ to .planning/workstreams/<name>/
  --ws-port <port>      Enable WebSocket transport on <port>
  --model <model>       Override LLM model
  --max-budget <n>      Max budget per step in USD
  -h, --help            Show this help
  -v, --version         Show version
`.trim();

// USAGE includes the top-level compile entry for the billing-safe compiler path.

/**
 * Read the package version from package.json.
 */
async function getVersion(): Promise<string> {
  try {
    const pkgPath = resolve(fileURLToPath(import.meta.url), '..', '..', 'package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─── Init input resolution ───────────────────────────────────────────────────

/**
 * Resolve the init command input to a string.
 *
 * - `@path/to/file.md` → reads the file contents
 * - Raw text → returns as-is
 * - No input → reads from stdin (with TTY detection)
 *
 * Exported for testing.
 */
export async function resolveInitInput(args: ParsedCliArgs): Promise<string> {
  const input = args.initInput;

  if (input && input.startsWith('@')) {
    // File path: strip @ prefix, resolve relative to projectDir
    const filePath = resolve(args.projectDir, input.slice(1));
    try {
      return await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Cannot read input file "${filePath}": ${(err as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (err as Error).message}`);
    }
  }

  if (input) {
    // Raw text
    return input;
  }

  // No input — read from stdin
  return readStdin();
}

/**
 * Read all data from stdin. Rejects if stdin is a TTY with no piped data.
 */
async function readStdin(): Promise<string> {
  const { stdin } = process;

  if (stdin.isTTY) {
    throw new Error(
      'No input provided. Usage:\n' +
      '  gsd-sdk init @path/to/prd.md\n' +
      '  gsd-sdk init "build a todo app"\n' +
      '  cat prd.md | gsd-sdk init'
    );
  }

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stdin.on('error', reject);
  });
}

function printProviderMetadataSummary(steps: Array<{ providerMetadata?: unknown }>): void {
  const count = steps.filter(step => step.providerMetadata !== undefined).length;
  if (count > 0) {
    console.log(`Provider metadata: ${count} step(s) carried confidence metadata`);
  }
}

function writeFormattedQueryOutput(output: { stdout: string; stderr: string; exitCode: number }): void {
  if (output.stderr.trim().length > 0) {
    console.error(output.stderr.trimEnd());
  }
  if (output.stdout.length > 0) {
    process.stdout.write(output.stdout);
  }
  if (output.exitCode !== 0) {
    process.exitCode = output.exitCode;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let args: ParsedCliArgs;

  try {
    args = parseCliArgs(argv);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (args.version) {
    const ver = await getVersion();
    console.log(`gsd-sdk v${ver}`);
    return;
  }

  // Validate --ws flag if provided
  if (args.ws !== undefined && !validateWorkstreamName(args.ws)) {
    console.error(`Error: Invalid workstream name "${args.ws}". Use alphanumeric, hyphens, underscores, or dots only.`);
    process.exitCode = 1;
    return;
  }

  // Multi-repo project-root resolution (issue #2623).
  //
  // When the user launches `gsd-sdk` from inside a `sub_repos`-listed child repo,
  // `projectDir` defaults to `process.cwd()` which points at the child, not the
  // parent workspace that owns `.planning/`. Mirror the legacy `gsd-tools.cjs`
  // walk-up semantics so handlers see the correct project root.
  //
  // Idempotent: if `projectDir` already has its own `.planning/` (including an
  // explicit `--project-dir` pointing at the workspace root), findProjectRoot
  // returns it unchanged.
  {
    const { findProjectRoot } = await import('./query/helpers.js');
    args = { ...args, projectDir: findProjectRoot(args.projectDir) };
  }

  // ─── Query command ──────────────────────────────────────────────────────
  if (args.command === 'query') {
    const { createRegistry } = await import('./query/index.js');
    const { extractField, resolveQueryArgv } = await import('./query/registry.js');
    const { GSDError, exitCodeFor, ErrorClassification } = await import('./errors.js');
    const {
      formatQueryOutput,
      isStructuredUiContractedQueryCommand,
      isUiContractedQueryCommand,
    } = await import('./query/output.js');

    const queryArgs = args.queryArgv ?? [];
    let activeCommand = queryArgs[0] ?? '';
    let activeArgs = queryArgs.slice(1);

    // Extract --pick before dispatch
    const pickIdx = queryArgs.indexOf('--pick');
    let pickField: string | undefined;
    if (pickIdx !== -1) {
      if (pickIdx + 1 >= queryArgs.length) {
        console.error('Error: --pick requires a field name');
        process.exitCode = 10;
        return;
      }
      pickField = queryArgs[pickIdx + 1];
      queryArgs.splice(pickIdx, 2);
    }

    if (queryArgs.length === 0 || !queryArgs[0]) {
      console.error('Error: "gsd-sdk query" requires a command');
      process.exitCode = 10;
      return;
    }

    try {
      const queryCommand = queryArgs[0];
      const { normalizeQueryCommand } = await import('./query/normalize-query-command.js');
      const [normCmd, normArgs] = normalizeQueryCommand(queryCommand, queryArgs.slice(1));
      activeCommand = normCmd;
      activeArgs = normArgs;
      if (!normCmd || !String(normCmd).trim()) {
        console.error('Error: "gsd-sdk query" requires a command');
        process.exitCode = 10;
        return;
      }
      const registry = createRegistry();
      const tokens = [normCmd, ...normArgs];
      const matched = resolveQueryArgv(tokens, registry);
      if (!matched) {
        throw new GSDError(
          `Unknown command: "${tokens.join(' ')}". Use a registered \`gsd-sdk query\` subcommand (see sdk/src/query/QUERY-HANDLERS.md).`,
          ErrorClassification.Validation,
        );
      }

      activeCommand = matched.cmd;
      activeArgs = matched.args;
      const result = await registry.dispatch(matched.cmd, matched.args, args.projectDir, args.ws);
      const contracted = isUiContractedQueryCommand(matched.cmd);
      const structuredContract = isStructuredUiContractedQueryCommand(matched.cmd);
      let output: unknown = result.data;

      if (pickField && (!contracted || structuredContract)) {
        output = extractField(output, pickField);
      }

      writeFormattedQueryOutput(formatQueryOutput({
        command: matched.cmd,
        args: matched.args,
        result: output,
      }));
    } catch (err) {
      const formatted = formatQueryOutput({
        command: activeCommand,
        args: activeArgs,
        error: err,
      });
      writeFormattedQueryOutput(formatted);
      if (err instanceof GSDError && !isUiContractedQueryCommand(activeCommand)) {
        process.exitCode = exitCodeFor(err.classification);
      }
    }
    return;
  }

  // ─── Compile command ─────────────────────────────────────────────────────
  if (args.command === 'compile') {
    const { runCompileCommand } = await import('./compile/cli.js');
    await runCompileCommand(args.compileArgv ?? [], args.projectDir);
    return;
  }

  if (args.command !== 'run' && args.command !== 'init' && args.command !== 'auto') {
    console.error('Error: Expected "gsd-sdk run <prompt>", "gsd-sdk auto", "gsd-sdk init [input]", "gsd-sdk query <command>", or "gsd-sdk compile"');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.command === 'run' && !args.prompt) {
    console.error('Error: "gsd-sdk run" requires a prompt');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  // ─── Init command ─────────────────────────────────────────────────────────
  if (args.command === 'init') {
    const { GSD } = await import('./index.js');
    const { CLITransport } = await import('./cli-transport.js');
    const { WSTransport } = await import('./ws-transport.js');
    const { InitRunner } = await import('./init-runner.js');

    let input: string;
    try {
      input = await resolveInitInput(args);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    console.log(`[init] Resolved input: ${input.length} chars`);
    const workflowRunner = createGeneratedWorkflowRunner();

    // Build GSD instance for tools and event stream
    const gsd = new GSD({
      projectDir: args.projectDir,
      model: args.model,
      maxBudgetUsd: args.maxBudget,
      workstream: args.ws,
      workflowRunner,
    });

    // Wire CLI transport
    const cliTransport = new CLITransport();
    gsd.addTransport(cliTransport);

    // Optional WebSocket transport
    let wsTransport: InstanceType<typeof WSTransport> | undefined;
    if (args.wsPort !== undefined) {
      wsTransport = new WSTransport({ port: args.wsPort });
      await wsTransport.start();
      gsd.addTransport(wsTransport);
      console.log(`WebSocket transport listening on port ${args.wsPort}`);
    }

    try {
      const tools = gsd.createTools();
      const runner = new InitRunner({
        projectDir: args.projectDir,
        tools,
        eventStream: gsd.eventStream,
        workflowRunner,
        config: {
          maxBudgetPerSession: args.maxBudget,
          orchestratorModel: args.model,
        },
      });

      const result = await runner.run(input);

      // Print completion summary
      const status = result.success ? 'SUCCESS' : 'FAILED';
      const stepCount = result.steps.length;
      const passedSteps = result.steps.filter(s => s.success).length;
      const cost = result.totalCostUsd.toFixed(2);
      const duration = (result.totalDurationMs / 1000).toFixed(1);
      const artifactList = result.artifacts.join(', ');

      console.log(`\n[${status}] ${passedSteps}/${stepCount} steps, $${cost}, ${duration}s`);
      if (result.artifacts.length > 0) {
        console.log(`Artifacts: ${artifactList}`);
      }
      printProviderMetadataSummary(result.steps);

      if (!result.success) {
        // Log failed steps
        for (const step of result.steps) {
          if (!step.success && step.error) {
            console.error(`  ✗ ${step.step}: ${step.error}`);
          }
        }
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`Fatal error: ${(err as Error).message}`);
      process.exitCode = 1;
    } finally {
      cliTransport.close();
      if (wsTransport) {
        wsTransport.close();
      }
    }
    return;
  }

  // ─── Auto command ─────────────────────────────────────────────────────────
  if (args.command === 'auto') {
    const { GSD } = await import('./index.js');
    const { CLITransport } = await import('./cli-transport.js');
    const { WSTransport } = await import('./ws-transport.js');
    const { InitRunner } = await import('./init-runner.js');
    const workflowRunner = createGeneratedWorkflowRunner();

    const gsd = new GSD({
      projectDir: args.projectDir,
      model: args.model,
      maxBudgetUsd: args.maxBudget,
      autoMode: true,
      workstream: args.ws,
      workflowRunner,
    });

    // Wire CLI transport (always active)
    const cliTransport = new CLITransport();
    gsd.addTransport(cliTransport);

    // Optional WebSocket transport
    let wsTransport: InstanceType<typeof WSTransport> | undefined;
    if (args.wsPort !== undefined) {
      wsTransport = new WSTransport({ port: args.wsPort });
      await wsTransport.start();
      gsd.addTransport(wsTransport);
      console.log(`WebSocket transport listening on port ${args.wsPort}`);
    }

    try {
      // If --init provided, bootstrap project first
      if (args.init) {
        const initInput = await resolveInitInput({
          ...args,
          command: 'init',
          initInput: args.init,
        });

        console.log(`[auto] Bootstrapping project from --init (${initInput.length} chars)`);

        const tools = gsd.createTools();
        const runner = new InitRunner({
          projectDir: args.projectDir,
          tools,
          eventStream: gsd.eventStream,
          workflowRunner,
          config: {
            maxBudgetPerSession: args.maxBudget,
            orchestratorModel: args.model,
          },
        });

        const initResult = await runner.run(initInput);

        const initStatus = initResult.success ? 'SUCCESS' : 'FAILED';
        const stepCount = initResult.steps.length;
        const passedSteps = initResult.steps.filter(s => s.success).length;
        const initCost = initResult.totalCostUsd.toFixed(2);
        const initDuration = (initResult.totalDurationMs / 1000).toFixed(1);
        console.log(`[init ${initStatus}] ${passedSteps}/${stepCount} steps, $${initCost}, ${initDuration}s`);
        printProviderMetadataSummary(initResult.steps);

        if (!initResult.success) {
          for (const step of initResult.steps) {
            if (!step.success && step.error) {
              console.error(`  ✗ ${step.step}: ${step.error}`);
            }
          }
          process.exitCode = 1;
          return;
        }
      }

      const result = await gsd.run('');

      // Final summary
      const status = result.success ? 'SUCCESS' : 'FAILED';
      const phases = result.phases.length;
      const cost = result.totalCostUsd.toFixed(2);
      const duration = (result.totalDurationMs / 1000).toFixed(1);
      console.log(`\n[${status}] ${phases} phase(s), $${cost}, ${duration}s`);
      printProviderMetadataSummary(result.phases.flatMap(phase => phase.steps));

      if (!result.success) {
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`Fatal error: ${(err as Error).message}`);
      process.exitCode = 1;
    } finally {
      cliTransport.close();
      if (wsTransport) {
        wsTransport.close();
      }
    }
    return;
  }

  // ─── Run command ─────────────────────────────────────────────────────────
  const { GSD } = await import('./index.js');
  const { CLITransport } = await import('./cli-transport.js');
  const { WSTransport } = await import('./ws-transport.js');

  // Build GSD instance
  const gsd = new GSD({
    projectDir: args.projectDir,
    model: args.model,
    maxBudgetUsd: args.maxBudget,
    workstream: args.ws,
  });

  // Wire CLI transport (always active)
  const cliTransport = new CLITransport();
  gsd.addTransport(cliTransport);

  // Optional WebSocket transport
  let wsTransport: InstanceType<typeof WSTransport> | undefined;
  if (args.wsPort !== undefined) {
    wsTransport = new WSTransport({ port: args.wsPort });
    await wsTransport.start();
    gsd.addTransport(wsTransport);
    console.log(`WebSocket transport listening on port ${args.wsPort}`);
  }

  try {
    const result = await gsd.run(args.prompt!);

    // Final summary
    const status = result.success ? 'SUCCESS' : 'FAILED';
    const phases = result.phases.length;
    const cost = result.totalCostUsd.toFixed(2);
    const duration = (result.totalDurationMs / 1000).toFixed(1);
    console.log(`\n[${status}] ${phases} phase(s), $${cost}, ${duration}s`);

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Fatal error: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    // Clean up transports
    cliTransport.close();
    if (wsTransport) {
      wsTransport.close();
    }
  }
}

// ─── Auto-run when invoked directly ──────────────────────────────────────────

main();
