import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLockFactory } from './mock-factories.js';
import {
  FsmStateError,
  acquireFsmLock,
  fsmStatePath,
  releaseFsmLock,
} from '../advisory/fsm-state.js';

describe('Parity: STATE.md mirror lock-conflict protection (mock seam)', () => {
  it('lock factory returns false (conflict) when behavior is conflict', async () => {
    const lock = makeLockFactory('conflict');
    const acquired = await lock.acquire();
    expect(acquired).toBe(false);
  });

  it('lock factory returns true (clean acquisition) when behavior is clean', async () => {
    const lock = makeLockFactory('clean');
    const acquired = await lock.acquire();
    expect(acquired).toBe(true);
  });

  it('lock factory returns false (stale conflict) when behavior is stale', async () => {
    const lock = makeLockFactory('stale');
    const acquired = await lock.acquire();
    expect(acquired).toBe(false);
  });
});

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('Parity: STATE.md mirror lock-conflict - real FSM lock path (acquireFsmLock)', () => {
  async function makeTempProject(): Promise<string> {
    const dir = join(tmpdir(), `gsd-fsm-lock-${process.pid}-${Date.now()}-${Math.random()}`);
    dirs.push(dir);
    await mkdir(join(dir, '.planning'), { recursive: true });
    return dir;
  }

  it('acquireFsmLock succeeds on a fresh temp .planning/ dir', async () => {
    const projectDir = await makeTempProject();
    const fsmPath = fsmStatePath(projectDir);
    const lockPath = await acquireFsmLock(fsmPath);
    expect(typeof lockPath).toBe('string');
    expect(lockPath).toContain('.lock');
    await releaseFsmLock(lockPath);
  });

  it('second acquireFsmLock without release throws FsmStateError with lock-conflict code', async () => {
    const projectDir = await makeTempProject();
    const fsmPath = fsmStatePath(projectDir);
    const lockPath1 = await acquireFsmLock(fsmPath);

    try {
      await acquireFsmLock(fsmPath);
      throw new Error('Expected second acquireFsmLock call to throw lock-conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(FsmStateError);
      expect((error as FsmStateError).code).toBe('lock-conflict');
    } finally {
      await releaseFsmLock(lockPath1);
    }
  }, 5000);

  it('releaseFsmLock then re-acquire succeeds (lock is freed)', async () => {
    const projectDir = await makeTempProject();
    const fsmPath = fsmStatePath(projectDir);
    const lockPath1 = await acquireFsmLock(fsmPath);
    await releaseFsmLock(lockPath1);

    const lockPath2 = await acquireFsmLock(fsmPath);
    expect(typeof lockPath2).toBe('string');
    await releaseFsmLock(lockPath2);
  });
});
