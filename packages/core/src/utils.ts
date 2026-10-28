/* eslint-disable @typescript-eslint/no-explicit-any */

export const clamp = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, n));

export const round = (n: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const hasWindow = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

export const nav = (): any => (typeof navigator !== 'undefined' ? (navigator as any) : {});

export function mq(query: string): boolean | null {
  try {
    if (typeof matchMedia !== 'function') return null;
    return matchMedia(query).matches;
  } catch {
    return null;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export type Result<T> = { ok: true; value: T; ms: number } | { ok: false; error: string; ms: number };

/** Run a collector without ever throwing; failures become data. */
export async function safe<T>(fn: () => T | Promise<T>, timeoutMs = 3000): Promise<Result<T>> {
  let start = now();
  let end = 0;
  try {
    // Clock and timeout both start when fn actually begins, not while it is queued behind sibling
    // collectors that block the main thread.
    const value = await Promise.resolve().then(() => {
      start = now();
      const v = fn();
      if (v instanceof Promise) return withTimeout(v.finally(() => (end = now())), timeoutMs);
      end = now();
      return v;
    });
    return { ok: true, value, ms: round(end - start, 1) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: round((end || now()) - start, 1) };
  }
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** JSON.stringify with sorted keys, so equal data always hashes equally. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

export function majorOf(version: string | null | undefined): number | null {
  if (!version) return null;
  const n = parseInt(version, 10);
  return Number.isNaN(n) ? null : n;
}
