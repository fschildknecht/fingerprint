/* eslint-disable @typescript-eslint/no-explicit-any */
import { withTimeout } from '@fingerprint/core';
import type { Collector } from './types';

type Robustness = string | undefined;

const VIDEO = 'video/mp4; codecs="avc1.42E01E"';
const AUDIO = 'audio/mp4; codecs="mp4a.40.2"';

function config(initDataTypes: string[], robustness: Robustness): MediaKeySystemConfiguration[] {
  return [
    {
      initDataTypes,
      persistentState: 'optional',
      distinctiveIdentifier: 'optional',
      videoCapabilities: [{ contentType: VIDEO, ...(robustness ? { robustness } : {}) }],
      audioCapabilities: [{ contentType: AUDIO, ...(robustness && robustness !== '3000' && robustness !== '2000' ? { robustness: audioRobustness(robustness) } : {}) }],
    },
  ];
}

/** Widevine uses SW_SECURE_CRYPTO for audio even on L1 devices. */
const audioRobustness = (r: string): string => (r.startsWith('HW_') ? 'SW_SECURE_CRYPTO' : r);

async function access(system: string, initDataTypes: string[], robustness?: Robustness, timeoutMs = 2500): Promise<MediaKeySystemAccess | null> {
  try {
    return await withTimeout(navigator.requestMediaKeySystemAccess(system, config(initDataTypes, robustness)), timeoutMs);
  } catch {
    return null;
  }
}

async function hdcp(a: MediaKeySystemAccess): Promise<string | null> {
  try {
    const keys: any = await withTimeout(a.createMediaKeys(), 1500);
    if (typeof keys.getStatusForPolicy !== 'function') return null;
    let best: string | null = null;
    for (const v of ['1.0', '1.1', '1.2', '1.3', '1.4', '2.0', '2.1', '2.2', '2.3']) {
      const status = await withTimeout<string>(keys.getStatusForPolicy({ minHdcpVersion: v }), 1000).catch(() => null);
      if (status === 'usable') best = v;
    }
    return best;
  } catch {
    return null;
  }
}

async function widevine() {
  const levels: [string, string][] = [
    ['L1', 'HW_SECURE_ALL'],
    ['L2', 'HW_SECURE_CRYPTO'],
    ['L3', 'SW_SECURE_CRYPTO'],
  ];
  // The first call loads the CDM, which can take seconds. Warm it up before the quick level probes.
  const any = await access('com.widevine.alpha', ['cenc'], undefined, 6000);
  if (!any) return { available: false };
  const results = await Promise.all(levels.map(([, r]) => access('com.widevine.alpha', ['cenc'], r)));
  const idx = results.findIndex(Boolean);
  if (idx === -1) return { available: true, securityLevel: 'unknown', hdcp: await hdcp(any) };
  return { available: true, securityLevel: levels[idx][0], hdcp: await hdcp(results[idx]!) };
}

/** PlayReady: Edge/Windows. SL3000 = hardware DRM, SL2000 = software. */
async function playready() {
  const [sl3000, sl2000, recommendation, legacy] = await Promise.all([
    access('com.microsoft.playready.recommendation', ['cenc'], '3000'),
    access('com.microsoft.playready.recommendation', ['cenc'], '2000'),
    access('com.microsoft.playready.recommendation', ['cenc']),
    access('com.microsoft.playready', ['cenc']),
  ]);
  if (!sl3000 && !sl2000 && !recommendation && !legacy) return { available: false };
  return {
    available: true,
    securityLevel: sl3000 ? 'SL3000' : sl2000 ? 'SL2000' : 'software',
    recommendationApi: !!(recommendation || sl2000 || sl3000),
    keySystem: recommendation || sl2000 || sl3000 ? 'com.microsoft.playready.recommendation' : 'com.microsoft.playready',
  };
}

async function fairplay() {
  for (const id of ['com.apple.fps', 'com.apple.fps.1_0', 'com.apple.fps.2_0', 'com.apple.fps.3_0']) {
    if (await access(id, ['sinf', 'skd', 'cenc'])) return { available: true, keySystem: id };
  }
  return { available: false };
}

/**
 * Which DRM systems this device can play, and at what security level. Determines whether
 * Netflix/Disney+/Prime can stream HD/4K here (Widevine L1 / PlayReady SL3000 = full quality).
 *
 * Skipped in Firefox: probing Widevine there can trigger a "install DRM" prompt.
 */
export const drm: Collector = {
  id: 'drm',
  stable: true,
  bits: 3,
  timeoutMs: 12000,
  async run() {
    if (typeof navigator.requestMediaKeySystemAccess !== 'function') return { supported: false };
    const firefox = /Firefox\//.test(navigator.userAgent) && !/Seamonkey/.test(navigator.userAgent);

    const [wv, pr, fp, ck] = await Promise.all([
      firefox ? Promise.resolve({ available: null, skipped: 'Firefox: probing may show a DRM prompt' }) : widevine(),
      firefox ? Promise.resolve({ available: null, skipped: 'Firefox: probing may show a DRM prompt' }) : playready(),
      fairplay(),
      access('org.w3.clearkey', ['cenc', 'webm', 'keyids']).then((a) => ({ available: !!a })),
    ]);

    const summary = [
      (wv as any).available && `Widevine ${(wv as any).securityLevel}`,
      (pr as any).available && `PlayReady ${(pr as any).securityLevel}`,
      (fp as any).available && 'FairPlay',
    ].filter(Boolean) as string[];

    return { supported: true, widevine: wv, playready: pr, fairplay: fp, clearkey: ck, summary };
  },
};
