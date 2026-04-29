/**
 * Hard-outlier posture record loader and validator for gsd-sdk compile.
 * Reads YAML posture files from sdk/src/advisory/outlier-postures/.
 * No external YAML dependency — uses a narrow flat-field parser.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { mkError } from './diagnostics.js';
import type { CompileDiagnostic, OutlierPostureRecord } from './types.js';
import { SEED_HARD_OUTLIERS } from './classification.js';

/**
 * Parse a flat key: value YAML object. Handles the '>' block scalar for rationale.
 * No nesting, no arrays. Strips surrounding quotes from values.
 * Returns Record<string, string | boolean | null>.
 */
export function parsePostureYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    let raw = m[2].trim();
    // Handle YAML block scalar '>' — next indented lines are the value
    if (raw === '>') {
      i++;
      const parts: string[] = [];
      while (i < lines.length && (lines[i]?.startsWith('  ') || lines[i]?.trim() === '')) {
        const trimmed = lines[i]?.trim();
        if (trimmed) parts.push(trimmed);
        i++;
      }
      result[key] = parts.join(' ').trim();
      continue;
    }
    raw = raw.replace(/^["']|["']$/g, '');
    if (raw === 'true') {
      result[key] = true;
    } else if (raw === 'false') {
      result[key] = false;
    } else if (raw === 'null' || raw === '~') {
      result[key] = null;
    } else {
      result[key] = raw;
    }
    i++;
  }
  return result;
}

/**
 * Validate a raw parsed YAML object as an OutlierPostureRecord.
 * Returns the record (with posturePath attached) or null on any validation failure.
 * Emits OUTL-01 for missing/invalid fields, OUTL-02 for non-seed command IDs.
 */
export function validatePostureRecord(
  raw: Record<string, unknown>,
  posturePath: string,
  diagnostics: CompileDiagnostic[],
): OutlierPostureRecord | null {
  const REQUIRED = [
    'commandId',
    'classifiedAs',
    'migrationDisposition',
    'rationale',
    'emitsPacket',
    'reviewedAt',
    'owner',
  ] as const;

  for (const field of REQUIRED) {
    if (raw[field] === undefined || raw[field] === '') {
      diagnostics.push(
        mkError(
          'OUTL-01',
          'outlier',
          String(raw['commandId'] ?? posturePath),
          posturePath,
          `posture record missing required field: ${field}`,
          { field },
        ),
      );
      return null;
    }
  }

  if (raw['classifiedAs'] !== 'hard-outlier') {
    diagnostics.push(
      mkError(
        'OUTL-01',
        'outlier',
        String(raw['commandId']),
        posturePath,
        `classifiedAs must be 'hard-outlier', got: ${raw['classifiedAs']}`,
        { field: 'classifiedAs' },
      ),
    );
    return null;
  }

  if (raw['emitsPacket'] !== false) {
    diagnostics.push(
      mkError(
        'OUTL-01',
        'outlier',
        String(raw['commandId']),
        posturePath,
        `emitsPacket must be false for hard-outlier posture records`,
        { field: 'emitsPacket' },
      ),
    );
    return null;
  }

  const commandId = String(raw['commandId']);
  if (!SEED_HARD_OUTLIERS.has(commandId)) {
    diagnostics.push(
      mkError(
        'OUTL-02',
        'outlier',
        commandId,
        posturePath,
        `posture file exists for non-seed hard outlier: ${commandId}`,
        { hint: 'only SEED_HARD_OUTLIERS may have posture files' },
      ),
    );
    return null;
  }

  return {
    commandId,
    classifiedAs: 'hard-outlier',
    migrationDisposition: String(raw['migrationDisposition']),
    rationale: String(raw['rationale']),
    emitsPacket: false,
    reviewedAt: String(raw['reviewedAt']),
    owner: String(raw['owner']),
    workflowId: raw['workflowId'] === null || raw['workflowId'] === undefined ? null : String(raw['workflowId']),
    posturePath,
  };
}

/**
 * Load all posture YAML files from sdk/src/advisory/outlier-postures/.
 * sdkSrcDir is the absolute path to the sdk/src directory.
 * projectDir is the repo root used to compute repo-relative posturePaths in the records.
 * Returns a Map keyed by commandId.
 * Emits OUTL-01 for each seed outlier that has no posture YAML file.
 * Emits OUTL-02 for any non-seed posture file encountered.
 */
export async function loadOutlierPostureRecords(
  sdkSrcDir: string,
  diagnostics: CompileDiagnostic[],
  projectDir?: string,
  requiredSeedOutliers: ReadonlySet<string> = SEED_HARD_OUTLIERS,
): Promise<Map<string, OutlierPostureRecord>> {
  const postureDir = join(sdkSrcDir, 'advisory', 'outlier-postures');
  const repoRoot = projectDir ? resolve(projectDir) : undefined;

  const toPosturePath = (absPath: string): string => {
    if (repoRoot) {
      return relative(repoRoot, absPath).replace(/\\/g, '/');
    }
    return absPath;
  };

  let files: string[];
  try {
    files = (await readdir(postureDir)).filter((f) => f.endsWith('.yaml'));
  } catch {
    const records = new Map<string, OutlierPostureRecord>();
    for (const id of requiredSeedOutliers) {
      const seedPath = toPosturePath(join(postureDir, `${id.replace('/gsd-', 'gsd-')}.yaml`));
      diagnostics.push(
        mkError(
          'OUTL-01',
          'outlier',
          id,
          seedPath,
          `seed hard outlier ${id} has no posture YAML file`,
        ),
      );
    }
    return records;
  }

  const records = new Map<string, OutlierPostureRecord>();
  for (const file of files) {
    const absPath = join(postureDir, file);
    const posturePath = toPosturePath(absPath);
    const content = await readFile(absPath, 'utf-8');
    const raw = parsePostureYaml(content);
    const record = validatePostureRecord(raw, posturePath, diagnostics);
    if (record) {
      records.set(record.commandId, record);
    }
  }

  // Check all required seed outliers have a record
  for (const id of requiredSeedOutliers) {
    if (!records.has(id)) {
      const seedPath = toPosturePath(join(postureDir, `${id.replace('/gsd-', 'gsd-')}.yaml`));
      diagnostics.push(
        mkError(
          'OUTL-01',
          'outlier',
          id,
          seedPath,
          `seed hard outlier ${id} has no posture YAML file`,
        ),
      );
    }
  }

  return records;
}
