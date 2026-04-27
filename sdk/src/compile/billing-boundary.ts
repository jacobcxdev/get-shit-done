/**
 * Static import-graph billing boundary checker for gsd-sdk compile.
 * Walks TypeScript import chains from compile/query advisory entrypoints
 * to detect paths that reach @anthropic-ai/claude-agent-sdk.
 *
 * Uses lightweight regex-based import extraction per D-18.
 * Never imports or executes the files it analyzes.
 * Full import chains included in diagnostics per D-15.
 * Per BILL-01 through BILL-04.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { mkError } from './diagnostics.js';
import { toRepoRelative } from './paths.js';
import type { BillingBoundaryReport, CompileDiagnostic } from './types.js';

/** Forbidden external module specifiers - import of these on advisory paths is a billing violation. */
export const FORBIDDEN_MODEL_SESSION_MODULES = new Set<string>(['@anthropic-ai/claude-agent-sdk']);

type ImportViolation = {
  chain: string[];
  forbiddenModule: string;
};

type ImportEdge = {
  specifier: string;
  typeOnly: boolean;
};

type WalkOptions = {
  includeAdvisoryDynamic?: boolean;
};

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function isCompileAdvisoryModule(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return normalized.includes('/sdk/src/compile/') || normalized.includes('/compile/');
}

function shouldIncludeAdvisoryDynamic(filePath: string, opts?: WalkOptions): boolean {
  return opts?.includeAdvisoryDynamic === true && isCompileAdvisoryModule(filePath);
}

function addEdge(edges: ImportEdge[], seen: Set<string>, specifier: string, typeOnly: boolean): void {
  const key = `${typeOnly ? 'type' : 'value'}:${specifier}`;
  if (!seen.has(key)) {
    seen.add(key);
    edges.push({ specifier, typeOnly });
  }
}

function addMatches(content: string, pattern: RegExp, edges: ImportEdge[], seen: Set<string>, typeOnly: boolean): void {
  for (const match of content.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier) addEdge(edges, seen, specifier, typeOnly);
  }
}

function extractImportEdges(content: string, includeAdvisoryDynamic = false): ImportEdge[] {
  const importPattern =
    /^\s*import\s+(?!type\b)(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/gm;
  const typeImportPattern =
    /^\s*import\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/gm;
  const sideEffectImportPattern = /^\s*import\s+['"]([^'"]+)['"]/gm;
  const reExportPattern =
    /^\s*export\s+(?!type\b)(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/gm;
  const typeReExportPattern =
    /^\s*export\s+type\s+(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/gm;
  const dynamicImportPattern = /\bawait\s+import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

  const edges: ImportEdge[] = [];
  const seen = new Set<string>();
  addMatches(content, importPattern, edges, seen, false);
  addMatches(content, typeImportPattern, edges, seen, true);
  addMatches(content, sideEffectImportPattern, edges, seen, false);
  addMatches(content, reExportPattern, edges, seen, false);
  addMatches(content, typeReExportPattern, edges, seen, true);
  if (includeAdvisoryDynamic) {
    addMatches(content, dynamicImportPattern, edges, seen, false);
  }
  return edges;
}

export function extractStaticImports(content: string, includeAdvisoryDynamic = false): string[] {
  return extractImportEdges(content, includeAdvisoryDynamic)
    .filter((edge) => !edge.typeOnly)
    .map((edge) => edge.specifier);
}

export function resolveImportPath(fromFile: string, specifier: string): string | null {
  if (!isRelativeSpecifier(specifier)) return null;

  const basePath = resolve(dirname(fromFile), specifier);
  const candidates = [basePath];
  if (extname(basePath) === '') {
    candidates.push(`${basePath}.ts`);
  }
  if (basePath.endsWith('.js')) {
    candidates.push(`${basePath.slice(0, -'.js'.length)}.ts`);
  }

  for (const candidate of [...new Set(candidates)]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function walkImports(
  entryFile: string,
  visited: Set<string>,
  chain: string[],
  depth: number,
  forbidden: Set<string>,
  opts?: WalkOptions,
): Promise<ImportViolation[]> {
  if (depth > 10 || visited.has(entryFile)) return [];
  visited.add(entryFile);

  let content: string;
  try {
    content = await readFile(entryFile, 'utf-8');
  } catch {
    return [];
  }

  const violations: ImportViolation[] = [];
  const edges = extractImportEdges(content, shouldIncludeAdvisoryDynamic(entryFile, opts))
    .filter((edge) => !edge.typeOnly);

  for (const { specifier } of edges) {
    if (forbidden.has(specifier)) {
      violations.push({
        chain: [...chain, entryFile],
        forbiddenModule: specifier,
      });
      continue;
    }

    const resolvedImport = resolveImportPath(entryFile, specifier);
    if (!resolvedImport) continue;

    violations.push(
      ...(await walkImports(
        resolvedImport,
        visited,
        [...chain, entryFile],
        depth + 1,
        forbidden,
        opts,
      )),
    );
  }

  return violations;
}

export async function checkBillingBoundary(
  projectDir: string,
  diagnostics: CompileDiagnostic[],
): Promise<BillingBoundaryReport> {
  const entrypointFiles = [
    join(projectDir, 'sdk', 'src', 'compile', 'cli.ts'),
    join(projectDir, 'sdk', 'src', 'query', 'index.ts'),
  ].filter(existsSync);

  const violations: BillingBoundaryReport['violations'] = [];

  for (const entrypointFile of entrypointFiles) {
    const importViolations = await walkImports(
      entrypointFile,
      new Set<string>(),
      [],
      0,
      FORBIDDEN_MODEL_SESSION_MODULES,
      { includeAdvisoryDynamic: true },
    );

    for (const violation of importViolations) {
      const entrypoint = toRepoRelative(projectDir, violation.chain[0] ?? entrypointFile);
      const importChain = violation.chain.map((filePath) => toRepoRelative(projectDir, filePath));
      const hint = `chain: ${importChain.join(' -> ')} -> ${violation.forbiddenModule}`;

      violations.push({
        entrypoint,
        importChain,
        forbiddenModule: violation.forbiddenModule,
      });
      diagnostics.push(
        mkError(
          'BILL-01',
          'billing',
          entrypoint,
          entrypoint,
          `billing boundary violated: import chain reaches ${violation.forbiddenModule}`,
          { hint },
        ),
      );
    }
  }

  return {
    entrypoints: entrypointFiles.map((entrypoint) => toRepoRelative(projectDir, entrypoint)),
    violations,
    clean: violations.length === 0,
  };
}
