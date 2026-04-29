/**
 * Thin launcher parser and validator for gsd-sdk compile.
 * Implements SLIM-02: detection and validation of thin launcher workflow files.
 *
 * A thin launcher is a workflow file whose entire content (trimmed) is exactly
 * one fenced ```gsd-advisory block containing YAML launcher metadata.
 * Any surrounding prose disqualifies the file from being treated as a launcher.
 */

import { basename } from 'node:path';
import { SEED_HARD_OUTLIERS } from './classification.js';
import { mkError } from './diagnostics.js';
import { parsePostureYaml } from './outlier-postures.js';
import type { CompileDiagnostic, LauncherMetadata } from './types.js';

/**
 * Extract the inner YAML string from a thin launcher file.
 *
 * Returns the YAML content (without fence lines) when the file's entire trimmed
 * content is exactly one ```gsd-advisory ... ``` block. Returns null in all
 * other cases (prose before/after block, wrong fence info string, multiple blocks,
 * empty file, etc.).
 *
 * The regex is anchored (^ and $) and uses a lazy interior quantifier to avoid
 * catastrophic backtracking on large prose files (T-06-03-03 mitigation).
 */
export function extractLauncherBlock(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  // The trimmed content must be exactly one ```gsd-advisory\n...\n``` block.
  // Anchored ^ and $ + lazy [\s\S]+? — fast rejection for prose files with no fence.
  const m = trimmed.match(/^```gsd-advisory\r?\n([\s\S]+?)\r?\n```$/);
  if (!m) return null;

  // Verify no extra text surrounds the block (the trimmed string must equal the match).
  if (trimmed !== m[0]) return null;

  const inner = m[1] ?? '';

  // Reject if the interior contains a ``` fence — indicates two blocks concatenated.
  if (/^```/m.test(inner)) return null;

  return inner;
}

/**
 * Validate a raw parsed YAML object as LauncherMetadata.
 *
 * Checks:
 * - All required fields are present and non-empty.
 * - commandId is not a seed hard-outlier (T-06-03-01 mitigation).
 * - workflowId matches the expected /workflows/<stem> derived from filePath
 *   (T-06-03-02 mitigation).
 *
 * Returns a typed LauncherMetadata on success, or null (with SLIM-02 diagnostics
 * pushed) on any validation failure.
 */
export function validateLauncherMetadata(
  raw: Record<string, unknown>,
  filePath: string,
  diagnostics: CompileDiagnostic[],
): LauncherMetadata | null {
  const REQUIRED_FIELDS = ['schemaVersion', 'workflowId', 'commandId', 'runner', 'archivePath'] as const;

  const idForDiag = String(raw['workflowId'] ?? raw['commandId'] ?? filePath);

  for (const field of REQUIRED_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null || value === '') {
      diagnostics.push(
        mkError(
          'SLIM-02',
          'slim',
          idForDiag,
          filePath,
          `thin launcher missing required field: ${field}`,
          { field },
        ),
      );
      return null;
    }
  }

  // Hard-outlier rejection — launchers cannot masquerade as hard-outlier commands.
  const commandId = String(raw['commandId']);
  if (SEED_HARD_OUTLIERS.has(commandId)) {
    diagnostics.push(
      mkError(
        'SLIM-02',
        'slim',
        commandId,
        filePath,
        `hard-outlier command ${commandId} cannot have a thin launcher`,
      ),
    );
    return null;
  }

  // workflowId must match /workflows/<stem> derived from the file path.
  const stem = basename(filePath, '.md');
  const expectedWorkflowId = `/workflows/${stem}`;
  const rawWorkflowId = String(raw['workflowId']);
  if (rawWorkflowId !== expectedWorkflowId) {
    diagnostics.push(
      mkError(
        'SLIM-02',
        'slim',
        rawWorkflowId,
        filePath,
        `launcher workflowId ${rawWorkflowId} does not match expected ${expectedWorkflowId} for file ${filePath}`,
      ),
    );
    return null;
  }

  return {
    schemaVersion: Number(raw['schemaVersion']),
    workflowId: rawWorkflowId,
    commandId,
    runner: String(raw['runner']),
    archivePath: String(raw['archivePath']),
  };
}

export { parsePostureYaml };
export type { LauncherMetadata };
