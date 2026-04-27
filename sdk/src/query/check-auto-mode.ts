/**
 * Consolidated auto-advance flags (`check.auto-mode`).
 *
 * Replaces paired config reads for checkpoint and auto-advance gates.
 * Auto-chain state is scoped to FSM `autoMode`; user preference still comes
 * from `workflow.auto_advance`.
 *
 * Semantics match `execute-phase.md`: automation applies when **either** the ephemeral chain flag
 * or the persistent user preference is true (`active === true`).
 */

import { readFile } from 'node:fs/promises';
import { FsmStateError, fsmStatePath, type FsmRunState } from '../advisory/fsm-state.js';
import { CONFIG_DEFAULTS, loadConfig } from '../config.js';
import type { QueryHandler } from './utils.js';

export type AutoModeSource = 'auto_chain' | 'auto_advance' | 'both' | 'none';

function resolveSource(
  autoChainActive: boolean,
  autoAdvance: boolean,
): { active: boolean; source: AutoModeSource } {
  if (autoChainActive && autoAdvance) {
    return { active: true, source: 'both' };
  }
  if (autoChainActive) {
    return { active: true, source: 'auto_chain' };
  }
  if (autoAdvance) {
    return { active: true, source: 'auto_advance' };
  }
  return { active: false, source: 'none' };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function readFsmAutoChainActive(projectDir: string, workstream?: string): Promise<boolean> {
  const path = fsmStatePath(projectDir, workstream);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw new FsmStateError('read-failed', `Failed to read FSM autoMode: ${String(error)}`);
  }

  let parsed: FsmRunState;
  try {
    parsed = JSON.parse(raw) as FsmRunState;
  } catch (error) {
    throw new FsmStateError('read-failed', `Failed to parse FSM autoMode: ${String(error)}`);
  }

  const source = parsed.autoMode?.source;
  return Boolean(parsed.autoMode?.active && (source === 'auto_chain' || source === 'both'));
}

export const checkAutoMode: QueryHandler = async (args, projectDir, workstream) => {
  const targetWorkstream = workstream ?? args[0];
  const config = await loadConfig(projectDir, targetWorkstream);
  const wf: Record<string, unknown> = {
    ...CONFIG_DEFAULTS.workflow,
    ...(config.workflow as unknown as Record<string, unknown>),
  };
  const autoAdvance = Boolean(wf.auto_advance ?? false);
  const autoChainActive = await readFsmAutoChainActive(projectDir, targetWorkstream);
  const { active, source } = resolveSource(autoChainActive, autoAdvance);

  return {
    data: {
      active,
      source,
      auto_chain_active: autoChainActive,
      auto_advance: autoAdvance,
    },
  };
};
