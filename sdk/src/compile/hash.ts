/**
 * Content hashing for gsd-sdk compile baselines.
 * Uses node:crypto SHA-256 - no external dependency. Per V6 ASVS.
 * Never include timestamps or absolute paths in hash inputs.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Compute SHA-256 hex digest of a file's raw bytes.
 * Returned digest is lowercase hex, 64 characters.
 */
export async function fileContentHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hex digest of a UTF-8 string.
 * Used for in-memory content hashing in tests and determinism checks.
 */
export function stringHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
