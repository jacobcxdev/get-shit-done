export type BuiltInProviderName = 'claude' | 'codex' | 'gemini';
export type ProviderName = BuiltInProviderName | (string & {});

export type ProviderAvailabilityResult = {
  available: ProviderName[];
  unavailable: ProviderName[];
};

export type ProviderStatusSource = {
  check(providers: ProviderName[]): Promise<ProviderAvailabilityResult>;
};

// Tests inject ProviderStatusSource; Phase 3 intentionally exports no production provider source.
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

export type ProviderAvailabilityCheck = {
  providerName: string;
  check: () => ProviderAvailabilityResult;
};

const PROVIDER_ORDER: BuiltInProviderName[] = ['claude', 'codex', 'gemini'];
const BUILT_IN_PROVIDER_NAMES = new Set<string>(PROVIDER_ORDER);

export function normalizeProviderList(providers: readonly unknown[]): ProviderName[] {
  const seen = new Set<string>();
  for (const provider of providers) {
    if (typeof provider === 'string' && provider.trim() !== '') {
      seen.add(provider.trim());
    }
  }
  const builtIns = PROVIDER_ORDER.filter(p => seen.has(p));
  const customs = [...seen]
    .filter(name => !BUILT_IN_PROVIDER_NAMES.has(name))
    .sort();
  return [...builtIns, ...customs];
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

export function composeProviderAvailability(
  base: ProviderAvailabilityResult | undefined,
  checks: readonly ProviderAvailabilityCheck[],
): ProviderAvailabilityResult | undefined {
  if (base === undefined && checks.length === 0) {
    return undefined;
  }

  const unavailableSet = new Set<string>();
  const availableSet = new Set<string>();

  if (base !== undefined) {
    for (const p of normalizeProviderList(base.unavailable)) {
      unavailableSet.add(p);
    }
    for (const p of normalizeProviderList(base.available)) {
      availableSet.add(p);
    }
  }

  for (const checkEntry of checks) {
    let result: ProviderAvailabilityResult;
    try {
      result = checkEntry.check();
    } catch {
      unavailableSet.add(checkEntry.providerName);
      availableSet.delete(checkEntry.providerName);
      continue;
    }
    for (const p of normalizeProviderList(result.unavailable)) {
      unavailableSet.add(p);
      availableSet.delete(p);
    }
    for (const p of normalizeProviderList(result.available)) {
      if (!unavailableSet.has(p)) {
        availableSet.add(p);
      }
    }
  }

  return {
    available: normalizeProviderList([...availableSet].filter(p => !unavailableSet.has(p))),
    unavailable: normalizeProviderList([...unavailableSet]),
  };
}
