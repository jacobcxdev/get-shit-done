import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  fsmStatePath,
  FsmStateError,
  advanceFsmState,
} from '../advisory/fsm-state.js';

// PRTY-03: filesystem-fallback parity test.
// Runs offline, repo-contained, uses the FSM/runner path directly.
// Asserts that when the FSM state file or its parent directory is absent,
// the runner returns a typed FsmStateError with a known fallback code
// rather than crashing with an unhandled rejection.

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true })));
});

async function makeTempProject(): Promise<string> {
  const dir = join(tmpdir(), `gsd-fs-fallback-${process.pid}-${Date.now()}-${Math.random()}`);
  dirs.push(dir);
  return dir;
}

describe('Parity: filesystem-fallback - FSM state absent (PRTY-03)', () => {
  it('advanceFsmState throws FsmStateError with init-required when .planning/ dir is absent', async () => {
    const projectDir = await makeTempProject();
    // Do NOT create .planning/ - simulates a fresh project with no FSM state
    await expect(
      advanceFsmState({
        projectDir,
        toState: 'plan',
        outcome: 'success',
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof FsmStateError && err.code === 'init-required',
    );
  });

  it('advanceFsmState throws FsmStateError with init-required when fsm-state.json is absent but .planning/ exists', async () => {
    const projectDir = await makeTempProject();
    // Create .planning/ dir but no fsm-state.json - simulates init not yet run
    await mkdir(join(projectDir, '.planning'), { recursive: true });
    await expect(
      advanceFsmState({
        projectDir,
        toState: 'plan',
        outcome: 'success',
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof FsmStateError &&
        (err.code === 'init-required' || err.code === 'read-failed'),
    );
  });

  it('fsmStatePath returns a deterministic posix path for a given projectDir', () => {
    // Offline: no filesystem access - just tests the path computation
    const path = fsmStatePath('/tmp/test-project');
    expect(path).toContain('.planning');
    expect(path).toContain('fsm-state.json');
    expect(path).not.toContain('\\'); // posix path
  });
});
