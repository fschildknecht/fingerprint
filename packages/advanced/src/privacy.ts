/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, round } from '@fingerprint/core';
import type { LightResult } from '@fingerprint/light';
import type { Collector } from './collectors/types';

// ---------------------------------------------------------------------------
// Private / incognito window
// ---------------------------------------------------------------------------

export interface PrivateModeResult {
  /** null when this browser gives no usable signal. */
  isPrivate: boolean | null;
  confidence: number;
  browser: 'chromium' | 'firefox' | 'safari' | 'unknown';
  method: string;
  detail: Record<string, unknown>;
}

function family(): PrivateModeResult['browser'] {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) return 'firefox';
  if (/Chrome\/|Chromium\/|CriOS\/|Edg\//.test(ua) || nav().userAgentData) return 'chromium';
  if (/Safari\//.test(ua) && /Apple/.test(nav().vendor ?? '')) return 'safari';
  return 'unknown';
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e ?? ''));

/** Median of strict/relaxed commit-time ratios. Pure, so the decision rule can be unit-tested. */
export function classifyDurability(ratios: number[]): { isPrivate: boolean; median: number; confidence: number } {
  const sorted = [...ratios].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  // In-memory storage makes fsync free: ratio ~1. On disk strict commits cost ~2-3x.
  const isPrivate = median < 1.3;
  // Confidence falls as the median approaches the threshold from either side.
  const confidence = isPrivate ? (median <= 1.15 ? 0.88 : 0.7) : median >= 1.8 ? 0.88 : 0.65;
  return { isPrivate, median: Math.round(median * 100) / 100, confidence };
}

/**
 * Chromium incognito keeps IndexedDB in memory (LevelDB "memenv"), so a durability:"strict"
 * commit costs the same as a "relaxed" one. In a normal profile strict commits wait for the disk.
 * We compare both on the same database, alternating order, and use the median ratio.
 * Abstains (null) if the browser ignores the durability hint.
 */
async function chromiumDurabilityTest(): Promise<{ ratios: number[] } | null> {
  const name = '__fp_durability_' + Math.random().toString(36).slice(2);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('s');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const WRITES = 15;
  const write = (durability: IDBTransactionDurability, i: number) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction('s', 'readwrite', { durability });
      if ((tx as any).durability !== durability) return reject(new Error('durability-ignored'));
      tx.objectStore('s').put(i, 'k' + i);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  const time = async (d: IDBTransactionDurability) => {
    const t0 = performance.now();
    for (let i = 0; i < WRITES; i++) await write(d, i);
    return performance.now() - t0;
  };

  const ratios: number[] = [];
  const t0 = performance.now();
  try {
    for (let round = 0; round < 15; round++) {
      let strict: number;
      let relaxed: number;
      if (round % 2) {
        relaxed = await time('relaxed');
        strict = await time('strict');
      } else {
        strict = await time('strict');
        relaxed = await time('relaxed');
      }
      if (relaxed > 0) ratios.push(strict / relaxed);
      if (round >= 6 && performance.now() - t0 > 1000) break; // enough evidence, stay fast
    }
  } catch (e) {
    return null; // includes "durability-ignored": the test would be meaningless
  } finally {
    db.close();
    indexedDB.deleteDatabase(name);
  }
  return ratios.length >= 5 ? { ratios } : null;
}

/** Firefox: the OPFS throws a "Security error" in private windows; older builds fail IndexedDB with InvalidStateError. */
async function firefoxTest(n: any): Promise<PrivateModeResult> {
  const browser = 'firefox' as const;
  if (typeof n.storage?.getDirectory === 'function') {
    try {
      await n.storage.getDirectory();
      return { isPrivate: false, confidence: 0.85, browser, method: 'opfs', detail: {} };
    } catch (e) {
      const isPrivate = msg(e).includes('Security error');
      return isPrivate
        ? { isPrivate: true, confidence: 0.85, browser, method: 'opfs', detail: {} }
        : { isPrivate: null, confidence: 0, browser, method: 'opfs', detail: { reason: 'unexpected OPFS error: ' + msg(e) } };
    }
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('inPrivate');
      req.onerror = () => {
        // Only InvalidStateError means private; quota or profile errors are not evidence.
        const isPrivate = req.error?.name === 'InvalidStateError';
        resolve({ isPrivate: isPrivate ? true : null, confidence: isPrivate ? 0.75 : 0, browser, method: 'indexeddb', detail: { error: req.error?.name } });
      };
      req.onsuccess = () => {
        req.result.close();
        indexedDB.deleteDatabase('inPrivate');
        resolve({ isPrivate: false, confidence: 0.75, browser, method: 'indexeddb', detail: {} });
      };
    } catch (e) {
      resolve({ isPrivate: null, confidence: 0, browser, method: 'indexeddb', detail: { error: msg(e) } });
    }
  });
}

/** Safari: three generations of private-mode quirks, picked by which API exists. */
async function safariTest(n: any): Promise<PrivateModeResult> {
  const browser = 'safari' as const;
  const res = (isPrivate: boolean | null, method: string, confidence: number, detail: Record<string, unknown> = {}) => ({ isPrivate, confidence, browser, method, detail });

  if (typeof n.storage?.getDirectory === 'function') {
    // Safari 17+
    try {
      await n.storage.getDirectory();
      return res(false, 'opfs', 0.8);
    } catch (e) {
      return msg(e).includes('unknown transient reason') ? res(true, 'opfs', 0.8) : res(null, 'opfs', 0, { reason: 'unexpected OPFS error: ' + msg(e) });
    }
  }
  if (n.maxTouchPoints !== undefined && typeof indexedDB !== 'undefined') {
    // Safari 13-18: IndexedDB refuses to store a Blob in private windows
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('__fp_blob__');
        req.onupgradeneeded = () => req.result.createObjectStore('s');
        req.onerror = () => resolve(res(null, 'idb-blob', 0, { error: req.error?.name }));
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('s', 'readwrite');
            tx.objectStore('s').put(new Blob(['x']), 'k');
            tx.oncomplete = () => {
              db.close();
              indexedDB.deleteDatabase('__fp_blob__');
              resolve(res(false, 'idb-blob', 0.75));
            };
            tx.onerror = tx.onabort = () => {
              db.close();
              resolve(msg(tx.error).includes('are not yet supported') ? res(true, 'idb-blob', 0.75) : res(null, 'idb-blob', 0));
            };
          } catch (e) {
            db.close();
            resolve(msg(e).includes('are not yet supported') ? res(true, 'idb-blob', 0.75) : res(null, 'idb-blob', 0));
          }
        };
      } catch (e) {
        resolve(res(null, 'idb-blob', 0, { error: msg(e) }));
      }
    });
  }
  // Legacy Safari: Web SQL and localStorage throw in private mode
  try {
    (window as any).openDatabase?.(null, null, null, null);
    localStorage.setItem('__fp__', '1');
    localStorage.removeItem('__fp__');
    return res(false, 'legacy', 0.6);
  } catch {
    return res(true, 'legacy', 0.6);
  }
}

/**
 * Detect incognito / private windows. There is no API for it and browsers keep closing the gaps,
 * so every method is a side-channel and the result is a probability, not a fact. Approach follows
 * the techniques documented by detectIncognito.js (reimplemented here, not copied):
 *  - Chromium: IndexedDB commit-durability timing (in-memory in incognito).
 *  - Firefox: Origin Private File System "Security error" / IndexedDB InvalidStateError.
 *  - Safari: OPFS "unknown transient reason", IndexedDB Blob refusal, Web SQL / localStorage.
 * Tested on Chrome and Edge 155 against real off-the-record contexts. Firefox and Safari are untested here.
 */
export const privateMode: Collector = {
  id: 'privateMode',
  stable: false,
  exclusive: true,
  bits: 1,
  timeoutMs: 5000,
  async run(): Promise<PrivateModeResult> {
    const browser = family();
    const n = nav();

    if (browser === 'chromium') {
      const test = typeof indexedDB !== 'undefined' ? await chromiumDurabilityTest().catch(() => null) : null;
      if (!test) {
        return { isPrivate: null, confidence: 0, browser, method: 'idb-durability', detail: { reason: 'durability hint ignored or IndexedDB unavailable' } };
      }
      const { isPrivate, median, confidence } = classifyDurability(test.ratios);
      const detail = { medianRatio: median, rounds: test.ratios.length, threshold: 1.3 };
      if (isPrivate) {
        // A fast disk or a momentary lull can make one normal-profile run look in-memory. Real
        // incognito is consistent, so a "private" verdict must survive a second, independent run.
        const again = await chromiumDurabilityTest().catch(() => null);
        const second = again ? classifyDurability(again.ratios) : null;
        if (!second?.isPrivate) {
          return { isPrivate: null, confidence: 0, browser, method: 'idb-durability', detail: { ...detail, secondMedianRatio: second?.median ?? null, reason: 'confirmation run disagreed' } };
        }
        return { isPrivate, confidence, browser, method: 'idb-durability', detail: { ...detail, secondMedianRatio: second.median } };
      }
      return { isPrivate, confidence, browser, method: 'idb-durability', detail };
    }
    if (browser === 'firefox') return firefoxTest(n);
    if (browser === 'safari') return safariTest(n);
    return { isPrivate: null, confidence: 0, browser, method: 'none', detail: {} };
  },
};

// ---------------------------------------------------------------------------
// Tor Browser
// ---------------------------------------------------------------------------

export interface TorSignal {
  id: string;
  weight: number;
  detail: string;
}

export interface TorAnalysis {
  /** Tor Browser, or its twin Mullvad Browser: both ship the same fingerprint by design. */
  isTor: boolean;
  /** 0..1 */
  score: number;
  signals: TorSignal[];
}

/**
 * Tor Browser is Firefox ESR with privacy.resistFingerprinting, which leaves very recognisable
 * traces: a frozen Windows UA on every OS, UTC, 2 cores, window size snapped to 200x100 steps
 * (letterboxing), screen == window, coarse timers.
 *
 * This detects the *browser*. Whether traffic really exits via Tor is only visible server-side
 * (compare the IP with the public exit-node list).
 */
export interface TorEnv {
  userAgent: string;
  hardwareConcurrency: number | null;
  languages: string[];
}

export function detectTor(light: LightResult, c: Record<string, any>, env?: TorEnv): TorAnalysis {
  const signals: TorSignal[] = [];
  if (light.browser.engine !== 'Gecko') return { isTor: false, score: 0, signals };

  const n = nav();
  const e: TorEnv = env ?? { userAgent: n.userAgent ?? '', hardwareConcurrency: n.hardwareConcurrency ?? null, languages: Array.from(n.languages ?? []) };
  const add = (id: string, weight: number, detail: string) => signals.push({ id, weight, detail });

  if (/^Mozilla\/5\.0 \(Windows NT 10\.0; rv:\d+\.0\) Gecko\/20100101 Firefox\/\d+\.0$/.test(e.userAgent)) {
    add('frozen-ua', 0.25, 'UA is the fixed resistFingerprinting string (Windows NT 10.0, no Win64, rv == version)');
  }
  const tz = light.locale.timezone;
  if ((tz === 'UTC' || tz === 'Etc/UTC') && light.locale.timezoneOffsetMinutes === 0) add('utc', 0.15, 'timezone forced to UTC');
  if (e.hardwareConcurrency === 2) add('two-cores', 0.1, 'hardwareConcurrency is the spoofed value 2');

  const v = light.screen.viewport;
  const letterboxed = v.innerWidth > 0 && v.innerWidth % 200 === 0 && v.innerHeight % 100 === 0;
  if (letterboxed) add('letterboxing', 0.25, `window ${v.innerWidth}x${v.innerHeight} is a multiple of 200x100`);
  if (light.screen.width === v.innerWidth && light.screen.height === v.innerHeight && v.innerWidth > 0) {
    add('screen-is-window', 0.15, 'screen size equals the window size');
  }

  const precision = c.engine?.timePrecisionMs;
  if (typeof precision === 'number' && precision >= 10) add('coarse-timer', 0.2, `timer precision ${precision} ms`);
  else if (typeof precision === 'number' && precision >= 1) add('reduced-timer', 0.08, `timer precision ${precision} ms`);

  const langs = e.languages.join(',');
  if (langs === 'en-US,en') add('en-us', 0.08, 'languages fixed to en-US,en');
  if (light.screen.devicePixelRatio === 1 && light.screen.colorDepth === 24) add('flat-display', 0.04, 'dpr 1 / 24-bit colour');
  if (c.speechVoices?.count === 0) add('no-voices', 0.05, 'no speech voices');
  if (c.webgl?.supported === false) add('no-webgl', 0.05, 'WebGL disabled (Tor "Safest")');

  const score = round(1 - signals.reduce((p, s) => p * (1 - s.weight), 1));
  // Needs a structural tell (frozen UA or letterboxing), not just a high sum of weak hints.
  const structural = signals.some((s) => s.id === 'frozen-ua' || s.id === 'letterboxing');
  return { isTor: score >= 0.7 && structural, score, signals };
}
