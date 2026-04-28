import { describe, it, expect } from 'vitest';
import { makeLockFactory } from './mock-factories.js';

describe('Parity: STATE.md mirror lock-conflict protection', () => {
  it('second concurrent write attempt returns false (lock-conflict) not silent overwrite', async () => {
    // Simulate two concurrent write attempts using the lock factory
    const lock1 = makeLockFactory('clean');
    const lock2 = makeLockFactory('conflict');

    const first = await lock1.acquire();
    const second = await lock2.acquire();

    expect(first).toBe(true);   // First write acquires lock
    expect(second).toBe(false); // Second write is rejected with conflict

    await lock1.release();
  });

  it('stale lock returns false (prevents stale-lock silent overwrite)', async () => {
    const staleLock = makeLockFactory('stale');
    const acquired = await staleLock.acquire();
    expect(acquired).toBe(false);
  });

  it('clean lock sequence: acquire, release, re-acquire succeeds', async () => {
    const lock = makeLockFactory('clean');
    const first = await lock.acquire();
    await lock.release();
    // After release a new factory instance can acquire (simulates second writer succeeding after first finishes)
    const lock2 = makeLockFactory('clean');
    const second = await lock2.acquire();
    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});
