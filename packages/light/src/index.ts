/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConfidenceBuilder,
  VERSION,
  classifyDevice,
  collectScreen,
  hashOf,
  macosName,
  mq,
  nav,
  now,
  parseUserAgent,
  primaryBrand,
  readClientHints,
  round,
} from '@fingerprint/core';
import type { ClientHints, ConfidenceResult, DeviceType, ParsedUserAgent, ScreenInfo } from '@fingerprint/core';

export type { ConfidenceResult, DeviceType, ScreenInfo } from '@fingerprint/core';
export { VERSION };

export interface LightOptions {
  /** Ask Chromium for high-entropy client hints (model, exact OS version, arch). Default true. */
  clientHints?: boolean;
  /** Override the user agent, useful for server-side or test usage. */
  userAgent?: string;
}

export interface LightResult {
  version: string;
  /**
   * Coarse, stable identifier built only from low-entropy signals. It groups visitors with the
   * same device class, it is NOT unique per person. Use @fingerprint/advanced for that.
   */
  visitorId: string;
  confidence: ConfidenceResult;
  device: {
    type: DeviceType;
    typeConfidence: number;
    vendor: string | null;
    model: string | null;
    os: { name: string; version: string | null; marketingName: string | null };
    architecture: string | null;
    bitness: string | null;
    cpuCores: number | null;
    memoryGb: number | null;
    touch: { maxTouchPoints: number; coarsePointer: boolean | null; hover: boolean | null };
  };
  browser: {
    name: string;
    version: string | null;
    major: number | null;
    engine: string;
    engineVersion: string | null;
    isWebView: boolean;
    isBrave: boolean;
    brands: { brand: string; version: string }[];
  };
  screen: ScreenInfo;
  locale: {
    language: string | null;
    languages: string[];
    timezone: string | null;
    timezoneOffsetMinutes: number;
  };
  flags: {
    cookiesEnabled: boolean | null;
    doNotTrack: string | null;
    globalPrivacyControl: boolean | null;
    webdriver: boolean | null;
    online: boolean | null;
    prefersDark: boolean | null;
    prefersReducedMotion: boolean | null;
  };
  /** Contradictions between signals. Each one lowered the confidence score. */
  inconsistencies: string[];
  /** Why the device type was chosen. */
  reasons: string[];
  durationMs: number;
}

export async function getLight(options: LightOptions = {}): Promise<LightResult> {
  const start = now();
  const n = nav();
  const ua: ParsedUserAgent = parseUserAgent(options.userAgent ?? n.userAgent ?? '');
  const hints: ClientHints | null = await readClientHints(options.clientHints !== false);

  const coarsePointer = mq('(pointer: coarse)');
  const hover = mq('(hover: hover)');
  const maxTouchPoints: number = n.maxTouchPoints ?? 0;
  const platform: string = n.userAgentData?.platform || n.platform || '';

  // First pass: screen is needed for classification, classification is needed for screen estimates.
  const rawScreen = collectScreen('unknown');
  const shortSide = Math.min(rawScreen.width, rawScreen.height);
  const longSide = Math.max(rawScreen.width, rawScreen.height);

  const device = classifyDevice({
    ua,
    hints,
    maxTouchPoints,
    shortSide,
    longSide,
    platform: n.platform ?? '',
    coarsePointer,
    hover,
  });
  const screen = collectScreen(device.type);

  // OS refinement from client hints (the UA string is frozen at "Windows NT 10.0" / "Mac OS X 10_15_7").
  let osName = ua.os.name;
  let osVersion = ua.os.version;
  if (device.type === 'tablet' && osName === 'macOS') {
    osName = 'iPadOS';
    osVersion = null;
  }
  if (hints?.platform && hints.platformVersion) {
    const major = parseInt(hints.platformVersion, 10);
    if (hints.platform === 'Windows') {
      osName = 'Windows';
      osVersion = major >= 13 ? '11' : '10';
    } else if (hints.platform === 'macOS') {
      osName = 'macOS';
      osVersion = hints.platformVersion;
    } else if (hints.platform === 'Android') {
      osName = 'Android';
      osVersion = hints.platformVersion;
    } else if (hints.platform === 'Linux' || hints.platform === 'Chrome OS') {
      osName = hints.platform === 'Linux' ? 'Linux' : 'ChromeOS';
    }
  }

  // Browser refinement: prefer the client-hint brand because Chromium forks all share "Chrome/x" in the UA.
  let browserName = ua.browser.name;
  let browserVersion = ua.browser.version;
  const brand = primaryBrand(hints);
  if (brand && ua.browser.name === 'Chrome' && !/^google chrome$/i.test(brand.brand)) {
    browserName = brand.brand.replace(/^Microsoft /, '');
    browserVersion = brand.version;
  } else if (brand && ua.browser.name === 'Chrome' && /^google chrome$/i.test(brand.brand)) {
    browserVersion = brand.version;
  }
  const isBrave = !!n.brave && typeof n.brave.isBrave === 'function';
  if (isBrave) browserName = 'Brave';

  const tz = safeTimezone();
  const languages: string[] = Array.isArray(n.languages) ? [...n.languages] : n.language ? [n.language] : [];

  const confidence = buildConfidence({ ua, hints, deviceType: device.type, deviceConfidence: device.confidence, inconsistencies: device.inconsistencies, screen, languages, tz, n, maxTouchPoints });

  const visitorId = (
    await hashOf({
      os: osName,
      browser: browserName,
      type: device.type,
      // orientation-independent so rotating the phone does not change the ID
      screen: [shortSide, longSide, screen.devicePixelRatio, screen.colorDepth],
      tz,
      lang: languages[0] ?? null,
      cores: n.hardwareConcurrency ?? null,
      mem: n.deviceMemory ?? null,
      platform: n.platform ?? null,
    })
  ).slice(0, 32);

  return {
    version: VERSION,
    visitorId,
    confidence,
    device: {
      type: device.type,
      typeConfidence: device.confidence,
      vendor: ua.device.vendor,
      model: hints?.model || ua.device.model,
      os: {
        name: osName,
        version: osVersion,
        marketingName: osName === 'macOS' ? macosName(osVersion) : null,
      },
      architecture: hints?.architecture ?? null,
      bitness: hints?.bitness ?? null,
      cpuCores: n.hardwareConcurrency ?? null,
      memoryGb: n.deviceMemory ?? null,
      touch: { maxTouchPoints, coarsePointer, hover },
    },
    browser: {
      name: browserName,
      version: browserVersion,
      major: browserVersion ? parseInt(browserVersion, 10) || null : null,
      engine: ua.engine.name,
      engineVersion: ua.engine.version,
      isWebView: ua.isWebView,
      isBrave,
      brands: hints?.brands ?? [],
    },
    screen,
    locale: {
      language: n.language ?? null,
      languages,
      timezone: tz,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    },
    flags: {
      cookiesEnabled: typeof n.cookieEnabled === 'boolean' ? n.cookieEnabled : null,
      doNotTrack: n.doNotTrack ?? null,
      globalPrivacyControl: typeof n.globalPrivacyControl === 'boolean' ? n.globalPrivacyControl : null,
      webdriver: typeof n.webdriver === 'boolean' ? n.webdriver : null,
      online: typeof n.onLine === 'boolean' ? n.onLine : null,
      prefersDark: mq('(prefers-color-scheme: dark)'),
      prefersReducedMotion: mq('(prefers-reduced-motion: reduce)'),
    },
    inconsistencies: device.inconsistencies,
    reasons: device.reasons,
    durationMs: round(now() - start, 1),
  };
}

function safeTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function buildConfidence(i: {
  ua: ParsedUserAgent;
  hints: ClientHints | null;
  deviceType: DeviceType;
  deviceConfidence: number;
  inconsistencies: string[];
  screen: ScreenInfo;
  languages: string[];
  tz: string | null;
  n: any;
  maxTouchPoints: number;
}): ConfidenceResult {
  const c = new ConfidenceBuilder();
  c.factor('ua', 0.15, i.ua.browser.name !== 'Unknown' && i.ua.os.name !== 'Unknown', 'UA parsed to browser and OS');
  c.factor('device-type', 0.2, i.deviceType !== 'unknown', `device type resolved with ${i.deviceConfidence} confidence`);
  c.factor('client-hints', 0.1, !!i.hints, 'UA-CH available (Chromium only)');
  c.factor('screen', 0.15, i.screen.width > 0 && i.screen.height > 0, 'screen size readable');
  c.factor('dpr', 0.05, i.screen.devicePixelRatio > 0);
  c.factor('timezone', 0.08, !!i.tz);
  c.factor('languages', 0.07, i.languages.length > 0);
  c.factor('hardware', 0.1, i.n.hardwareConcurrency != null, 'hardwareConcurrency readable');
  c.factor('touch', 0.05, i.n.maxTouchPoints != null);
  c.factor('platform', 0.05, !!i.n.platform);

  // The classification confidence itself is evidence: low means the signals disagree.
  c.penalty('device-uncertainty', round((1 - i.deviceConfidence) * 0.25), 'device type evidence is weak or conflicting');
  for (const msg of i.inconsistencies) c.penalty('inconsistency', 0.07, msg);
  if (i.ua.isBotUA) c.penalty('bot', 0.2, 'automated client: values may be synthetic');
  if (i.n.webdriver === true) c.penalty('webdriver', 0.2, 'navigator.webdriver is true');
  if (i.screen.width === 0 || i.screen.height === 0) c.penalty('no-screen', 0.15, 'screen reports 0x0');
  return c.build();
}
