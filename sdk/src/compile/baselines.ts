/**
 * Typed baseline module contract for `gsd-sdk compile`.
 * Plan 07 replaces these no-side-effect shells with deterministic baseline logic.
 */

import type { CompileDiagnostic, CompileReport } from './types.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortKeysDeep(item));
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeysDeep(value[key]);
      return acc;
    }, {});
}

export async function writeBaselines(
  _projectDir: string,
  _report: CompileReport,
): Promise<CompileDiagnostic[]> {
  return [];
}

export async function checkBaselines(
  _projectDir: string,
  _report: CompileReport,
): Promise<CompileDiagnostic[]> {
  return [];
}
