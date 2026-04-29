/**
 * Slim eligibility evaluator — SLIM-01.
 *
 * evaluateSlimEligibility is the sole authority for deciding whether a workflow
 * may be slimmed. Fail-closed: any gate without evidence yields indeterminate,
 * not pass. Hard-outlier workflows always fail.
 *
 * This module evaluates only compiler-owned data (CompileReport + generated JSON
 * fixtures). It must not import WorkflowRunner, advisory runners, or any
 * model-backed module. It must not shell out to scripts/phase4-parity.cjs.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkError, mkWarning } from './diagnostics.js';
import type {
  CompileDiagnostic,
  CompileReport,
  SlimEligibilityGate,
  SlimEligibilityGateResult,
  SlimEligibilityVerdict,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Default path to the generated parity workflow index.
 * Resolved relative to this source file so it works from sdk/src/ at test time
 * and sdk/dist/ at runtime (generated file is at sdk/src/generated/parity/).
 */
const DEFAULT_PARITY_INDEX_PATH = join(
  __dirname,
  '..',
  'generated',
  'parity',
  'parity-workflow-index.json',
);

type ParityWorkflowEntry = {
  workflowId: string | null;
  commandId: string;
  category: string;
  parityTier: 'deterministic' | 'dynamic-branch' | 'hitl' | 'hard-outlier' | 'query-native';
  branchIds?: string[];
};

function evaluateGate(
  gate: SlimEligibilityGate,
  evidence: string[],
  diagnostics: CompileDiagnostic[],
): SlimEligibilityGateResult {
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { gate, status: 'fail', evidence, diagnostics };
  }
  if (evidence.length === 0) {
    return { gate, status: 'indeterminate', evidence, diagnostics };
  }
  return { gate, status: 'pass', evidence, diagnostics };
}

/**
 * Evaluate slim eligibility for the given workflowId against the provided
 * CompileReport. Returns a SlimEligibilityVerdict with status and per-gate results.
 *
 * @param workflowId - The workflow ID to evaluate (e.g. '/workflows/add-phase')
 * @param report - The full CompileReport from the compiler
 * @param parityIndexPath - Optional override for the parity-workflow-index.json path
 *   (defaults to the absolute generated path; use for testing to avoid global fs mocking)
 */
export function evaluateSlimEligibility(
  workflowId: string,
  report: CompileReport,
  parityIndexPath?: string,
): SlimEligibilityVerdict {
  const resolvedParityPath = parityIndexPath ?? DEFAULT_PARITY_INDEX_PATH;

  // 1. Hard-outlier short-circuit: check ClassificationEntry.isHardOutlier.
  //    Uses compiler-manifest data, not caller-supplied metadata — cannot be bypassed
  //    by passing a non-canonical ID (T-06-02-02 mitigation).
  const classEntry = report.manifests.classification.find(
    (c) => c.workflowId === workflowId,
  );

  if (classEntry?.isHardOutlier) {
    const diag = mkError(
      'OUTL-01',
      'outlier',
      classEntry.commandId,
      classEntry.outlierPostureRecord?.posturePath ?? 'sdk/src/advisory/outlier-postures/',
      `hard-outlier workflow ${workflowId} cannot be slimmed; see posture record`,
    );
    return {
      workflowId,
      commandId: classEntry.commandId,
      eligible: false,
      status: 'fail',
      isHardOutlier: true,
      posturePath: classEntry.outlierPostureRecord?.posturePath,
      gates: [],
      diagnostics: [diag],
    };
  }

  // 2. Unknown workflow short-circuit: look up WorkflowEntry by id.
  const workflowEntry = report.manifests.workflows.find((w) => w.id === workflowId);

  if (!workflowEntry) {
    const diag = mkError(
      'SLIM-01',
      'slim',
      workflowId,
      workflowId,
      `workflow ${workflowId} not found in compile manifests; cannot evaluate slim eligibility`,
    );
    return {
      workflowId,
      eligible: false,
      status: 'fail',
      isHardOutlier: false,
      gates: [],
      diagnostics: [diag],
    };
  }

  // 3. typed-transitions gate.
  //    Policy: indeterminate until a durable non-prose transition evidence surface exists.
  //    Markdown-inferred semantic families are prose-derived, not typed transitions.
  //    evidence = [] → status:'indeterminate' per fail-closed D-02.
  //    (RESEARCH.md §typed-transitions)
  const typedTransitionsGate = evaluateGate(
    'typed-transitions',
    [],  // indeterminate until durable non-prose transition evidence surface exists (RESEARCH.md §typed-transitions)
    [],
  );

  // 4. packet-sequencing gate.
  //    Live compile has no packet sequence inventory; always indeterminate.
  //    (RESEARCH.md §packet-sequencing)
  const packetSequencingGate = evaluateGate(
    'packet-sequencing',
    [],  // indeterminate until packet definitions are collected by compiler (RESEARCH.md §packet-sequencing)
    [],
  );

  // 5. provider-routing gate.
  //    Pass if agentTypes is empty (no provider-specific route required).
  //    Indeterminate if agentTypes non-empty but no mandatory providers found.
  //    No classEntry → indeterminate.
  let providerEvidence: string[] = [];
  const providerDiagnostics: CompileDiagnostic[] = [];

  if (classEntry) {
    if (classEntry.agentTypes.length === 0) {
      providerEvidence = ['no-agent-types-declared: no provider-specific route required'];
    } else {
      // Check workflowSemantics for mandatoryProviders
      const semanticManifest = report.manifests.workflowSemantics.find(
        (s) => s.workflowId === workflowId,
      );
      const mandatoryProviders: string[] = [];
      if (semanticManifest) {
        for (const entry of semanticManifest.semantics) {
          if ('mandatoryProviders' in entry && Array.isArray(entry.mandatoryProviders)) {
            mandatoryProviders.push(...entry.mandatoryProviders as string[]);
          }
        }
      }
      if (mandatoryProviders.length > 0) {
        providerEvidence = mandatoryProviders.map((p) => `mandatory-provider:${p}`);
      } else {
        providerDiagnostics.push(
          mkWarning(
            'SLIM-01',
            'slim',
            workflowId,
            workflowId,
            'provider-routing evidence indeterminate',
          ),
        );
      }
    }
  } else {
    providerDiagnostics.push(
      mkWarning(
        'SLIM-01',
        'slim',
        workflowId,
        workflowId,
        'provider-routing evidence indeterminate',
      ),
    );
  }

  const providerRoutingGate = evaluateGate('provider-routing', providerEvidence, providerDiagnostics);

  // 6. parity-coverage gate.
  //    Reads parity-workflow-index.json defensively (T-06-02-05 mitigation).
  //    Parse errors → fail-closed (T-06-02-05).
  let parityEntries: ParityWorkflowEntry[] = [];
  let parityReadError = false;

  try {
    const raw = readFileSync(resolvedParityPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('parity index must be a JSON array');
    parityEntries = parsed as ParityWorkflowEntry[];
  } catch {
    parityReadError = true;
  }

  let parityCoverageGate: SlimEligibilityGateResult;

  if (parityReadError) {
    parityCoverageGate = evaluateGate('parity-coverage', [], [
      mkError(
        'SLIM-01',
        'slim',
        workflowId,
        resolvedParityPath,
        `parity-workflow-index.json is unreadable; cannot evaluate parity-coverage gate`,
      ),
    ]);
  } else {
    const parityEntry = parityEntries.find((e) => e.workflowId === workflowId);

    if (!parityEntry) {
      parityCoverageGate = evaluateGate('parity-coverage', [], [
        mkError(
          'SLIM-01',
          'slim',
          workflowId,
          resolvedParityPath,
          `workflow ${workflowId} absent from parity-workflow-index.json`,
        ),
      ]);
    } else if (parityEntry.parityTier === 'hard-outlier') {
      parityCoverageGate = evaluateGate('parity-coverage', [], [
        mkError(
          'SLIM-01',
          'slim',
          workflowId,
          resolvedParityPath,
          `workflow ${workflowId} has parity tier 'hard-outlier'; cannot be slimmed`,
        ),
      ]);
    } else {
      parityCoverageGate = evaluateGate(
        'parity-coverage',
        [`parity-tier:${parityEntry.parityTier}`],
        [],
      );
    }
  }

  // 7. Aggregate gates and compute verdict.
  const gates: SlimEligibilityGateResult[] = [
    typedTransitionsGate,
    packetSequencingGate,
    providerRoutingGate,
    parityCoverageGate,
  ];

  // eligible is derived from gates array — never set independently.
  // Any gate fail/indeterminate forces eligible:false (T-06-02-01 mitigation).
  const eligible = gates.every((g) => g.status === 'pass');
  const status: 'pass' | 'fail' | 'indeterminate' = eligible
    ? 'pass'
    : gates.some((g) => g.status === 'fail')
      ? 'fail'
      : 'indeterminate';

  // Collect all gate-level diagnostics into the verdict diagnostics.
  const allDiagnostics = gates.flatMap((g) => g.diagnostics);

  return {
    workflowId,
    commandId: classEntry?.commandId,
    eligible,
    status,
    isHardOutlier: false,
    posturePath: undefined,
    gates,
    diagnostics: allDiagnostics,
  };
}
