import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import {
  parseRoutingStepKey,
  parseRoutingValue,
  resolveRoutingTarget,
  routingStepKey,
  validateRoutingConfig,
} from './routing.js';

describe('routing provider targets', () => {
  it('parses codex:high into a typed Codex target', () => {
    expect(parseRoutingValue('codex:high', {
      codex_model: 'gpt-5.5',
      codex_config: { sandbox: 'workspace-write' },
    })).toEqual({
      kind: 'codex',
      model: 'gpt-5.5',
      effort: 'high',
      config: { sandbox: 'workspace-write' },
    });
  });

  it('rejects invalid Codex efforts', () => {
    expect(parseRoutingValue('codex:invalid', { codex_model: 'gpt-5.5' })).toBeNull();
    expect(validateRoutingConfig({
      agent_routing: { 'gsd-planner': 'codex:invalid' },
      codex_model: 'gpt-5.5',
    })).toContainEqual(expect.objectContaining({
      code: 'CONF-02',
      field: 'agent_routing.gsd-planner',
    }));
  });

  it('validates malformed startup fields with CONF codes', () => {
    expect(validateRoutingConfig({ agent_routing: 'codex:high' })).toContainEqual(expect.objectContaining({
      code: 'CONF-01',
      field: 'agent_routing',
    }));
    expect(validateRoutingConfig({ agent_routing: { 'gsd-planner': 'codex:high' } })).toContainEqual(expect.objectContaining({
      code: 'CONF-01',
      field: 'codex_model',
    }));
  });
});

describe('routing step keys', () => {
  it('uses exact step override precedence over agent defaults', () => {
    const config = {
      codex_model: 'gpt-5.5',
      codex_config: {},
      agent_routing: {
        'gsd-planner': 'sonnet',
        'gsd-planner::/workflows/plan.phase.md::check': 'codex:xhigh',
      },
    };

    expect(resolveRoutingTarget('gsd-planner', '/workflows/plan.phase.md', 'check', config)).toEqual({
      kind: 'codex',
      model: 'gpt-5.5',
      effort: 'xhigh',
      config: {},
    });
  });

  it('falls back to the agent default when no step override exists', () => {
    expect(resolveRoutingTarget('gsd-planner', '/workflows/other.md', 'check', {
      agent_routing: { 'gsd-planner': 'sonnet' },
    })).toEqual({ kind: 'claude', model: 'sonnet' });
  });

  it('reports malformed step keys as startup issues', () => {
    expect(validateRoutingConfig({
      agent_routing: { 'gsd-planner::/workflows/plan.phase.md': 'sonnet' },
    })).toContainEqual(expect.objectContaining({
      code: 'CONF-03',
      field: 'agent_routing.gsd-planner::/workflows/plan.phase.md',
    }));
  });

  it('preserves dotted workflow ids in step keys', () => {
    const key = routingStepKey('gsd-planner', 'workflow.v2.plan.md', 'check');
    expect(key).toBe('gsd-planner::workflow.v2.plan.md::check');
    expect(parseRoutingStepKey(key)).toEqual({
      agentId: 'gsd-planner',
      workflowId: 'workflow.v2.plan.md',
      stepId: 'check',
    });
  });

  it('preserves /workflows paths and slashes in workflow ids', () => {
    const key = routingStepKey('gsd-planner', '/workflows/plan.phase.md', 'check');
    expect(key).toBe('gsd-planner::/workflows/plan.phase.md::check');
    expect(parseRoutingStepKey(key)).toEqual({
      agentId: 'gsd-planner',
      workflowId: '/workflows/plan.phase.md',
      stepId: 'check',
    });
  });
});

describe('routing config defaults', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtempProject();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('preserves current migration planning-artifact constraints through defaults merge', async () => {
    await writeFile(join(tmpDir, '.planning', 'config.json'), JSON.stringify({
      agent_routing: { 'gsd-executor': 'codex:xhigh' },
      codex_model: 'gpt-5.5',
      commit_docs: false,
      constraints: {
        commit_planning_artifacts: false,
        planning_artifacts_ignored: true,
      },
    }));

    const config = await loadConfig(tmpDir);

    expect(config.commit_docs).toBe(false);
    expect(config.constraints).toEqual({
      commit_planning_artifacts: false,
      planning_artifacts_ignored: true,
    });
    expect(config.codex_config).toEqual({});
    expect(config.gemini_config).toEqual({});
  });
});

async function mkdtempProject(): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-routing-'));
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
  return tmpDir;
}
