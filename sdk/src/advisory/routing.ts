import { createHash } from 'node:crypto';
import { sortKeysDeep } from '../compile/baselines.js';

export type CodexEffort = 'low' | 'medium' | 'high' | 'xhigh';

export type ProviderTarget =
  | { kind: 'claude'; model: string }
  | { kind: 'codex'; model: string; effort: CodexEffort; config: Record<string, unknown> }
  | { kind: 'gemini'; model: string; config: Record<string, unknown> };

export type RoutingConfigIssue = {
  code: 'CONF-01' | 'CONF-02' | 'CONF-03';
  field: string;
  message: string;
};

export const VALID_CODEX_EFFORTS = new Set<CodexEffort>(['low', 'medium', 'high', 'xhigh']);
export const ROUTING_STEP_DELIMITER = '::' as const;

const AGENT_DEFAULT_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;
const CLAUDE_MODEL_ALIASES = new Set(['opus', 'sonnet', 'haiku']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  code: RoutingConfigIssue['code'],
  field: string,
  message: string,
): RoutingConfigIssue {
  return { code, field, message };
}

function providerConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function parseRoutingValue(value: string, config: Record<string, unknown>): ProviderTarget | null {
  if (value.startsWith('codex:')) {
    const effort = value.slice('codex:'.length);
    if (!VALID_CODEX_EFFORTS.has(effort as CodexEffort)) {
      return null;
    }
    return {
      kind: 'codex',
      model: String(config.codex_model),
      effort: effort as CodexEffort,
      config: providerConfig(config.codex_config),
    };
  }

  if (value === 'gemini') {
    return {
      kind: 'gemini',
      model: String(config.gemini_model),
      config: providerConfig(config.gemini_config),
    };
  }

  if (CLAUDE_MODEL_ALIASES.has(value)) {
    return { kind: 'claude', model: value };
  }

  return null;
}

function assertRoutingStepPart(name: string, value: string): void {
  if (value.trim() === '') {
    throw new Error(`${name} must be non-empty`);
  }
  if (value.includes(ROUTING_STEP_DELIMITER)) {
    throw new Error(`${name} must not contain ${ROUTING_STEP_DELIMITER}`);
  }
}

export function routingStepKey(agentId: string, workflowId: string, stepId: string): string {
  assertRoutingStepPart('agentId', agentId);
  assertRoutingStepPart('workflowId', workflowId);
  assertRoutingStepPart('stepId', stepId);
  return `${agentId}${ROUTING_STEP_DELIMITER}${workflowId}${ROUTING_STEP_DELIMITER}${stepId}`;
}

export function parseRoutingStepKey(key: string): { agentId: string; workflowId: string; stepId: string } | null {
  const parts = key.split(ROUTING_STEP_DELIMITER);
  if (parts.length !== 3 || parts.some((part) => part.trim() === '')) {
    return null;
  }
  const [agentId, workflowId, stepId] = parts;
  return { agentId, workflowId, stepId };
}

function routingMap(configSnapshot: Record<string, unknown>): Record<string, unknown> | null {
  const value = configSnapshot.agent_routing;
  return isRecord(value) ? value : null;
}

function parseRoutingEntry(
  routes: Record<string, unknown>,
  routeKey: string,
  configSnapshot: Record<string, unknown>,
): ProviderTarget | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(routes, routeKey)) {
    return undefined;
  }
  const value = routes[routeKey];
  return typeof value === 'string' ? parseRoutingValue(value, configSnapshot) : null;
}

export function resolveRoutingTarget(
  agentId: string,
  workflowId: string | null,
  stepId: string | null,
  configSnapshot: Record<string, unknown>,
): ProviderTarget | null {
  const routes = routingMap(configSnapshot);
  if (!routes) {
    return null;
  }

  if (workflowId !== null && stepId !== null) {
    const stepTarget = parseRoutingEntry(routes, routingStepKey(agentId, workflowId, stepId), configSnapshot);
    if (stepTarget !== undefined) {
      return stepTarget;
    }
  }

  const agentTarget = parseRoutingEntry(routes, agentId, configSnapshot);
  return agentTarget ?? null;
}

export function validateRoutingConfig(config: Record<string, unknown>): RoutingConfigIssue[] {
  const issues: RoutingConfigIssue[] = [];
  const routes = config.agent_routing;
  if (routes === undefined) {
    return issues;
  }
  if (!isRecord(routes)) {
    return [
      issue('CONF-01', 'agent_routing', 'agent_routing must be an object whose values are provider route strings'),
    ];
  }

  let hasCodexRoute = false;
  let hasGeminiRoute = false;

  for (const [key, value] of Object.entries(routes)) {
    const field = `agent_routing.${key}`;
    if (key.includes(ROUTING_STEP_DELIMITER)) {
      if (!parseRoutingStepKey(key)) {
        issues.push(issue('CONF-03', field, `step-scoped route key must use <agentId>${ROUTING_STEP_DELIMITER}<workflowId>${ROUTING_STEP_DELIMITER}<stepId>`));
      }
    } else if (!AGENT_DEFAULT_KEY_PATTERN.test(key)) {
      issues.push(issue('CONF-03', field, 'agent default route keys must match [a-zA-Z0-9_-]+'));
    }

    if (typeof value !== 'string') {
      issues.push(issue('CONF-01', field, 'route value must be a string'));
      continue;
    }

    if (value.startsWith('codex:')) {
      hasCodexRoute = true;
      const effort = value.slice('codex:'.length);
      if (!VALID_CODEX_EFFORTS.has(effort as CodexEffort)) {
        issues.push(issue('CONF-02', field, `codex effort must be one of ${[...VALID_CODEX_EFFORTS].join(', ')}`));
      }
      continue;
    }

    if (value === 'gemini') {
      hasGeminiRoute = true;
      continue;
    }

    if (!CLAUDE_MODEL_ALIASES.has(value)) {
      issues.push(issue('CONF-02', field, 'route value must be opus, sonnet, haiku, gemini, or codex:<low|medium|high|xhigh>'));
    }
  }

  if (hasCodexRoute) {
    if (typeof config.codex_model !== 'string') {
      issues.push(issue('CONF-01', 'codex_model', 'codex_model must be a string when codex routes are configured'));
    }
    if (config.codex_config !== undefined && !isRecord(config.codex_config)) {
      issues.push(issue('CONF-01', 'codex_config', 'codex_config must be an object when present'));
    }
  }

  if (hasGeminiRoute) {
    if (typeof config.gemini_model !== 'string') {
      issues.push(issue('CONF-01', 'gemini_model', 'gemini_model must be a string when gemini routes are configured'));
    }
    if (config.gemini_config !== undefined && !isRecord(config.gemini_config)) {
      issues.push(issue('CONF-01', 'gemini_config', 'gemini_config must be an object when present'));
    }
  }

  return issues;
}

export function configSnapshotHash(config: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortKeysDeep(config)), 'utf-8')
    .digest('hex');
}
