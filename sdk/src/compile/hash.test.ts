/**
 * Unit tests for compile content hashing helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileContentHash, stringHash } from './hash.js';

describe('compile hash helpers', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gsd-compile-hash-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('hashes strings deterministically as lowercase SHA-256 hex', () => {
    const first = stringHash('hello');
    const second = stringHash('hello');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('distinguishes different string inputs', () => {
    expect(stringHash('hello')).not.toBe(stringHash('world'));
  });

  it('hashes file contents as lowercase SHA-256 hex', async () => {
    const filePath = join(tmpDir, 'example.txt');
    await writeFile(filePath, 'compile baseline content', 'utf-8');

    await expect(fileContentHash(filePath)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });
});
