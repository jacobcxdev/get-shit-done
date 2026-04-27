/**
 * Diagnostic constructor helpers and sort utilities for gsd-sdk compile.
 * All functions are pure - no I/O, no side effects.
 */

import type { CompileDiagnostic, DiagnosticKind } from './types.js';

/** Construct an error-severity CompileDiagnostic. Per CONTEXT D-09. */
export function mkError(
  code: string,
  kind: DiagnosticKind,
  id: string,
  path: string,
  message: string,
  opts?: { field?: string; hint?: string },
): CompileDiagnostic {
  return { code, severity: 'error', message, kind, id, path, ...opts };
}

/** Construct a warning-severity CompileDiagnostic. Per CONTEXT D-09. */
export function mkWarning(
  code: string,
  kind: DiagnosticKind,
  id: string,
  path: string,
  message: string,
  opts?: { field?: string; hint?: string },
): CompileDiagnostic {
  return { code, severity: 'warning', message, kind, id, path, ...opts };
}

/**
 * Sort diagnostics deterministically by [severity, code, kind, id, path, field].
 * Does not mutate the input array. Per CONTEXT D-09.
 */
export function sortDiagnostics(ds: CompileDiagnostic[]): CompileDiagnostic[] {
  return [...ds].sort(
    (a, b) =>
      a.severity.localeCompare(b.severity) ||
      a.code.localeCompare(b.code) ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id) ||
      a.path.localeCompare(b.path) ||
      (a.field ?? '').localeCompare(b.field ?? ''),
  );
}
