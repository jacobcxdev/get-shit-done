/**
 * Unit tests for outlier-postures.ts — Wave 0 RED tests.
 * These tests fail until Task 2 creates outlier-postures.ts.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — module does not exist yet (Wave 0 RED)
import { validatePostureRecord, loadOutlierPostureRecords } from './outlier-postures.js';
import { SEED_HARD_OUTLIERS } from './classification.js';
import type { CompileDiagnostic } from './types.js';

function postureRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: '/gsd-graphify',
    classifiedAs: 'hard-outlier',
    migrationDisposition: 'manual-posture-required',
    rationale: 'Complex non-FSM graph rendering workflow',
    emitsPacket: false,
    reviewedAt: '2026-04-29',
    owner: 'jacob',
    workflowId: null,
    ...overrides,
  };
}

const VALID_POSTURE_YAML = `commandId: /gsd-graphify
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Complex non-FSM graph rendering workflow
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: null
`;

const SEED_YAMLS: Record<string, string> = {
  'gsd-graphify.yaml': `commandId: /gsd-graphify
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Complex non-FSM graph rendering workflow
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: null
`,
  'gsd-from-gsd2.yaml': `commandId: /gsd-from-gsd2
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Cross-version migration workflow
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: null
`,
  'gsd-ultraplan-phase.yaml': `commandId: /gsd-ultraplan-phase
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Ultra-planning multi-agent workflow
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: /workflows/ultraplan-phase
`,
  'gsd-review.yaml': `commandId: /gsd-review
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Review workflow with ad-hoc scope
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: /workflows/review
`,
  'gsd-fast.yaml': `commandId: /gsd-fast
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Fast-mode non-deterministic workflow
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: /workflows/fast
`,
};

describe('validatePostureRecord', () => {
  it('accepts a fully valid posture record for a seed hard outlier', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const result = validatePostureRecord(postureRaw(), '/some/path/gsd-graphify.yaml', diagnostics);

    expect(result).not.toBeNull();
    expect(result?.commandId).toBe('/gsd-graphify');
    expect(result?.classifiedAs).toBe('hard-outlier');
    expect(result?.emitsPacket).toBe(false);
    expect(result?.posturePath).toBe('/some/path/gsd-graphify.yaml');
    expect(diagnostics).toEqual([]);
  });

  it('rejects a record with a missing required field and emits OUTL-01', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const result = validatePostureRecord(postureRaw({ rationale: undefined }), '/some/path/gsd-graphify.yaml', diagnostics);

    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTL-01',
          kind: 'outlier',
          message: expect.stringContaining('missing required field'),
        }),
      ]),
    );
  });

  it('rejects emitsPacket: true and emits OUTL-01', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const result = validatePostureRecord(postureRaw({ emitsPacket: true }), '/some/path/gsd-graphify.yaml', diagnostics);

    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTL-01',
          kind: 'outlier',
          message: expect.stringContaining('emitsPacket must be false'),
        }),
      ]),
    );
  });

  it('rejects classifiedAs !== hard-outlier and emits OUTL-01', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const result = validatePostureRecord(postureRaw({ classifiedAs: 'other' }), '/some/path/gsd-graphify.yaml', diagnostics);

    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTL-01',
          kind: 'outlier',
          message: expect.stringContaining('hard-outlier'),
        }),
      ]),
    );
  });

  it('rejects a non-seed commandId and emits OUTL-02', () => {
    const diagnostics: CompileDiagnostic[] = [];
    const result = validatePostureRecord(postureRaw({ commandId: '/gsd-not-a-seed' }), '/some/path/gsd-not-a-seed.yaml', diagnostics);

    expect(result).toBeNull();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTL-02',
          kind: 'outlier',
          id: '/gsd-not-a-seed',
          message: expect.stringContaining('non-seed'),
        }),
      ]),
    );
  });
});

describe('loadOutlierPostureRecords', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns a populated Map of size 5 when all seed YAML files are present', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'outlier-postures-test-'));
    const postureDir = join(tempDir, 'advisory', 'outlier-postures');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(postureDir, { recursive: true });

    for (const [filename, content] of Object.entries(SEED_YAMLS)) {
      await writeFile(join(postureDir, filename), content, 'utf-8');
    }

    const diagnostics: CompileDiagnostic[] = [];
    const records = await loadOutlierPostureRecords(tempDir, diagnostics);

    expect(records.size).toBe(5);
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    for (const id of SEED_HARD_OUTLIERS) {
      expect(records.has(id), `Map should contain ${id}`).toBe(true);
    }
  });

  it('returns empty Map when posture directory is absent (no OUTL-01 from loader for missing dir)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'outlier-postures-test-'));
    // No advisory/outlier-postures directory created

    const diagnostics: CompileDiagnostic[] = [];
    const records = await loadOutlierPostureRecords(tempDir, diagnostics);

    // Loader returns empty Map when directory is absent
    // OUTL-01 per missing seed is emitted for missing seeds
    expect(records.size).toBe(0);
    // Missing seeds produce OUTL-01 from the loader's seed check loop
    const outl01Diags = diagnostics.filter(d => d.code === 'OUTL-01');
    expect(outl01Diags.length).toBe(5);
  });

  it('emits OUTL-01 when a seed outlier YAML is missing from the directory', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'outlier-postures-test-'));
    const postureDir = join(tempDir, 'advisory', 'outlier-postures');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(postureDir, { recursive: true });

    // Write all seeds EXCEPT gsd-graphify.yaml
    for (const [filename, content] of Object.entries(SEED_YAMLS)) {
      if (filename !== 'gsd-graphify.yaml') {
        await writeFile(join(postureDir, filename), content, 'utf-8');
      }
    }

    const diagnostics: CompileDiagnostic[] = [];
    const records = await loadOutlierPostureRecords(tempDir, diagnostics);

    expect(records.size).toBe(4);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTL-01',
          kind: 'outlier',
          id: '/gsd-graphify',
          message: expect.stringContaining('no posture YAML file'),
        }),
      ]),
    );
  });

  it('rejects a non-seed YAML file and emits OUTL-02', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'outlier-postures-test-'));
    const postureDir = join(tempDir, 'advisory', 'outlier-postures');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(postureDir, { recursive: true });

    // Write all seeds plus a non-seed file
    for (const [filename, content] of Object.entries(SEED_YAMLS)) {
      await writeFile(join(postureDir, filename), content, 'utf-8');
    }
    await writeFile(join(postureDir, 'gsd-not-a-seed.yaml'), `commandId: /gsd-not-a-seed
classifiedAs: hard-outlier
migrationDisposition: manual-posture-required
rationale: Not a seed outlier
emitsPacket: false
reviewedAt: 2026-04-29
owner: jacob
workflowId: null
`, 'utf-8');

    const diagnostics: CompileDiagnostic[] = [];
    const records = await loadOutlierPostureRecords(tempDir, diagnostics);

    expect(records.size).toBe(5); // only the 5 seeds accepted
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OUTL-02',
          kind: 'outlier',
          id: '/gsd-not-a-seed',
          message: expect.stringContaining('non-seed'),
        }),
      ]),
    );
  });
});
