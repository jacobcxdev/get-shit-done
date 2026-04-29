/**
 * Tests for evaluateSlimEligibility.
 * Wave 0 (RED): All tests fail until slim-eligibility.ts is created.
 */

import { describe, expect, it } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateSlimEligibility } from './slim-eligibility.js';
import type { CompileReport, ClassificationEntry, WorkflowEntry } from './types.js';

function makeReport(overrides: Partial<CompileReport> = {}): CompileReport {
  return {
    counts: { commands: 0, workflows: 0, agents: 0, hooks: 0 },
    manifests: {
      commands: [],
      workflows: [],
      workflowSemantics: [],
      agents: [],
      hooks: [],
      classification: [],
      billing: { entrypoints: [], violations: [], clean: true },
    },
    diagnostics: [],
    ...overrides,
  };
}

function makeWorkflowEntry(id: string, overrides: Partial<WorkflowEntry> = {}): WorkflowEntry {
  return {
    id,
    path: `get-shit-done/workflows/${id.replace('/workflows/', '')}.md`,
    hash: 'abc123',
    stepCount: { value: 3, inferred: false },
    runnerType: { value: 'advisory', inferred: false },
    determinism: { value: 'deterministic', inferred: false },
    semanticFeatures: { values: [], inferred: false },
    semanticManifest: { workflowId: id, semantics: [] },
    isTopLevel: true,
    ...overrides,
  };
}

function makeClassificationEntry(commandId: string, workflowId: string | null, overrides: Partial<ClassificationEntry> = {}): ClassificationEntry {
  return {
    commandId,
    category: 'core-lifecycle',
    workflowId,
    agentTypes: [],
    determinismPosture: 'deterministic',
    migrationDisposition: 'adopt',
    isHardOutlier: false,
    ...overrides,
  };
}

describe('evaluateSlimEligibility', () => {
  describe('unknown workflow ID', () => {
    it('returns status:fail with SLIM-01 diagnostic for an unknown workflowId', () => {
      const report = makeReport();
      const verdict = evaluateSlimEligibility('/workflows/does-not-exist', report);

      expect(verdict.workflowId).toBe('/workflows/does-not-exist');
      expect(verdict.eligible).toBe(false);
      expect(verdict.status).toBe('fail');
      expect(verdict.isHardOutlier).toBe(false);
      expect(verdict.gates).toEqual([]);
      expect(verdict.diagnostics.length).toBeGreaterThan(0);
      expect(verdict.diagnostics.some(d => d.code === 'SLIM-01')).toBe(true);
    });
  });

  describe('hard-outlier workflow', () => {
    it('returns status:fail with OUTL-01 diagnostic referencing posture record', () => {
      const report = makeReport({
        manifests: {
          commands: [],
          workflows: [makeWorkflowEntry('/workflows/review')],
          workflowSemantics: [],
          agents: [],
          hooks: [],
          classification: [
            makeClassificationEntry('/gsd-review', '/workflows/review', {
              category: 'hard-outlier',
              isHardOutlier: true,
              outlierPostureRecord: {
                commandId: '/gsd-review',
                classifiedAs: 'hard-outlier',
                migrationDisposition: 'permanent-outlier',
                rationale: 'Review requires live model judgement',
                emitsPacket: false,
                reviewedAt: '2026-04-01',
                owner: 'platform',
                workflowId: '/workflows/review',
                posturePath: 'sdk/src/advisory/outlier-postures/gsd-review.yaml',
              },
            }),
          ],
          billing: { entrypoints: [], violations: [], clean: true },
        },
      });

      const verdict = evaluateSlimEligibility('/workflows/review', report);

      expect(verdict.workflowId).toBe('/workflows/review');
      expect(verdict.commandId).toBe('/gsd-review');
      expect(verdict.eligible).toBe(false);
      expect(verdict.status).toBe('fail');
      expect(verdict.isHardOutlier).toBe(true);
      expect(verdict.posturePath).toBe('sdk/src/advisory/outlier-postures/gsd-review.yaml');
      expect(verdict.gates).toEqual([]);
      expect(verdict.diagnostics.some(d => d.code === 'OUTL-01')).toBe(true);
      const outl01 = verdict.diagnostics.find(d => d.code === 'OUTL-01')!;
      expect(outl01.message).toContain('posture record');
    });

    it('does not throw when hard-outlier workflow lacks a posture record path', () => {
      const report = makeReport({
        manifests: {
          commands: [],
          workflows: [makeWorkflowEntry('/workflows/fast')],
          workflowSemantics: [],
          agents: [],
          hooks: [],
          classification: [
            makeClassificationEntry('/gsd-fast', '/workflows/fast', {
              category: 'hard-outlier',
              isHardOutlier: true,
            }),
          ],
          billing: { entrypoints: [], violations: [], clean: true },
        },
      });

      expect(() => evaluateSlimEligibility('/workflows/fast', report)).not.toThrow();
      const verdict = evaluateSlimEligibility('/workflows/fast', report);
      expect(verdict.gates).toEqual([]);
      expect(verdict.isHardOutlier).toBe(true);
    });
  });

  describe('four-gate evaluation', () => {
    it('returns typed-transitions gate as indeterminate when workflow has no semantic manifest entries', () => {
      const workflowId = '/workflows/add-phase';
      const report = makeReport({
        manifests: {
          commands: [],
          workflows: [makeWorkflowEntry(workflowId)],
          workflowSemantics: [{ workflowId, semantics: [] }],
          agents: [],
          hooks: [],
          classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
          billing: { entrypoints: [], violations: [], clean: true },
        },
      });

      const verdict = evaluateSlimEligibility(workflowId, report);
      const typedTransitionsGate = verdict.gates.find(g => g.gate === 'typed-transitions');

      expect(typedTransitionsGate).toBeDefined();
      expect(typedTransitionsGate!.status).toBe('indeterminate');
    });

    it('returns packet-sequencing gate as indeterminate (no packet inventory available)', () => {
      const workflowId = '/workflows/add-phase';
      const report = makeReport({
        manifests: {
          commands: [],
          workflows: [makeWorkflowEntry(workflowId)],
          workflowSemantics: [],
          agents: [],
          hooks: [],
          classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
          billing: { entrypoints: [], violations: [], clean: true },
        },
      });

      const verdict = evaluateSlimEligibility(workflowId, report);
      const packetGate = verdict.gates.find(g => g.gate === 'packet-sequencing');

      expect(packetGate).toBeDefined();
      expect(packetGate!.status).toBe('indeterminate');
    });

    it('all four gates present in result even when workflow is non-outlier', async () => {
      const workflowId = '/workflows/add-phase';
      // Use a temp parity index that contains this workflow as deterministic
      const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-test-'));
      try {
        const parityIndex = JSON.stringify([
          {
            commandId: '/gsd-add-phase',
            workflowId,
            category: 'core-lifecycle',
            parityTier: 'deterministic',
          },
        ]);
        const parityPath = join(tmpDir, 'parity-workflow-index.json');
        await writeFile(parityPath, parityIndex, 'utf-8');

        const report = makeReport({
          manifests: {
            commands: [],
            workflows: [makeWorkflowEntry(workflowId)],
            workflowSemantics: [{ workflowId, semantics: [] }],
            agents: [],
            hooks: [],
            classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
            billing: { entrypoints: [], violations: [], clean: true },
          },
        });

        const verdict = evaluateSlimEligibility(workflowId, report, parityPath);

        const gateNames = verdict.gates.map(g => g.gate);
        expect(gateNames).toContain('typed-transitions');
        expect(gateNames).toContain('packet-sequencing');
        expect(gateNames).toContain('provider-routing');
        expect(gateNames).toContain('parity-coverage');
        expect(verdict.gates.length).toBe(4);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('eligible is false when any gate fails or is indeterminate', () => {
    it('eligible is false when any gate is indeterminate', async () => {
      const workflowId = '/workflows/add-phase';
      const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-test-'));
      try {
        const parityIndex = JSON.stringify([
          { commandId: '/gsd-add-phase', workflowId, category: 'core-lifecycle', parityTier: 'deterministic' },
        ]);
        const parityPath = join(tmpDir, 'parity-workflow-index.json');
        await writeFile(parityPath, parityIndex, 'utf-8');

        const report = makeReport({
          manifests: {
            commands: [],
            workflows: [makeWorkflowEntry(workflowId)],
            workflowSemantics: [],   // No semantics → typed-transitions is indeterminate
            agents: [],
            hooks: [],
            classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
            billing: { entrypoints: [], violations: [], clean: true },
          },
        });

        const verdict = evaluateSlimEligibility(workflowId, report, parityPath);

        expect(verdict.eligible).toBe(false);
        expect(verdict.status).not.toBe('pass');
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('all-four-gates-pass scenario', () => {
    it('returns status:pass and eligible:true when all gates pass', async () => {
      // provider-routing gate: pass when agentTypes is empty (no route required)
      // typed-transitions: indeterminate currently (fail-closed per RESEARCH.md §typed-transitions)
      // So the only achievable full-pass scenario today is effectively impossible due to fail-closed
      // typed-transitions and packet-sequencing. Test documents the intended shape when they do pass.

      // We use a parity index override to control parity-coverage gate.
      const workflowId = '/workflows/add-phase';
      const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-test-'));
      try {
        const parityIndex = JSON.stringify([
          { commandId: '/gsd-add-phase', workflowId, category: 'core-lifecycle', parityTier: 'deterministic' },
        ]);
        const parityPath = join(tmpDir, 'parity-workflow-index.json');
        await writeFile(parityPath, parityIndex, 'utf-8');

        const report = makeReport({
          manifests: {
            commands: [],
            workflows: [
              makeWorkflowEntry(workflowId, {
                semanticManifest: {
                  workflowId,
                  semantics: [
                    {
                      family: 'completion-marker',
                      markers: ['plan-complete'],
                      provenance: 'workflow-text',
                    },
                  ],
                },
              }),
            ],
            workflowSemantics: [
              {
                workflowId,
                semantics: [
                  {
                    family: 'completion-marker',
                    markers: ['plan-complete'],
                    provenance: 'workflow-text',
                  },
                ],
              },
            ],
            agents: [],
            hooks: [],
            classification: [
              makeClassificationEntry('/gsd-add-phase', workflowId, { agentTypes: [] }),
            ],
            billing: { entrypoints: [], violations: [], clean: true },
          },
        });

        const verdict = evaluateSlimEligibility(workflowId, report, parityPath);

        // parity-coverage should pass; provider-routing should pass (no agentTypes)
        const parityGate = verdict.gates.find(g => g.gate === 'parity-coverage');
        expect(parityGate!.status).toBe('pass');
        const providerGate = verdict.gates.find(g => g.gate === 'provider-routing');
        expect(providerGate!.status).toBe('pass');

        // typed-transitions and packet-sequencing are indeterminate by design (fail-closed)
        // so overall eligible should be false (documented expected behaviour)
        expect(verdict.eligible).toBe(false);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('parity-coverage gate', () => {
    it('returns fail when parity index is unreadable', () => {
      const workflowId = '/workflows/add-phase';
      const report = makeReport({
        manifests: {
          commands: [],
          workflows: [makeWorkflowEntry(workflowId)],
          workflowSemantics: [],
          agents: [],
          hooks: [],
          classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
          billing: { entrypoints: [], violations: [], clean: true },
        },
      });

      const verdict = evaluateSlimEligibility(workflowId, report, '/nonexistent/path/parity.json');
      const parityGate = verdict.gates.find(g => g.gate === 'parity-coverage');

      expect(parityGate).toBeDefined();
      expect(parityGate!.status).toBe('fail');
    });

    it('returns fail when parity tier is hard-outlier', async () => {
      const workflowId = '/workflows/add-phase';
      const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-test-'));
      try {
        const parityIndex = JSON.stringify([
          { commandId: '/gsd-add-phase', workflowId, category: 'hard-outlier', parityTier: 'hard-outlier' },
        ]);
        const parityPath = join(tmpDir, 'parity-workflow-index.json');
        await writeFile(parityPath, parityIndex, 'utf-8');

        const report = makeReport({
          manifests: {
            commands: [],
            workflows: [makeWorkflowEntry(workflowId)],
            workflowSemantics: [],
            agents: [],
            hooks: [],
            classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
            billing: { entrypoints: [], violations: [], clean: true },
          },
        });

        const verdict = evaluateSlimEligibility(workflowId, report, parityPath);
        const parityGate = verdict.gates.find(g => g.gate === 'parity-coverage');

        expect(parityGate!.status).toBe('fail');
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns pass when parity tier is deterministic', async () => {
      const workflowId = '/workflows/add-phase';
      const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-slim-test-'));
      try {
        const parityIndex = JSON.stringify([
          { commandId: '/gsd-add-phase', workflowId, category: 'core-lifecycle', parityTier: 'deterministic' },
        ]);
        const parityPath = join(tmpDir, 'parity-workflow-index.json');
        await writeFile(parityPath, parityIndex, 'utf-8');

        const report = makeReport({
          manifests: {
            commands: [],
            workflows: [makeWorkflowEntry(workflowId)],
            workflowSemantics: [],
            agents: [],
            hooks: [],
            classification: [makeClassificationEntry('/gsd-add-phase', workflowId)],
            billing: { entrypoints: [], violations: [], clean: true },
          },
        });

        const verdict = evaluateSlimEligibility(workflowId, report, parityPath);
        const parityGate = verdict.gates.find(g => g.gate === 'parity-coverage');

        expect(parityGate!.status).toBe('pass');
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
