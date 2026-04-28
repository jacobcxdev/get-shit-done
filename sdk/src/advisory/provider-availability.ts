export type ProviderName = 'claude' | 'codex' | 'gemini';

export type ProviderAvailabilityResult = {
  available: ProviderName[];
  unavailable: ProviderName[];
};

export type ProviderStatusSource = {
  check(providers: ProviderName[]): Promise<ProviderAvailabilityResult>;
};

export type ProviderConfidenceKind = 'full' | 'reduced' | 'blocked';
export type ProviderConfidence = 'full' | `reduced:${string}` | `blocked:${string}`;

export type ProviderTransitionMetadata = {
  providerConfidence: ProviderConfidenceKind;
  missingProviders: ProviderName[];
};

export type ProviderConfidenceHistoryEntry = {
  reducedConfidence?: boolean;
  missingProvider?: string;
  missingProviders?: string[];
  blockedProviders?: string[];
  providerConfidence?: ProviderConfidenceKind;
};

const PROVIDER_ORDER: ProviderName[] = ['claude', 'codex', 'gemini'];

function isProviderName(value: unknown): value is ProviderName {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

export function normalizeProviderList(providers: readonly unknown[]): ProviderName[] {
  const seen = new Set<ProviderName>();
  for (const provider of providers) {
    if (isProviderName(provider)) {
      seen.add(provider);
    }
  }
  return PROVIDER_ORDER.filter(provider => seen.has(provider));
}

export function renderConfidence(
  kind: ProviderConfidenceKind,
  providers: readonly unknown[] = [],
): ProviderConfidence {
  if (kind === 'full') return 'full';
  const providersText = normalizeProviderList(providers).join(',');
  if (kind === 'blocked') return `blocked:${providersText}`;
  return `reduced:${providersText}`;
}

function missingProvidersFor(entry: ProviderConfidenceHistoryEntry): ProviderName[] {
  return normalizeProviderList([
    ...(entry.missingProvider ? [entry.missingProvider] : []),
    ...(entry.missingProviders ?? []),
    ...(entry.blockedProviders ?? []),
  ]);
}

export function deriveConfidenceFromHistory(
  history: readonly ProviderConfidenceHistoryEntry[],
  _options?: { providerSource?: unknown },
): ProviderConfidence {
  let reducedProviders: ProviderName[] = [];

  for (const entry of history) {
    const missingProviders = missingProvidersFor(entry);
    if (entry.providerConfidence === 'blocked' || entry.blockedProviders !== undefined) {
      return renderConfidence('blocked', missingProviders);
    }
    if (
      entry.reducedConfidence === true ||
      entry.providerConfidence === 'reduced'
    ) {
      reducedProviders = normalizeProviderList([...reducedProviders, ...missingProviders]);
    }
  }

  if (reducedProviders.length > 0) {
    return renderConfidence('reduced', reducedProviders);
  }
  return 'full';
}

export async function checkProviderAvailability(
  providers: readonly unknown[],
  source: ProviderStatusSource | ((providers: ProviderName[]) => Promise<ProviderAvailabilityResult>),
): Promise<ProviderAvailabilityResult> {
  const requestedProviders = normalizeProviderList(providers);
  const result = typeof source === 'function'
    ? await source(requestedProviders)
    : await source.check(requestedProviders);

  return {
    available: normalizeProviderList(result.available),
    unavailable: normalizeProviderList(result.unavailable),
  };
}
