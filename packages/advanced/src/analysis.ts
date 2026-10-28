/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, round } from '@fingerprint/core';
import type { LightResult } from '@fingerprint/light';
import { iframeMismatch, ownPropertyOverrides, scoreManipulation, screenMediaMismatch, workerMismatch } from './manipulation';
import type { ManipulationAnalysis, ManipulationSignal } from './manipulation';

export type { ManipulationAnalysis, ManipulationSignal, ManipulationCategory } from './manipulation';

export interface BotSignal {
  id: string;
  /** Probability contribution 0..1. Signals are combined as 1 - prod(1 - w). */
  weight: number;
  detail: string;
}

export interface BotAnalysis {
  /** 0..1 likelihood that this client is automated. */
  score: number;
  isBot: boolean;
  signals: BotSignal[];
}

export interface Analysis {
  /** How likely the fingerprint was deliberately altered. Independent of the bot score. */
  manipulation: ManipulationAnalysis;
  bot: BotAnalysis;
  /** Native functions that no longer look native: someone patched the browser. */
  tampering: string[];
  /** Signals that contradict each other, beyond what Light already reports. */
  inconsistencies: string[];
  /** Privacy tooling that distorts fingerprints. */
  privacyTools: { name: string; confidence: number; evidence: string }[];
}

type Components = Record<string, any>;

const AUTOMATION_GLOBALS = [
  '__nightmare', '_phantom', 'callPhantom', 'phantom', '__selenium_unwrapped', '__selenium_evaluate', '__webdriver_evaluate',
  '__driver_evaluate', '__webdriver_script_fn', '__webdriver_unwrapped', '__fxdriver_unwrapped', '_Selenium_IDE_Recorder',
  'domAutomation', 'domAutomationController', '__playwright', '__pw_manual', '__PW_inspect', '__pwInitScripts',
  '__playwright__binding__', '__puppeteer_evaluation_script__', 'awesomium', 'emit', 'spawn', 'Buffer', 'webdriver',
];

const NATIVE_CHECKS: [string, () => unknown][] = [
  ['navigator.permissions.query', () => (navigator as any).permissions?.query],
  ['HTMLCanvasElement.toDataURL', () => HTMLCanvasElement.prototype.toDataURL],
  ['CanvasRenderingContext2D.getImageData', () => CanvasRenderingContext2D.prototype.getImageData],
  ['WebGLRenderingContext.getParameter', () => (window as any).WebGLRenderingContext?.prototype.getParameter],
  ['Date.getTimezoneOffset', () => Date.prototype.getTimezoneOffset],
  ['Intl.DateTimeFormat.resolvedOptions', () => Intl.DateTimeFormat.prototype.resolvedOptions],
  ['performance.now', () => performance.now],
  ['Function.prototype.toString', () => Function.prototype.toString],
  ['screen.width getter', () => Object.getOwnPropertyDescriptor(Screen.prototype, 'width')?.get],
  ['navigator.userAgent getter', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')?.get],
  ['navigator.hardwareConcurrency getter', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency')?.get],
];

function isNative(fn: unknown): boolean {
  if (typeof fn !== 'function') return true; // absent APIs are not tampering
  try {
    return /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
  } catch {
    return false;
  }
}

/** Offset in minutes for a zone computed through Intl, independent of Date.getTimezoneOffset(). */
function intlOffsetMinutes(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return Math.round((at.getTime() - asUtc) / 60000);
  } catch {
    return null;
  }
}

export async function analyze(light: LightResult, c: Components): Promise<Analysis> {
  const n = nav();
  const w = window as any;
  const ua: string = n.userAgent ?? '';
  const signals: BotSignal[] = [];
  const bot = (id: string, weight: number, detail: string) => signals.push({ id, weight, detail });
  const isChromium = /Chrome\//.test(ua);
  const isDesktop = light.device.type === 'desktop';

  // --- Bot / automation ---
  if (n.webdriver === true) bot('webdriver', 0.9, 'navigator.webdriver is true');
  if (/HeadlessChrome/.test(ua)) bot('headless-ua', 0.95, 'HeadlessChrome in user agent');
  if (light.device.type === 'bot') bot('bot-ua', 0.9, 'user agent matches a bot pattern');

  const foundGlobals = AUTOMATION_GLOBALS.filter((g) => {
    if (g === 'Buffer' || g === 'emit' || g === 'spawn' || g === 'webdriver') return false;
    return g in w;
  });
  if (foundGlobals.length) bot('automation-globals', 0.9, foundGlobals.join(', '));
  const cdc = Object.getOwnPropertyNames(document).concat(Object.getOwnPropertyNames(window)).filter((k) => /^\$?[cw]dc_/.test(k));
  if (cdc.length) bot('chromedriver-cdc', 0.95, cdc[0]);
  if (document.documentElement.getAttribute('webdriver') !== null) bot('webdriver-attr', 0.85, 'documentElement has a webdriver attribute');
  if (typeof w.process === 'object' && w.process?.versions?.node) bot('node-env', 0.5, 'Node.js globals exposed (Electron or jsdom)');

  const stack = (() => {
    try {
      throw new Error('probe');
    } catch (e: any) {
      return String(e.stack ?? '');
    }
  })();
  if (/puppeteer|playwright|__pwInitScripts|pptr:/i.test(stack)) bot('automation-stack', 0.7, 'automation framework in stack trace');

  const own = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
  if (own) bot('webdriver-own-property', 0.6, 'navigator.webdriver redefined on the instance (stealth patch)');

  if (isChromium && isDesktop && !w.chrome) bot('no-window-chrome', 0.45, 'Chromium UA without window.chrome');
  if (isChromium && isDesktop && (n.plugins?.length ?? 0) === 0 && !n.pdfViewerEnabled) bot('no-plugins', 0.25, 'desktop Chromium without any plugins or PDF viewer');
  if ((n.languages?.length ?? 0) === 0) bot('no-languages', 0.4, 'navigator.languages is empty');
  if (isDesktop && w.outerWidth === 0 && w.outerHeight === 0) bot('zero-outer-window', 0.4, 'window.outerWidth/Height are 0');
  if (light.screen.width === 0 || light.screen.height === 0) bot('zero-screen', 0.3, 'screen reports 0x0');

  const notif = c.permissions?.states?.notifications;
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied' && notif === 'prompt') {
    bot('notification-permission-mismatch', 0.5, 'classic headless Chrome permission mismatch');
  }

  const renderer: string = c.webgl?.unmaskedRenderer ?? '';
  if (/swiftshader|llvmpipe|softpipe|mesa offscreen|software/i.test(renderer)) {
    bot('software-renderer', 0.35, `software WebGL renderer: ${renderer}`);
  }
  if (c.webgl && c.webgl.supported === false && isDesktop) bot('no-webgl', 0.15, 'desktop browser without WebGL');
  if (c.connection?.rtt === 0 && isChromium) bot('zero-rtt', 0.2, 'connection.rtt is 0 (headless Chrome)');

  // --- Tampering: patched natives ---
  const tampering = NATIVE_CHECKS.filter(([, get]) => {
    try {
      return !isNative(get());
    } catch {
      return false;
    }
  }).map(([name]) => name);
  if (tampering.length) bot('tampered-natives', Math.min(0.6, 0.2 + tampering.length * 0.1), tampering.join(', '));

  // --- Inconsistencies beyond what Light checks ---
  const inconsistencies: string[] = [];
  const gl = renderer.toLowerCase();
  const os = light.device.os.name;
  if (gl) {
    if (os === 'Windows' && /apple (m\d|gpu)/.test(gl)) inconsistencies.push(`Windows UA but Apple GPU "${renderer}"`);
    if ((os === 'macOS' || os === 'iOS' || os === 'iPadOS') && /direct3d|d3d11/.test(gl)) inconsistencies.push(`${os} UA but Direct3D renderer "${renderer}"`);
    if (os === 'iOS' && !/apple/.test(gl)) inconsistencies.push(`iOS UA but non-Apple GPU "${renderer}"`);
  }
  if (n.languages?.length && n.language && n.languages[0] !== n.language) {
    inconsistencies.push(`navigator.language (${n.language}) differs from languages[0] (${n.languages[0]})`);
  }
  const tz = light.locale.timezone;
  if (tz) {
    const real = intlOffsetMinutes(tz, new Date());
    if (real !== null && real !== new Date().getTimezoneOffset()) {
      inconsistencies.push(`Timezone ${tz} implies offset ${real} but Date reports ${new Date().getTimezoneOffset()}`);
    }
  }
  if (c.canvas?.randomized) inconsistencies.push('Canvas output differs between two identical draws (noise injection)');
  if (light.screen.availWidth > light.screen.width + 1) inconsistencies.push('screen.availWidth exceeds screen.width');
  // Phones/tablets can't have a window wider than their screen. (Bots and desktop browsers can, e.g. headless defaults.)
  const handheld = light.device.type === 'mobile' || light.device.type === 'tablet';
  if (handheld && light.screen.width > 0 && light.screen.viewport.innerWidth > light.screen.width * 1.05) {
    inconsistencies.push('Viewport wider than the screen on a mobile device');
  }
  const brand = light.browser.brands.find((b) => /^(google chrome|microsoft edge|opera|chromium)$/i.test(b.brand));
  if (brand && light.browser.engine === 'Blink') {
    const uaMajor = Number(/Chrome\/(\d+)/.exec(ua)?.[1]);
    if (uaMajor && Number(brand.version.split('.')[0]) && uaMajor !== Number(brand.version.split('.')[0])) {
      inconsistencies.push(`UA claims Chrome/${uaMajor} but client hints report ${brand.brand} ${brand.version}`);
    }
  }
  const engineStack = c.engine?.stackStyle;
  if (engineStack === 'v8' && light.browser.engine !== 'Blink' && light.browser.engine !== 'Unknown') {
    inconsistencies.push(`JS engine looks like V8 but UA claims ${light.browser.engine}`);
  } else if (engineStack === 'gecko-or-jsc' && light.browser.engine === 'Blink') {
    inconsistencies.push('UA claims Blink but the JS engine is not V8');
  }

  // --- Privacy tooling ---
  const privacyTools: Analysis['privacyTools'] = [];
  if (light.browser.isBrave) privacyTools.push({ name: 'Brave Shields', confidence: 0.95, evidence: 'navigator.brave present (canvas/audio farbling likely)' });
  const precision = c.engine?.timePrecisionMs;
  if (light.browser.engine === 'Gecko' && typeof precision === 'number' && precision >= 1) {
    const tzUtc = tz === 'UTC' || tz === 'Etc/UTC';
    privacyTools.push({
      name: tzUtc ? 'Tor Browser / Firefox resistFingerprinting' : 'Firefox privacy.reduceTimerPrecision',
      confidence: tzUtc ? 0.85 : 0.5,
      evidence: `timer precision ${precision}ms${tzUtc ? ', timezone forced to UTC' : ''}`,
    });
  }
  if (n.globalPrivacyControl === true || n.doNotTrack === '1') privacyTools.push({ name: 'Privacy signal (GPC/DNT)', confidence: 0.9, evidence: 'user opted out of tracking' });
  if (c.canvas?.randomized && !light.browser.isBrave) privacyTools.push({ name: 'Canvas randomizer (extension / anti-detect browser)', confidence: 0.8, evidence: 'canvas noise detected' });

  // --- Manipulation score ---
  const m: ManipulationSignal[] = [];
  const man = (id: string, category: ManipulationSignal['category'], weight: number, detail: string) =>
    m.push({ id, category, weight, detail });

  if (tampering.length) man('patched-natives', 'tampering', Math.min(0.75, 0.35 + tampering.length * 0.15), tampering.join(', '));
  const overrides = ownPropertyOverrides();
  if (overrides.length) man('navigator-own-properties', 'tampering', 0.6, `navigator.${overrides.join(', navigator.')} redefined on the instance`);

  const frameDiff = iframeMismatch();
  if (frameDiff?.length) man('iframe-mismatch', 'cross-context', 0.65, `top window and a fresh iframe disagree on: ${frameDiff.join(', ')}`);
  const workerDiff = await workerMismatch();
  if (workerDiff?.length) man('worker-mismatch', 'cross-context', 0.65, `page and Web Worker disagree on: ${workerDiff.join(', ')}`);
  if (screenMediaMismatch()) man('screen-mismatch', 'spoofing', 0.5, 'screen.width/height contradict the device-width media query');

  for (const msg of light.inconsistencies) man('device-inconsistency', 'spoofing', 0.35, msg);
  for (const msg of inconsistencies) {
    if (/Canvas output differs/.test(msg)) continue; // scored as noise below
    man('signal-inconsistency', 'spoofing', 0.4, msg);
  }

  if (c.canvas?.randomized) {
    if (light.browser.isBrave) man('canvas-farbling', 'privacy', 0.25, 'Brave Shields randomises canvas output (expected, not malicious)');
    else man('canvas-noise', 'noise', 0.6, 'canvas output changes between identical draws');
  }
  for (const p of privacyTools) {
    if (/Tor|resistFingerprinting/.test(p.name)) man('resist-fingerprinting', 'privacy', 0.25, p.evidence);
  }

  const manipulation = scoreManipulation(m);
  const score = round(1 - signals.reduce((p, s) => p * (1 - s.weight), 1));
  return {
    manipulation,
    bot: { score, isBot: score >= 0.6, signals },
    tampering,
    inconsistencies,
    privacyTools,
  };
}
