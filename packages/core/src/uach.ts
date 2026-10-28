import type { ClientHints } from './types';
import { nav, withTimeout } from './utils';

const HIGH_ENTROPY = [
  'platformVersion',
  'architecture',
  'bitness',
  'model',
  'uaFullVersion',
  'fullVersionList',
  'wow64',
  'formFactors',
];

/**
 * Read User-Agent Client Hints (Chromium only). Low-entropy values are synchronous; the
 * high-entropy ones are requested with a timeout and silently skipped when unavailable.
 */
export async function readClientHints(withHighEntropy = true, timeoutMs = 800): Promise<ClientHints | null> {
  const data = nav().userAgentData;
  if (!data) return null;

  const hints: ClientHints = {
    brands: (data.brands ?? []).map((b: { brand: string; version: string }) => ({ brand: b.brand, version: b.version })),
    mobile: typeof data.mobile === 'boolean' ? data.mobile : null,
    platform: data.platform || null,
  };

  if (withHighEntropy && typeof data.getHighEntropyValues === 'function') {
    try {
      const hi = await withTimeout<Record<string, unknown>>(data.getHighEntropyValues(HIGH_ENTROPY), timeoutMs);
      Object.assign(hints, hi);
    } catch {
      /* denied by Permissions-Policy or timed out: keep low-entropy data */
    }
  }
  return hints;
}

/** Real Chromium brand, ignoring the GREASE entry ("Not A;Brand") and the generic "Chromium". */
export function primaryBrand(hints: ClientHints | null): { brand: string; version: string } | null {
  const list = hints?.fullVersionList?.length ? hints.fullVersionList : hints?.brands ?? [];
  const real = list.filter((b) => !/not.?a.?brand|^chromium$/i.test(b.brand));
  return real[0] ?? list.find((b) => /^chromium$/i.test(b.brand)) ?? null;
}
