/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, round } from '@fingerprint/core';

export type ManipulationCategory =
  | 'spoofing' // identity claims that contradict each other
  | 'tampering' // browser internals were patched
  | 'cross-context' // main window disagrees with a fresh iframe / worker
  | 'noise' // output randomised
  | 'privacy'; // legitimate privacy tooling, scored low

export interface ManipulationSignal {
  id: string;
  category: ManipulationCategory;
  /** Probability contribution 0..1. Signals are combined as 1 - prod(1 - w). */
  weight: number;
  detail: string;
}

export interface ManipulationAnalysis {
  /** 0..1 likelihood that this visitor's fingerprint was altered on purpose (spoofing, patching, noise). */
  score: number;
  level: 'none' | 'low' | 'medium' | 'high';
  /** Combined likelihood per category, to show *how* it was manipulated. */
  categories: Partial<Record<ManipulationCategory, number>>;
  signals: ManipulationSignal[];
}

const combine = (ws: number[]): number => round(1 - ws.reduce((p, w) => p * (1 - w), 1));

export function levelOfManipulation(score: number): ManipulationAnalysis['level'] {
  if (score < 0.15) return 'none';
  if (score < 0.4) return 'low';
  if (score < 0.7) return 'medium';
  return 'high';
}

export function scoreManipulation(signals: ManipulationSignal[]): ManipulationAnalysis {
  const score = combine(signals.map((s) => s.weight));
  const categories: ManipulationAnalysis['categories'] = {};
  for (const cat of new Set(signals.map((s) => s.category))) {
    categories[cat] = combine(signals.filter((s) => s.category === cat).map((s) => s.weight));
  }
  return { score, level: levelOfManipulation(score), categories, signals };
}

const KEYS = ['userAgent', 'platform', 'hardwareConcurrency', 'language', 'vendor', 'deviceMemory'] as const;

function snapshot(n: any): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of KEYS) o[k] = n[k] ?? null;
  o.languages = n.languages ? Array.from(n.languages).join(',') : null;
  return o;
}

function diff(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Object.keys(a).filter((k) => a[k] !== b[k] && !(a[k] == null && b[k] == null));
}

/** A fresh iframe is a new realm: patches applied to the top window's navigator usually don't reach it. */
export function iframeMismatch(): string[] | null {
  let frame: HTMLIFrameElement | null = null;
  try {
    frame = document.createElement('iframe');
    frame.style.cssText = 'display:none';
    document.body.appendChild(frame);
    const inner = frame.contentWindow?.navigator;
    if (!inner) return null;
    return diff(snapshot(nav()), snapshot(inner));
  } catch {
    return null;
  } finally {
    frame?.remove();
  }
}

/** Workers get their own navigator and Intl. Extensions that spoof the page often forget them. */
export function workerMismatch(timeoutMs = 1500): Promise<string[] | null> {
  return new Promise((resolve) => {
    let url: string | null = null;
    let worker: Worker | null = null;
    const done = (v: string[] | null) => {
      clearTimeout(timer);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      const src = `postMessage({userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,language:navigator.language,vendor:navigator.vendor,deviceMemory:navigator.deviceMemory??null,languages:(navigator.languages||[]).join(','),tz:Intl.DateTimeFormat().resolvedOptions().timeZone})`;
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (e) => {
        const { tz, ...rest } = e.data;
        const main = snapshot(nav());
        // WorkerNavigator has no `vendor`: comparing it would flag every honest browser.
        delete main.vendor;
        delete rest.vendor;
        const bad = diff(main, rest);
        if (tz && tz !== Intl.DateTimeFormat().resolvedOptions().timeZone) bad.push('timeZone');
        done(bad);
      };
      worker.onerror = () => done(null); // CSP blocks blob workers: no verdict
    } catch {
      done(null);
    }
  });
}

/** navigator.<prop> defined on the instance means someone called Object.defineProperty on it. */
export function ownPropertyOverrides(): string[] {
  const own = Object.getOwnPropertyNames(navigator);
  return own.filter((k) => (KEYS as readonly string[]).includes(k) || k === 'languages' || k === 'webdriver' || k === 'plugins');
}

/** screen.width must satisfy the device-width media query. Spoofed screen objects don't. */
export function screenMediaMismatch(): boolean | null {
  try {
    const w = screen.width;
    const h = screen.height;
    if (!w || !h || typeof matchMedia !== 'function') return null;
    const ok =
      matchMedia(`(min-device-width:${w - 1}px) and (max-device-width:${w + 1}px)`).matches &&
      matchMedia(`(min-device-height:${h - 1}px) and (max-device-height:${h + 1}px)`).matches;
    return !ok;
  } catch {
    return null;
  }
}
