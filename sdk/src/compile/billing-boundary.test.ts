import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FORBIDDEN_MODEL_SESSION_MODULES,
  checkBillingBoundary,
  walkImports,
} from './billing-boundary.js';
import { findProjectRoot } from './paths.js';
import type { CompileDiagnostic } from './types.js';

const FORBIDDEN_MODULE = '@anthropic-ai/claude-agent-sdk';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'gsd-billing-boundary-'));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function writeFixture(path: string, content: string): Promise<string> {
  const filePath = join(projectDir, path);
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('billing boundary import graph walker', () => {
  it('returns no violations for a clean relative import graph', async () => {
    const entrypoint = await writeFixture('entrypoint.ts', "import { value } from './pure.js';\n");
    await writeFixture('pure.ts', 'export const value = 1;\n');

    const violations = await walkImports(entrypoint, new Set(), [], 0, FORBIDDEN_MODEL_SESSION_MODULES);

    expect(violations).toEqual([]);
  });

  it('records a direct forbidden external import without normalizing the package name as a path', async () => {
    const entrypoint = await writeFixture(
      'entrypoint.ts',
      `import { query } from '${FORBIDDEN_MODULE}';\n`,
    );

    const violations = await walkImports(entrypoint, new Set(), [], 0, FORBIDDEN_MODEL_SESSION_MODULES);

    expect(violations).toEqual([
      {
        chain: [entrypoint],
        forbiddenModule: FORBIDDEN_MODULE,
      },
    ]);
  });

  it('records forbidden default plus named imports', async () => {
    const entrypoint = await writeFixture(
      'entrypoint.ts',
      `import defaultQuery, { query } from '${FORBIDDEN_MODULE}';\n`,
    );

    const violations = await walkImports(entrypoint, new Set(), [], 0, FORBIDDEN_MODEL_SESSION_MODULES);

    expect(violations).toEqual([
      {
        chain: [entrypoint],
        forbiddenModule: FORBIDDEN_MODULE,
      },
    ]);
  });

  it('records non-awaited advisory dynamic imports', async () => {
    const entrypoint = await writeFixture(
      'sdk/src/compile/entrypoint.ts',
      `const loader = import('${FORBIDDEN_MODULE}');\n`,
    );

    const violations = await walkImports(
      entrypoint,
      new Set(),
      [],
      0,
      FORBIDDEN_MODEL_SESSION_MODULES,
      { includeAdvisoryDynamic: true },
    );

    expect(violations).toEqual([
      {
        chain: [entrypoint],
        forbiddenModule: FORBIDDEN_MODULE,
      },
    ]);
  });

  it('records forbidden imports reached through directory index resolution', async () => {
    const entrypoint = await writeFixture('entrypoint.ts', "import { query } from './adapter';\n");
    const adapter = await writeFixture(
      'adapter/index.ts',
      `import { query } from '${FORBIDDEN_MODULE}';\n`,
    );

    const violations = await walkImports(entrypoint, new Set(), [], 0, FORBIDDEN_MODEL_SESSION_MODULES);

    expect(violations).toEqual([
      {
        chain: [entrypoint, adapter],
        forbiddenModule: FORBIDDEN_MODULE,
      },
    ]);
  });

  it('records a transitive forbidden import with a file-only chain', async () => {
    const entrypoint = await writeFixture('entrypoint.ts', "import './middle.js';\n");
    const middle = await writeFixture('middle.ts', `import { query } from '${FORBIDDEN_MODULE}';\n`);

    const violations = await walkImports(entrypoint, new Set(), [], 0, FORBIDDEN_MODEL_SESSION_MODULES);

    expect(violations).toEqual([
      {
        chain: [entrypoint, middle],
        forbiddenModule: FORBIDDEN_MODULE,
      },
    ]);
    expect(violations[0]?.chain).not.toContain(FORBIDDEN_MODULE);
  });

  it('does not follow non-advisory dynamic imports by default', async () => {
    const entrypoint = await writeFixture(
      'entrypoint.ts',
      `const mod = await import('${FORBIDDEN_MODULE}');\n`,
    );

    const violations = await walkImports(entrypoint, new Set(), [], 0, FORBIDDEN_MODEL_SESSION_MODULES);

    expect(violations).toEqual([]);
  });

  it('follows the compile advisory dynamic import chain and emits a literal forbidden module once in diagnostics', async () => {
    await writeFixture('sdk/src/compile/cli.ts', "await import('./compiler.js');\n");
    await writeFixture('sdk/src/compile/compiler.ts', "import './middle.js';\n");
    await writeFixture('sdk/src/compile/middle.ts', `import { query } from '${FORBIDDEN_MODULE}';\n`);
    await writeFixture('sdk/src/query/index.ts', 'export const queryEntrypoint = true;\n');
    const diagnostics: CompileDiagnostic[] = [];

    const report = await checkBillingBoundary(projectDir, diagnostics);

    expect(report.clean).toBe(false);
    expect(report.violations).toEqual([
      {
        entrypoint: 'sdk/src/compile/cli.ts',
        importChain: [
          'sdk/src/compile/cli.ts',
          'sdk/src/compile/compiler.ts',
          'sdk/src/compile/middle.ts',
        ],
        forbiddenModule: FORBIDDEN_MODULE,
      },
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'BILL-01',
        kind: 'billing',
        hint:
          'chain: sdk/src/compile/cli.ts -> sdk/src/compile/compiler.ts -> ' +
          `sdk/src/compile/middle.ts -> ${FORBIDDEN_MODULE}`,
      }),
    ]);

    const hint = diagnostics[0]?.hint ?? '';
    expect((hint.match(new RegExp(FORBIDDEN_MODULE, 'g')) ?? []).length).toBe(1);
    expect(hint).not.toContain('../@anthropic-ai');
  });

  it('terminates on cycles and does not follow imports beyond the depth limit', async () => {
    const circular = await writeFixture('circular-a.ts', "import './circular-b.js';\n");
    await writeFixture('circular-b.ts', "import './circular-a.js';\n");

    const circularViolations = await walkImports(
      circular,
      new Set(),
      [],
      0,
      FORBIDDEN_MODEL_SESSION_MODULES,
    );

    expect(circularViolations).toEqual([]);

    const chainFiles = Array.from({ length: 12 }, (_, index) => `deep-${index}.ts`);
    for (let index = 0; index < chainFiles.length; index += 1) {
      const next = chainFiles[index + 1];
      await writeFixture(
        chainFiles[index],
        next
          ? `import './${next.replace(/\.ts$/, '.js')}';\n`
          : `import { query } from '${FORBIDDEN_MODULE}';\n`,
      );
    }

    const depthViolations = await walkImports(
      join(projectDir, chainFiles[0]),
      new Set(),
      [],
      0,
      FORBIDDEN_MODEL_SESSION_MODULES,
    );

    expect(depthViolations).toEqual([]);
  });

  it('exports the forbidden model-session module allowlist', () => {
    expect(FORBIDDEN_MODEL_SESSION_MODULES.has(FORBIDDEN_MODULE)).toBe(true);
  });
});

describe('checkBillingBoundary', () => {
  it('returns clean true for the current repo advisory import graph', async () => {
    const repoRoot = findProjectRoot(process.cwd());
    const diagnostics: CompileDiagnostic[] = [];

    const report = await checkBillingBoundary(repoRoot, diagnostics);

    expect(report.clean).toBe(true);
    expect(report.violations).toEqual([]);
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'BILL-01')).toEqual([]);
  });
});

describe('extension entrypoint billing boundary', () => {
  it('includes extension entry file in walk when provided', async () => {
    await writeFixture('sdk/src/compile/cli.ts', '// clean\n');
    await writeFixture('sdk/src/query/index.ts', '// clean\n');
    const extEntry = await writeFixture(
      'extensions/my-gate.ts',
      `import { query } from '${FORBIDDEN_MODULE}';\n`,
    );
    const diagnostics: CompileDiagnostic[] = [];

    const report = await checkBillingBoundary(projectDir, diagnostics, [extEntry]);

    expect(report.clean).toBe(false);
    expect(report.violations.some(v => v.entrypoint.includes('extensions/my-gate'))).toBe(true);
    expect(diagnostics.some(d => d.code === 'BILL-01')).toBe(true);
  });

  it('does not report violation when extension entry file is clean', async () => {
    await writeFixture('sdk/src/compile/cli.ts', '// clean\n');
    await writeFixture('sdk/src/query/index.ts', '// clean\n');
    const extEntry = await writeFixture('extensions/clean-gate.ts', 'export const check = () => true;\n');
    const diagnostics: CompileDiagnostic[] = [];

    const report = await checkBillingBoundary(projectDir, diagnostics, [extEntry]);

    expect(report.clean).toBe(true);
  });
});
