/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, round } from '@fingerprint/core';
import type { Collector } from './types';

/** Class names and ids that EasyList-style generic cosmetic filters hide. */
const BAIT_CLASSES = [
  'adsbox ad-banner ad-placeholder ad-unit ad-slot adsbygoogle',
  'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links',
  'ad_box ad-box advert advertisement banner_ad banner-ads sponsored-ad sponsor-box',
];
const BAIT_IDS = ['ad-banner', 'ads', 'google_ads_iframe_1', 'AdFrame', 'sponsored_links'];

function isHidden(el: HTMLElement): boolean {
  if (!el.isConnected) return true;
  const cs = getComputedStyle(el);
  return (
    el.offsetHeight === 0 ||
    el.offsetWidth === 0 ||
    cs.display === 'none' ||
    cs.visibility === 'hidden' ||
    cs.opacity === '0' ||
    el.offsetParent === null && cs.position !== 'fixed' && cs.position !== 'absolute'
  );
}

/**
 * Method 1, cosmetic: elements with ad-like classes/ids get hidden by content blockers' generic
 * filters. Filters are injected asynchronously, so poll for up to 500 ms.
 */
async function cosmeticProbe(): Promise<{ blocked: boolean; hidden: number; total: number }> {
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:-9999px;top:0;width:300px';
  const baits: HTMLElement[] = [];
  const add = (el: HTMLElement) => {
    el.style.cssText = 'display:block;width:20px;height:20px';
    el.textContent = 'x';
    box.appendChild(el);
    baits.push(el);
  };
  for (const cls of BAIT_CLASSES) {
    const d = document.createElement('div');
    d.className = cls;
    add(d);
  }
  for (const id of BAIT_IDS) {
    const d = document.createElement('div');
    d.id = id;
    add(d);
  }
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.setAttribute('data-ad-client', 'ca-pub-0000000000000000');
  add(ins);

  document.body.appendChild(box);
  try {
    let hidden = 0;
    // Bound by the clock, not by a loop count: a background tab throttles setTimeout to ~1 Hz.
    const deadline = performance.now() + 500;
    for (;;) {
      hidden = baits.filter(isHidden).length;
      if (hidden > 0 || performance.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return { blocked: hidden > 0, hidden, total: baits.length };
  } finally {
    box.remove();
  }
}

/**
 * Method 2, network: request a well-known ad script. A blocker cancels it (ERR_BLOCKED_BY_CLIENT,
 * surfaced as a TypeError). A same-origin control request rules out "we are simply offline".
 * Note: this contacts doubleclick.net when no blocker is present.
 */
async function networkProbe(): Promise<boolean | null> {
  if (nav().onLine === false) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  try {
    await fetch('https://static.doubleclick.net/instream/ad_status.js', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: ctl.signal,
    });
    return false;
  } catch (e: any) {
    if (e?.name === 'AbortError') return null; // timeout: no verdict
    try {
      await fetch(location.href, { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
    } catch {
      return null; // control request failed too: offline or CSP, not a blocker
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}

export const adBlocker: Collector = {
  id: 'adBlocker',
  stable: false,
  slow: true,
  bits: 2,
  timeoutMs: 5000,
  async run() {
    const [cosmetic, network] = await Promise.all([cosmeticProbe(), networkProbe()]);
    const detected = cosmetic.blocked || network === true;
    let confidence: number;
    if (cosmetic.blocked && network === true) confidence = 0.97;
    else if (detected) confidence = 0.8;
    else if (network === false) confidence = 0.9;
    else confidence = 0.6; // network inconclusive, cosmetic alone says "no"
    return {
      detected,
      confidence: round(confidence),
      methods: {
        cosmetic: { blocked: cosmetic.blocked, hiddenBaits: `${cosmetic.hidden}/${cosmetic.total}` },
        network: { blocked: network },
      },
      // Brave blocks at the network level without an extension.
      builtInBlocker: !!nav().brave,
    };
  },
};
