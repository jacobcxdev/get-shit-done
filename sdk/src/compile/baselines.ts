/**
 * Baseline read/write/check for gsd-sdk compile.
 * Generates deterministic JSON files under sdk/src/generated/compile/.
 * Per D-07 (no timestamps/absolute paths), D-23 (--write), D-24 (ID-aware diff), D-25 (no countChangeLog).
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { mkError } from './diagnostics.js';
import { toPosixPath, toRepoRelative } from './paths.js';
import type { CompileDiagnostic } from './types.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasId(value: unknown): value is { id: unknown } {
  return isPlainRecord(value) && 'id' in value;
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    const sortedItems = value.map((item) => sortKeysDeep(item));
    if (sortedItems.every((item): item is string => typeof item === 'string')) {
      return [...sortedItems].sort((a, b) => a.localeCompare(b));
    }
    if (sortedItems.every(hasId)) {
      return [...sortedItems].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }
    return [...sortedItems].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeysDeep(value[key]);
      return acc;
    }, {});
}

function deterministicJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

export async function writeBaselines(generatedDir: string, manifests: Record<string, unknown>): Promise<void> {
  await mkdir(generatedDir, { recursive: true });
  for (const [name, data] of Object.entries(manifests).sort(([a], [b]) => a.localeCompare(b))) {
    await writeFile(join(generatedDir, `${name}.json`), deterministicJson(data), 'utf-8');
  }
}

function relBaselinePath(projectDir: string, generatedDir: string, absFilePath: string, name: string): string {
  if (isAbsolute(generatedDir)) {
    return toRepoRelative(projectDir, absFilePath);
  }
  return toPosixPath(join(generatedDir, `${name}.json`));
}

function collectIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    if (value.every(hasId)) {
      for (const item of value) ids.add(String(item.id));
    }
    for (const item of value) collectIds(item, ids);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const child of Object.values(value)) collectIds(child, ids);
}

function idAwareHint(committed: unknown, live: unknown): string {
  const committedIds = new Set<string>();
  const liveIds = new Set<string>();
  collectIds(committed, committedIds);
  collectIds(live, liveIds);

  const added = [...liveIds].filter((id) => !committedIds.has(id)).sort((a, b) => a.localeCompare(b));
  const removed = [...committedIds].filter((id) => !liveIds.has(id)).sort((a, b) => a.localeCompare(b));
  return [...added.map((id) => `+${id}`), ...removed.map((id) => `-${id}`)].join(', ') || 'content changed';
}

export async function checkBaselines(
  projectDir: string,
  generatedDir: string,
  currentManifests: Record<string, unknown>,
  diagnostics: CompileDiagnostic[],
): Promise<void> {
  const absGeneratedDir = isAbsolute(generatedDir) ? generatedDir : join(projectDir, generatedDir);
  for (const [name, live] of Object.entries(currentManifests).sort(([a], [b]) => a.localeCompare(b))) {
    const filePath = join(absGeneratedDir, `${name}.json`);
    const relPath = relBaselinePath(projectDir, generatedDir, filePath, name);
    let committedJson: string;
    try {
      committedJson = await readFile(filePath, 'utf-8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        diagnostics.push(
          mkError('COMP-10', 'baseline', name, relPath, `missing committed baseline: ${name}.json`, {
            hint: 'run gsd-sdk compile --write',
          }),
        );
        continue;
      }
      throw error;
    }

    let committed: unknown;
    try {
      committed = JSON.parse(committedJson);
    } catch {
      diagnostics.push(
        mkError('COMP-10', 'baseline', name, relPath, `baseline is not valid JSON: ${name}.json`, {
          hint: 'run gsd-sdk compile --write',
        }),
      );
      continue;
    }

    const liveJson = deterministicJson(live);
    if (committedJson !== liveJson) {
      diagnostics.push(
        mkError('COMP-10', 'baseline', name, relPath, `baseline drift in ${name}.json`, {
          hint: idAwareHint(committed, sortKeysDeep(live)),
        }),
      );
    }
  }
}
