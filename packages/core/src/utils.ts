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

// Collectors run side by side and some freeze the main thread for a second or more (the first
// RTCPeerConnection, AudioContext...). That time must not count against a sibling's timeout, so a
// ticker measures how long the loop was blocked and timeouts are extended by exactly that.
let blockedMs = 0;
let watchers = 0;
let ticker: ReturnType<typeof setInterval> | undefined;
let lastTick = 0;
const TICK_MS = 25;

function watchBlocking(): () => void {
  if (watchers++ === 0) {
    lastTick = now();
    ticker = setInterval(() => {
      const t = now();
      const late = t - lastTick - TICK_MS;
      // A hidden tab has its timers throttled by the browser; that is not blocking by a sibling.
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (late > TICK_MS && !hidden) blockedMs += late;
      lastTick = t;
    }, TICK_MS);
  }
  return () => {
    if (--watchers === 0) clearInterval(ticker);
  };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const unwatch = watchBlocking();
    const baseline = blockedMs;
    let credited = 0;
    let t: ReturnType<typeof setTimeout>;
    const arm = (wait: number) => {
      t = setTimeout(() => {
        // The ticker may not have run yet if the block only just ended; check once more on the next turn.
        // Credit is capped at the original budget, so a misjudged stall can at most double the wait.
        const extra = Math.min(blockedMs - baseline - credited, ms - credited);
        if (extra > 0) {
          credited += extra;
          arm(extra);
        } else {
          unwatch();
          reject(new Error(label));
        }
      }, wait);
    };
    arm(ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        unwatch();
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        unwatch();
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
