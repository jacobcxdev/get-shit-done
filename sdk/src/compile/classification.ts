/**
 * Command classification for gsd-sdk compile.
 * Assigns each command exactly one of six locked taxonomy categories.
 * Per CONTEXT D-19 through D-22, CLSS-01 through CLSS-04.
 *
 * The classification manifest is the audit source of truth for execution posture
 * and is consumed by billing-boundary checks. Per D-21.
 */

import { mkError } from './diagnostics.js';
import { DISK_WRITE_MANDATE_AGENTS } from './inventory/agents.js';
import type { ClassificationEntry, CommandCategory, CommandEntry, CompileDiagnostic } from './types.js';

export const CATEGORIES = [
  'core-lifecycle',
  'composite',
  'query-utility',
  'single-agent-bounded',
  'dynamic-branch',
  'hard-outlier',
] as const;

const [
  CORE_LIFECYCLE_CATEGORY,
  COMPOSITE_CATEGORY,
  QUERY_UTILITY_CATEGORY,
  SINGLE_AGENT_BOUNDED_CATEGORY,
  DYNAMIC_BRANCH_CATEGORY,
  HARD_OUTLIER_CATEGORY,
] = CATEGORIES;

/** Five seed hard outliers. Any command classified as hard-outlier that is NOT in this set
 * requires explicit posture evidence and causes a CLSS-04 hard-fail. Per D-22. */
export const SEED_HARD_OUTLIERS = new Set<string>([
  '/gsd-graphify',
  '/gsd-from-gsd2',
  '/gsd-ultraplan-phase',
  '/gsd-review',
  '/gsd-fast',
]);

const CORE_LIFECYCLE = new Set<string>([
  '/gsd-add-backlog',
  '/gsd-add-phase',
  '/gsd-add-tests',
  '/gsd-add-todo',
  '/gsd-analyze-dependencies',
  '/gsd-audit-uat',
  '/gsd-cleanup',
  '/gsd-complete-milestone',
  '/gsd-discuss-phase',
  '/gsd-edit-phase',
  '/gsd-execute-phase',
  '/gsd-extract_learnings',
  '/gsd-import',
  '/gsd-insert-phase',
  '/gsd-milestone-summary',
  '/gsd-new-milestone',
  '/gsd-new-project',
  '/gsd-new-workspace',
  '/gsd-note',
  '/gsd-pause-work',
  '/gsd-plan-milestone-gaps',
  '/gsd-plan-phase',
  '/gsd-plant-seed',
  '/gsd-pr-branch',
  '/gsd-remove-phase',
  '/gsd-remove-workspace',
  '/gsd-research-phase',
  '/gsd-resume-work',
  '/gsd-spec-phase',
  '/gsd-spike-wrap-up',
  '/gsd-sketch-wrap-up',
  '/gsd-ui-phase',
  '/gsd-undo',
  '/gsd-verify-work',
]);

const COMPOSITE = new Set<string>([
  '/gsd-ai-integration-phase',
  '/gsd-audit-fix',
  '/gsd-autonomous',
  '/gsd-docs-update',
  '/gsd-ingest-docs',
  '/gsd-quick',
  '/gsd-ship',
]);

const QUERY_UTILITY = new Set<string>([
  '/gsd-debug',
  '/gsd-health',
  '/gsd-help',
  '/gsd-intel',
  '/gsd-join-discord',
  '/gsd-list-phase-assumptions',
  '/gsd-list-workspaces',
  '/gsd-progress',
  '/gsd-reapply-patches',
  '/gsd-scan',
  '/gsd-session-report',
  '/gsd-set-profile',
  '/gsd-settings',
  '/gsd-stats',
  '/gsd-sync-skills',
  '/gsd-thread',
  '/gsd-update',
  '/gsd-workstreams',
]);

const SINGLE_AGENT_BOUNDED = new Set<string>([
  '/gsd-audit-milestone',
  '/gsd-code-review',
  '/gsd-code-review-fix',
  '/gsd-eval-review',
  '/gsd-map-codebase',
  '/gsd-profile-user',
  '/gsd-secure-phase',
  '/gsd-ui-review',
  '/gsd-validate-phase',
]);

const DYNAMIC_BRANCH = new Set<string>([
  '/gsd-check-todos',
  '/gsd-do',
  '/gsd-explore',
  '/gsd-forensics',
  '/gsd-inbox',
  '/gsd-manager',
  '/gsd-next',
  '/gsd-plan-review-convergence',
  '/gsd-review-backlog',
  '/gsd-settings-advanced',
  '/gsd-settings-integrations',
  '/gsd-sketch',
  '/gsd-spike',
]);

export const CATEGORY_RULES: Array<{ category: CommandCategory; ids: ReadonlySet<string> }> = [
  { category: HARD_OUTLIER_CATEGORY, ids: SEED_HARD_OUTLIERS },
  { category: CORE_LIFECYCLE_CATEGORY, ids: CORE_LIFECYCLE },
  { category: COMPOSITE_CATEGORY, ids: COMPOSITE },
  { category: QUERY_UTILITY_CATEGORY, ids: QUERY_UTILITY },
  { category: SINGLE_AGENT_BOUNDED_CATEGORY, ids: SINGLE_AGENT_BOUNDED },
  { category: DYNAMIC_BRANCH_CATEGORY, ids: DYNAMIC_BRANCH },
];

const DETERMINISM_BY_CATEGORY: Record<CommandCategory, ClassificationEntry['determinismPosture']> = {
  [CORE_LIFECYCLE_CATEGORY]: 'deterministic',
  [COMPOSITE_CATEGORY]: 'unknown',
  [QUERY_UTILITY_CATEGORY]: 'deterministic',
  [SINGLE_AGENT_BOUNDED_CATEGORY]: 'deterministic',
  [DYNAMIC_BRANCH_CATEGORY]: 'dynamic',
  [HARD_OUTLIER_CATEGORY]: 'dynamic',
};

const MIGRATION_DISPOSITION_BY_CATEGORY: Record<CommandCategory, string> = {
  [CORE_LIFECYCLE_CATEGORY]: 'standard',
  [COMPOSITE_CATEGORY]: 'composite-review',
  [QUERY_UTILITY_CATEGORY]: 'advisory-passthrough',
  [SINGLE_AGENT_BOUNDED_CATEGORY]: 'bounded-agent',
  [DYNAMIC_BRANCH_CATEGORY]: 'dynamic-review',
  [HARD_OUTLIER_CATEGORY]: 'manual-posture-required',
};

export function matchingCategoriesForCommand(
  commandId: string,
  rules: Array<{ category: CommandCategory; ids: ReadonlySet<string> }> = CATEGORY_RULES,
): CommandCategory[] {
  return rules.filter((rule) => rule.ids.has(commandId)).map((rule) => rule.category);
}

function firstCategoryInTaxonomyOrder(matches: CommandCategory[]): CommandCategory {
  return CATEGORIES.find((category) => matches.includes(category)) ?? HARD_OUTLIER_CATEGORY;
}

function agentTypesForCommand(command: CommandEntry): string[] {
  if (!command.agent) return [];
  const isAuditedDiskWriteAgent = DISK_WRITE_MANDATE_AGENTS.has(command.agent);
  return isAuditedDiskWriteAgent ? [command.agent] : [command.agent];
}

export function classifyCommands(
  commands: CommandEntry[],
  diagnostics: CompileDiagnostic[],
  rules: Array<{ category: CommandCategory; ids: ReadonlySet<string> }> = CATEGORY_RULES,
): ClassificationEntry[] {
  const entries = commands.map((command): ClassificationEntry => {
    const matches = matchingCategoriesForCommand(command.id, rules);
    let category: CommandCategory;

    if (matches.length === 0) {
      diagnostics.push(
        mkError('CLSS-04', 'command', command.id, command.path, `unclassifiable command: ${command.id}`, {
          hint: `assign exactly one of: ${CATEGORIES.join(', ')}`,
        }),
      );
      category = HARD_OUTLIER_CATEGORY;
    } else if (matches.length > 1) {
      diagnostics.push(
        mkError(
          'CLSS-04',
          'command',
          command.id,
          command.path,
          `command matches multiple taxonomy categories: ${matches.join(', ')}`,
          {
            field: 'category',
            hint: 'each command must match exactly one taxonomy category per CLSS-01',
          },
        ),
      );
      category = firstCategoryInTaxonomyOrder(matches);
    } else {
      category = matches[0] ?? HARD_OUTLIER_CATEGORY;
    }

    const isHardOutlier = category === HARD_OUTLIER_CATEGORY;
    if (isHardOutlier && !SEED_HARD_OUTLIERS.has(command.id)) {
      diagnostics.push(
        mkError(
          'CLSS-04',
          'command',
          command.id,
          command.path,
          `hard-outlier command ${command.id} is not in the seed set; add explicit posture, migration disposition, and manifest evidence`,
          { hint: 'see CONTEXT D-22' },
        ),
      );
    }

    return {
      commandId: command.id,
      category,
      workflowId: command.workflowRef ?? null,
      agentTypes: agentTypesForCommand(command),
      determinismPosture: DETERMINISM_BY_CATEGORY[category],
      migrationDisposition: MIGRATION_DISPOSITION_BY_CATEGORY[category],
      isHardOutlier,
      ...(SEED_HARD_OUTLIERS.has(command.id) ? { outlierPosture: 'seed-outlier' } : {}),
    };
  });

  return entries.sort((a, b) => a.commandId.localeCompare(b.commandId));
}
