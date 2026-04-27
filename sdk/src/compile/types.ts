/**
 * Compile types for gsd-sdk compile.
 * Central type definitions shared across all compiler modules.
 * No external imports - pure type declarations only.
 */

export type DiagnosticSeverity = 'error' | 'warning';

export type DiagnosticKind =
  | 'command'
  | 'workflow'
  | 'agent'
  | 'hook'
  | 'billing'
  | 'baseline'
  | 'extension'
  | 'packet'
  | 'state';

/** Per-CONTEXT D-09: stable diagnostic shape emitted by every compiler module. */
export type CompileDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  kind: DiagnosticKind;
  id: string;
  path: string;
  field?: string;
  hint?: string;
};

export type CompileCounts = {
  commands: number;
  workflows: number;
  agents: number;
  hooks: number;
};

export type WorkflowRefAssociation = {
  workflowId: string;
  rawRef: string;
  source: 'frontmatter' | 'execution_context' | 'body' | 'mode-routing' | 'inferred';
  primary: boolean;
  branch?: {
    condition: string;
    sourceText: string;
  };
};

export type CommandEntry = {
  id: string;
  path: string;
  hash: string;
  name?: string;
  agent?: string;
  allowedTools?: string[];
  /**
   * Primary workflow association for compatibility with existing consumers.
   * Null only for known command-only utilities or invalid/missing refs that also emit diagnostics.
   */
  workflowRef?: string | null;
  /**
   * All workflow associations found in the command. Single-workflow commands have
   * one entry; dynamic/mode-dispatched commands have one entry per valid branch.
   */
  workflowRefs: WorkflowRefAssociation[];
  confidence: 'extracted' | 'inferred' | 'unknown';
};

export type WorkflowEntry = {
  id: string;
  path: string;
  hash: string;
  stepCount: { value: number; inferred: boolean };
  runnerType: { value: string; inferred: boolean };
  determinism: { value: 'deterministic' | 'dynamic' | 'unknown'; inferred: boolean };
  semanticFeatures: {
    values: Array<
      | 'mode-dispatch'
      | 'hitl'
      | 'provider-fallback'
      | 'filesystem-polling'
      | 'config-read'
      | 'task-spawn'
      | 'state-write'
    >;
    inferred: boolean;
  };
  isTopLevel: boolean;
};

export type AgentEntry = {
  id: string;
  path: string;
  hash: string;
  name: string;
  description: string;
  roleClass:
    | 'planner'
    | 'executor'
    | 'verifier'
    | 'researcher'
    | 'auditor'
    | 'mapper'
    | 'debugger'
    | 'ui'
    | 'unknown';
  allowedTools: string[];
  diskWriteMandate: boolean;
  worktreeRequired: boolean;
  outputArtifacts: string[];
  completionMarker?: string;
  color?: string;
};

export type HookEntry = {
  id: string;
  path: string;
  hash: string;
  kind: 'js' | 'shell' | 'unknown';
  installTargetClass: 'claude-hook' | 'codex-hook' | 'worker' | 'dist-only' | 'unknown';
  distPath?: string;
  distExists: boolean;
  executable: boolean;
};

export type CommandCategory = 'core-lifecycle'
  | 'composite'
  | 'query-utility'
  | 'single-agent-bounded'
  | 'dynamic-branch'
  | 'hard-outlier';

export type ClassificationEntry = {
  commandId: string;
  category: CommandCategory;
  workflowId: string | null;
  agentTypes: string[];
  determinismPosture: 'deterministic' | 'dynamic' | 'unknown';
  migrationDisposition: string;
  isHardOutlier: boolean;
  outlierPosture?: string;
};

export type BillingBoundaryReport = {
  entrypoints: string[];
  violations: Array<{
    entrypoint: string;
    importChain: string[];
    forbiddenModule: string;
  }>;
  clean: boolean;
};

export type CompileManifests = {
  commands: CommandEntry[];
  workflows: WorkflowEntry[];
  agents: AgentEntry[];
  hooks: HookEntry[];
  classification: ClassificationEntry[];
  billing: BillingBoundaryReport;
};

export type CompileReport = {
  counts: CompileCounts;
  manifests: CompileManifests;
  diagnostics: CompileDiagnostic[];
};
