import type { DeviceType, ParsedUserAgent } from './types';
import { majorOf } from './utils';

const BROWSERS: [string, RegExp][] = [
  ['Edge', /\b(?:Edg|EdgA|EdgiOS|Edge)\/([\d.]+)/],
  ['Opera', /\b(?:OPR|OPiOS|OPT)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['Vivaldi', /Vivaldi\/([\d.]+)/],
  ['DuckDuckGo', /DuckDuckGo\/([\d.]+)/],
  ['Yandex', /YaBrowser\/([\d.]+)/],
  ['UC Browser', /UCBrowser\/([\d.]+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Internet Explorer', /Trident\/[\d.]+.*rv:([\d.]+)|MSIE ([\d.]+)/],
  ['Chrome', /\b(?:Chrome|CriOS|HeadlessChrome|Chromium)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari\//],
];

const MAC_ALIAS: [number, string][] = [
  [26, 'Tahoe'],
  [15, 'Sequoia'],
  [14, 'Sonoma'],
  [13, 'Ventura'],
  [12, 'Monterey'],
  [11, 'Big Sur'],
];

const WINDOWS_NT: Record<string, string> = {
  '10.0': '10',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.1': 'XP',
};

const ANDROID_VENDORS: [RegExp, string][] = [
  [/^SM-|^GT-|^SAMSUNG|^SC-|^SCG/i, 'Samsung'],
  [/^Pixel|^Nexus/i, 'Google'],
  [/^(?:CPH|OPD|PG|RMX\d*)/i, 'OPPO/Realme'],
  [/^(?:M\d{4}|2\d{6,}|Redmi|POCO|MI |Xiaomi)/i, 'Xiaomi'],
  [/^(?:LM-|LG-)/i, 'LG'],
  [/^(?:XT|moto)/i, 'Motorola'],
  [/^(?:HUAWEI|[A-Z]{3}-[AL]\d{2}|ELS-|VOG-|NOH-)/i, 'Huawei'],
  [/^(?:Honor|HONOR)/i, 'Honor'],
  [/^(?:ONEPLUS|[A-Z]{2}\d{4}$)/i, 'OnePlus'],
  [/^(?:SO-|Xperia|XQ-|XQ)/i, 'Sony'],
  [/^(?:KFT|KFA|KF[A-Z]+|AFT)/i, 'Amazon'],
];

const BOT_RE =
  /bot\b|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|curl\/|wget|python-requests|httpclient|axios|node-fetch|go-http-client|puppeteer|playwright|phantomjs|scrapy/i;
const TV_RE =
  /SmartTV|SMART-TV|Web0S|WebOS|HbbTV|NetCast|AppleTV|Roku|CrKey|BRAVIA|AFT[A-Z0-9]+|Android TV|GoogleTV|Tizen.*TV/i;
const CONSOLE_RE = /PlayStation|Xbox|Nintendo|\bNX\b/i;
const WEARABLE_RE = /Wear OS|Watch|SM-R\d{3}/i;
const TABLET_RE = /iPad|Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 9|SM-T\d|SM-X\d/i;
const MOBILE_RE = /Mobi|iPhone|iPod|Windows Phone|IEMobile|BlackBerry/i;

export function parseUserAgent(ua: string): ParsedUserAgent {
  const raw = ua ?? '';

  let browserName = 'Unknown';
  let browserVersion: string | null = null;
  for (const [name, re] of BROWSERS) {
    const m = re.exec(raw);
    if (m) {
      browserName = name;
      browserVersion = m.slice(1).find(Boolean) ?? null;
      break;
    }
  }

  const isWebView =
    /; wv\)/.test(raw) ||
    /\b(?:FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly)\b/.test(raw) ||
    (/(?:iPhone|iPad|iPod)/.test(raw) && /AppleWebKit/.test(raw) && !/Safari\//.test(raw) && !/(?:CriOS|FxiOS|EdgiOS)/.test(raw));

  // OS
  let osName = 'Unknown';
  let osVersion: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /Windows Phone (?:OS )?([\d.]+)/.exec(raw))) {
    osName = 'Windows Phone';
    osVersion = m[1];
  } else if ((m = /Windows NT ([\d.]+)/.exec(raw))) {
    osName = 'Windows';
    osVersion = WINDOWS_NT[m[1]] ?? m[1];
  } else if ((m = /(?:iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(raw))) {
    osName = /iPad/.test(raw) ? 'iPadOS' : 'iOS';
    osVersion = m[1].replace(/_/g, '.');
  } else if ((m = /Android[ /]?([\d.]+)?/.exec(raw))) {
    osName = /HarmonyOS/i.test(raw) ? 'HarmonyOS' : 'Android';
    osVersion = m[1] ?? null;
  } else if ((m = /CrOS \S+ ([\d.]+)/.exec(raw))) {
    osName = 'ChromeOS';
    osVersion = m[1];
  } else if ((m = /Mac OS X ([\d_.]+)/.exec(raw))) {
    osName = 'macOS';
    osVersion = m[1].replace(/_/g, '.');
  } else if (/Linux|X11|Ubuntu|Fedora|Debian/.test(raw)) {
    osName = /Ubuntu/.test(raw) ? 'Ubuntu' : 'Linux';
  }

  // Engine
  let engineName = 'Unknown';
  let engineVersion: string | null = null;
  if (osName === 'iOS' || osName === 'iPadOS') {
    engineName = 'WebKit';
    engineVersion = /AppleWebKit\/([\d.]+)/.exec(raw)?.[1] ?? null;
  } else if (/Trident\//.test(raw)) {
    engineName = 'Trident';
    engineVersion = /Trident\/([\d.]+)/.exec(raw)?.[1] ?? null;
  } else if (/Gecko\/[\d.]+.*Firefox\//.test(raw) || /Firefox\//.test(raw)) {
    engineName = 'Gecko';
    engineVersion = /rv:([\d.]+)/.exec(raw)?.[1] ?? null;
  } else if (/Chrome\/|Chromium\/|CriOS\/|Edg/.test(raw)) {
    engineName = 'Blink';
    engineVersion = /Chrome\/([\d.]+)/.exec(raw)?.[1] ?? null;
  } else if (/AppleWebKit\//.test(raw)) {
    engineName = 'WebKit';
    engineVersion = /AppleWebKit\/([\d.]+)/.exec(raw)?.[1] ?? null;
  }

  // Device
  let type: DeviceType | null = null;
  let vendor: string | null = null;
  let model: string | null = null;
  const isBotUA = BOT_RE.test(raw);

  if (isBotUA) type = 'bot';
  else if (CONSOLE_RE.test(raw)) type = 'console';
  else if (TV_RE.test(raw)) type = 'tv';
  else if (WEARABLE_RE.test(raw)) type = 'wearable';
  else if (TABLET_RE.test(raw) || (osName === 'Android' && !/Mobile/.test(raw))) type = 'tablet';
  else if (MOBILE_RE.test(raw) || (osName === 'Android' && /Mobile/.test(raw))) type = 'mobile';
  else if (['Windows', 'macOS', 'Linux', 'Ubuntu', 'ChromeOS'].includes(osName)) type = 'desktop';

  if (/iPhone/.test(raw)) {
    vendor = 'Apple';
    model = 'iPhone';
  } else if (/iPad/.test(raw)) {
    vendor = 'Apple';
    model = 'iPad';
  } else if (osName === 'Macintosh' || osName === 'macOS') {
    vendor = 'Apple';
  } else if ((m = /Android [\d.]+; ([^;)]+?)(?: Build|;|\))/.exec(raw))) {
    const candidate = m[1].trim();
    // Chrome's reduced UA reports the literal "K" instead of the model.
    if (candidate !== 'K' && !/^(?:wv|Mobile)$/i.test(candidate)) {
      model = candidate;
      vendor = ANDROID_VENDORS.find(([re]) => re.test(candidate))?.[1] ?? null;
    }
  }

  return {
    browser: { name: browserName, version: browserVersion, major: majorOf(browserVersion) },
    engine: { name: engineName, version: engineVersion },
    os: { name: osName, version: osVersion },
    device: { type, vendor, model },
    isBotUA,
    isWebView,
    raw,
  };
}

/** Map the Darwin kernel-frozen macOS version in UA strings to a marketing name where possible. */
export function macosName(version: string | null): string | null {
  const major = majorOf(version);
  if (major === null) return null;
  return MAC_ALIAS.find(([v]) => major >= v)?.[1] ?? null;
}
