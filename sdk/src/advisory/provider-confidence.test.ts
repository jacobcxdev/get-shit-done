import { describe, expect, it, vi } from 'vitest';
import {
  checkProviderAvailability,
  deriveConfidenceFromHistory,
  normalizeProviderList,
} from './provider-availability.js';

describe('provider confidence derivation', () => {
  it('normalizes provider lists with stable de-duplication and ordering', () => {
    expect(normalizeProviderList(['gemini', 'claude', 'gemini'])).toEqual(['claude', 'gemini']);
  });

  it('renders reduced confidence from missing provider history', () => {
    expect(deriveConfidenceFromHistory([
      {
        runId: 'run-1',
        fromState: 'verify',
        toState: 'p4-compliance',
        outcome: 'success',
        timestamp: '2026-04-28T00:00:00.000Z',
        configSnapshotHash: 'a'.repeat(64),
        reducedConfidence: true,
        missingProviders: ['gemini'],
      },
    ])).toBe('reduced:gemini');
  });

  it('renders blocked confidence from blocked provider history', () => {
    expect(deriveConfidenceFromHistory([
      {
        runId: 'run-1',
        fromState: 'verify',
        toState: 'blocked',
        outcome: 'blocked',
        timestamp: '2026-04-28T00:00:00.000Z',
        configSnapshotHash: 'a'.repeat(64),
        blockedProviders: ['gemini', 'codex'],
      },
    ])).toBe('blocked:codex,gemini');
  });

  it('derives confidence from history without calling a provider source mock', () => {
    const providerSource = vi.fn();

    expect(deriveConfidenceFromHistory([], { providerSource })).toBe('full');
    expect(providerSource).not.toHaveBeenCalled();
  });

  it('checks provider availability through an injected source', async () => {
    const source = vi.fn().mockResolvedValue({
      available: ['claude'],
      unavailable: ['gemini'],
    });

    await expect(checkProviderAvailability(['gemini', 'claude'], source)).resolves.toEqual({
      available: ['claude'],
      unavailable: ['gemini'],
    });
    expect(source).toHaveBeenCalledWith(['claude', 'gemini']);
  });
});
