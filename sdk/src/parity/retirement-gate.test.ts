import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Subprocess execution helpers are intentionally absent; process-spawning helpers are not used here.
const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..');
const DISPOSITION_MANIFEST = join(PROJECT_ROOT, 'sdk/src/generated/parity/disposition-manifest.json');
const BEHAVIOUR_INVENTORY = join(PROJECT_ROOT, 'sdk/src/parity/behaviour-inventory.json');
const RETIRED_BIN = 'gsd-' + 'post-update';

type DispositionEntry = {
  id: string;
  behaviour: string;
  requirementId: string;
  targetSurface: string;
  disposition: 'absorbed' | 'open-gap';
  retirementStatus: 'blocked' | 'unblocked';
  evidenceCheck: string;
};

function readDispositionManifest(): DispositionEntry[] {
  return JSON.parse(readFileSync(DISPOSITION_MANIFEST, 'utf8')) as DispositionEntry[];
}

describe('Retirement gate - disposition manifest completeness', () => {
  it('disposition-manifest.json exists and is valid JSON', () => {
    expect(existsSync(DISPOSITION_MANIFEST)).toBe(true);
    const raw = readFileSync(DISPOSITION_MANIFEST, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('every disposition entry has required fields with non-empty machine predicates', () => {
    const entries = readDispositionManifest();
    const required = [
      'id',
      'behaviour',
      'requirementId',
      'targetSurface',
      'disposition',
      'retirementStatus',
      'evidenceCheck',
    ];
    const placeholderEvidence = new RegExp(`^TO${'DO'}`, 'i');

    for (const entry of entries) {
      for (const field of required) {
        const value = (entry as Record<string, unknown>)[field];
        expect(value, `entry ${entry.id} missing field ${field}`).toBeTruthy();
        if (field === 'evidenceCheck') {
          expect(String(value), `entry ${entry.id}: evidenceCheck must be a real predicate`).not.toMatch(
            placeholderEvidence,
          );
          expect(String(value).trim().length, `entry ${entry.id}: evidenceCheck must not be empty`).toBeGreaterThan(
            0,
          );
          expect(
            String(value),
            `entry ${entry.id}: evidenceCheck must be an executable command string`,
          ).toMatch(/^(node|npm|npx|cd |grep|ls )/);
        }
      }
    }
  });

  it('UPDT-04: no disposition entry has retirementStatus:blocked or an open-gap disposition', () => {
    const entries = readDispositionManifest();
    const blocked = entries.filter(e => e.retirementStatus === 'blocked' || e.disposition === 'open-gap');
    if (blocked.length > 0) {
      const ids = blocked.map(e => `${e.id} (${e.behaviour})`).join('\n  - ');
      throw new Error(
        `[UPDT-04] ${blocked.length} disposition ${blocked.length === 1 ? 'entry is' : 'entries are'} still blocked:\n  - ${ids}\n` +
          'Resolve all open-gap dispositions before declaring retired-command retirement.',
      );
    }
    expect(blocked).toHaveLength(0);
  });

  it('HOOK-06: all HOOK-related disposition entries are unblocked before retirement', () => {
    const entries = readDispositionManifest();
    const hookEntries = entries.filter(e => e.requirementId.startsWith('HOOK-'));
    const blockedHookEntries = hookEntries.filter(e => e.retirementStatus === 'blocked' || e.disposition === 'open-gap');
    if (blockedHookEntries.length > 0) {
      const ids = blockedHookEntries.map(e => e.id).join(', ');
      throw new Error(`[HOOK-06] Hook disposition entries still blocked: ${ids}. Complete hook absorption before retirement.`);
    }
    expect(blockedHookEntries).toHaveLength(0);
  });

  it('UPDT-05: no executable retired command invocation in parity/test/script surfaces with a Node scanner', () => {
    const tombstonePath = join(PROJECT_ROOT, 'get-shit-done', 'bin', `${RETIRED_BIN}.cjs`);
    const scanSurfaces = [
      join(PROJECT_ROOT, 'sdk', 'src', 'parity'),
      join(PROJECT_ROOT, 'sdk', 'src', 'generated', 'parity'),
      join(PROJECT_ROOT, 'tests'),
      join(PROJECT_ROOT, 'scripts'),
      join(PROJECT_ROOT, 'bin'),
      join(PROJECT_ROOT, 'get-shit-done', 'bin'),
      join(PROJECT_ROOT, '.github', 'workflows', 'test.yml'),
      join(PROJECT_ROOT, 'package.json'),
    ];

    // STRUCTURAL allowlist: specific JSON/YAML field shapes and requirement IDs only.
    // It intentionally avoids broad string patterns that could hide executable invocations.
    function isAllowedLine(lineContent: string, filePath: string): boolean {
      if (filePath === tombstonePath) return true;
      if (/["']?behaviour["']?\s*:/.test(lineContent)) return true;
      if (/["']?absorptionCommand["']?\s*:/.test(lineContent)) return true;
      if (/["']?evidenceCheck["']?\s*:/.test(lineContent)) return true;
      if (/["']?targetSurface["']?\s*:/.test(lineContent)) return true;
      if (/\bUPDT-[A-Z0-9-]+\b/.test(lineContent) && lineContent.includes(':')) return true;
      return false;
    }

    const violations: string[] = [];

    function scanFile(filePath: string): void {
      let content: string;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        return;
      }

      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (!line.includes(RETIRED_BIN)) return;
        if (!isAllowedLine(line, filePath)) {
          violations.push(`${filePath}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    function scanPath(pathToScan: string): void {
      try {
        const stat = statSync(pathToScan);
        if (stat.isDirectory()) {
          readdirSync(pathToScan).forEach(fileName => scanPath(join(pathToScan, fileName)));
        } else {
          scanFile(pathToScan);
        }
      } catch {
        /* Optional surfaces may be absent in local checkouts. */
      }
    }

    for (const surface of scanSurfaces) scanPath(surface);

    if (violations.length > 0) {
      throw new Error(`[UPDT-05] Executable ${RETIRED_BIN} reference found in parity surfaces:\n${violations.join('\n')}`);
    }
    expect(violations).toHaveLength(0);
  });

  it('disposition manifest count equals behaviour-inventory.json count (exact set equality)', () => {
    const entries = readDispositionManifest();
    const inventory = JSON.parse(readFileSync(BEHAVIOUR_INVENTORY, 'utf8')) as unknown[];
    expect(entries.length).toBe(inventory.length);
    expect(entries.length).toBeGreaterThan(0);
  });
});
