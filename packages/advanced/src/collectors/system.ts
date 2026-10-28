/* eslint-disable @typescript-eslint/no-explicit-any */
import { mq, nav, round } from '@fingerprint/core';
import type { Collector } from './types';

export const navigatorInfo: Collector = {
  id: 'navigator',
  stable: true,
  bits: 6,
  run() {
    const n = nav();
    const plugins = Array.from(n.plugins ?? []).map((p: any) => p.name);
    const mimeTypes = Array.from(n.mimeTypes ?? []).map((m: any) => m.type);
    const perfMem = (performance as any).memory;
    return {
      userAgent: n.userAgent,
      appVersion: n.appVersion,
      appName: n.appName,
      appCodeName: n.appCodeName,
      product: n.product,
      productSub: n.productSub,
      platform: n.platform,
      vendor: n.vendor,
      vendorSub: n.vendorSub,
      oscpu: n.oscpu ?? null,
      buildID: n.buildID ?? null,
      language: n.language,
      languages: n.languages ? Array.from(n.languages) : [],
      hardwareConcurrency: n.hardwareConcurrency ?? null,
      deviceMemory: n.deviceMemory ?? null,
      maxTouchPoints: n.maxTouchPoints ?? null,
      cookieEnabled: n.cookieEnabled,
      doNotTrack: n.doNotTrack ?? (window as any).doNotTrack ?? null,
      globalPrivacyControl: n.globalPrivacyControl ?? null,
      pdfViewerEnabled: n.pdfViewerEnabled ?? null,
      webdriver: n.webdriver ?? null,
      javaEnabled: typeof n.javaEnabled === 'function' ? n.javaEnabled() : null,
      plugins,
      mimeTypes,
      jsHeapSizeLimit: perfMem?.jsHeapSizeLimit ?? null,
      isBrave: !!n.brave,
      navigatorKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(n)).length,
      windowKeys: Object.getOwnPropertyNames(window).length,
    };
  },
};

export const timezone: Collector = {
  id: 'timezone',
  stable: true,
  bits: 5,
  run() {
    const dtf = Intl.DateTimeFormat().resolvedOptions();
    // Historic offsets identify the tz database variant, not just the zone name.
    const offsets = [1970, 1980, 1990, 2000, 2010, 2020, 2024].flatMap((y) => [
      new Date(y, 0, 1).getTimezoneOffset(),
      new Date(y, 6, 1).getTimezoneOffset(),
    ]);
    return {
      timeZone: dtf.timeZone,
      locale: dtf.locale,
      offsetNow: new Date().getTimezoneOffset(),
      historicOffsets: offsets,
      dateString: new Date(0).toString(),
      toLocale: new Date(Date.UTC(2020, 11, 31, 23, 59, 59)).toLocaleString(),
    };
  },
};

export const intl: Collector = {
  id: 'intl',
  stable: true,
  bits: 4,
  run() {
    const I: any = Intl;
    const sample = 1234567.891;
    const d = new Date(Date.UTC(2020, 5, 15, 13, 45, 30));
    const safe = <T>(f: () => T): T | null => {
      try {
        return f();
      } catch {
        return null;
      }
    };
    return {
      dateTime: Intl.DateTimeFormat().resolvedOptions(),
      number: Intl.NumberFormat().resolvedOptions(),
      collator: Intl.Collator().resolvedOptions(),
      plural: safe(() => new Intl.PluralRules().resolvedOptions().locale),
      formatNumber: sample.toLocaleString(),
      formatCurrency: safe(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(sample)),
      formatDate: d.toLocaleDateString(undefined, { dateStyle: 'full' }),
      formatTime: d.toLocaleTimeString(undefined, { timeStyle: 'long' }),
      relativeTime: safe(() => new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-1, 'day')),
      list: safe(() => new Intl.ListFormat().format(['a', 'b', 'c'])),
      displayName: safe(() => new I.DisplayNames(undefined, { type: 'region' }).of('CH')),
      supported: safe(() =>
        Object.fromEntries(
          ['calendar', 'collation', 'currency', 'numberingSystem', 'timeZone', 'unit'].map((k) => [k, I.supportedValuesOf(k).length]),
        ),
      ),
    };
  },
};

export const math: Collector = {
  id: 'math',
  stable: true,
  bits: 2,
  run() {
    const m = Math as any;
    const v = (f: () => number) => String(f());
    // Results of transcendental functions differ in the last bits between engines/CPUs/OS libm.
    return {
      acos: v(() => m.acos(0.123124234234234242)),
      acosh: v(() => m.acosh(1e308)),
      asinh: v(() => m.asinh(1)),
      atanh: v(() => m.atanh(0.5)),
      cbrt: v(() => m.cbrt(100)),
      cosh: v(() => m.cosh(10.5)),
      expm1: v(() => m.expm1(1)),
      log1p: v(() => m.log1p(10)),
      sinh: v(() => m.sinh(1)),
      tanh: v(() => m.tanh(1)),
      tan: v(() => m.tan(-1e300)),
      sin: v(() => m.sin(Math.PI * 1e10)),
      pow: v(() => m.pow(Math.PI, -100)),
      exp: v(() => m.exp(100)),
    };
  },
};

const MEDIA_FEATURES: [string, string[]][] = [
  ['prefers-color-scheme', ['light', 'dark']],
  ['prefers-reduced-motion', ['reduce', 'no-preference']],
  ['prefers-reduced-transparency', ['reduce']],
  ['prefers-reduced-data', ['reduce']],
  ['prefers-contrast', ['more', 'less', 'custom', 'no-preference']],
  ['forced-colors', ['active']],
  ['inverted-colors', ['inverted']],
  ['color-gamut', ['srgb', 'p3', 'rec2020']],
  ['dynamic-range', ['high']],
  ['video-dynamic-range', ['high']],
  ['pointer', ['none', 'coarse', 'fine']],
  ['any-pointer', ['none', 'coarse', 'fine']],
  ['hover', ['none', 'hover']],
  ['any-hover', ['none', 'hover']],
  ['display-mode', ['browser', 'standalone', 'minimal-ui', 'fullscreen', 'picture-in-picture']],
  ['orientation', ['portrait', 'landscape']],
  ['scripting', ['none', 'initial-only', 'enabled']],
  ['update', ['none', 'slow', 'fast']],
  ['overflow-block', ['none', 'scroll', 'paged']],
  ['overflow-inline', ['none', 'scroll']],
];

const SYSTEM_COLORS = [
  'ActiveText', 'ButtonBorder', 'ButtonFace', 'ButtonText', 'Canvas', 'CanvasText', 'Field', 'FieldText', 'GrayText',
  'Highlight', 'HighlightText', 'LinkText', 'Mark', 'MarkText', 'VisitedText', 'AccentColor', 'AccentColorText',
  'ActiveBorder', 'ActiveCaption', 'AppWorkspace', 'Background', 'ButtonHighlight', 'ButtonShadow', 'CaptionText',
  'InactiveBorder', 'InactiveCaption', 'InactiveCaptionText', 'InfoBackground', 'InfoText', 'Menu', 'MenuText',
  'Scrollbar', 'ThreeDDarkShadow', 'ThreeDFace', 'ThreeDHighlight', 'ThreeDLightShadow', 'ThreeDShadow', 'Window',
  'WindowFrame', 'WindowText',
];

const SYSTEM_FONTS = ['caption', 'icon', 'menu', 'message-box', 'small-caption', 'status-bar'];

/** Bisect the CSS `resolution` media feature: reveals the exact devicePixelRatio even when zoomed. */
function probeResolution(): number | null {
  if (mq('(min-resolution: 0.01dppx)') === null) return null;
  let lo = 0.1;
  let hi = 8;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (matchMedia(`(min-resolution: ${mid}dppx)`).matches) lo = mid;
    else hi = mid;
  }
  return round((lo + hi) / 2, 4);
}

export const css: Collector = {
  id: 'css',
  stable: true,
  bits: 6,
  run() {
    const features: Record<string, string[]> = {};
    for (const [feature, values] of MEDIA_FEATURES) {
      features[feature] = values.filter((v) => mq(`(${feature}: ${v})`));
    }

    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:-9999px;visibility:hidden';
    document.body.appendChild(el);
    const colors: Record<string, string> = {};
    const sysFonts: Record<string, string> = {};
    try {
      for (const c of SYSTEM_COLORS) {
        el.style.color = '';
        el.style.color = c;
        colors[c] = el.style.color ? getComputedStyle(el).color : '';
      }
      for (const f of SYSTEM_FONTS) {
        el.style.font = '';
        el.style.font = f;
        const cs = getComputedStyle(el);
        sysFonts[f] = `${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}`;
      }
    } finally {
      el.remove();
    }
    return { mediaFeatures: features, systemColors: colors, systemFonts: sysFonts, resolutionDppx: probeResolution() };
  },
};

const APIS = [
  'AbortController', 'AudioWorklet', 'BarcodeDetector', 'BackgroundFetchManager', 'BroadcastChannel', 'CSSPaintWorklet',
  'ClipboardItem', 'CompressionStream', 'ContactsManager', 'CookieStore', 'CredentialsContainer', 'CustomElementRegistry',
  'DeviceMotionEvent', 'DeviceOrientationEvent', 'EyeDropper', 'FileSystemFileHandle', 'FontFace', 'GPU', 'Gamepad',
  'HID', 'IdleDetector', 'ImageCapture', 'IntersectionObserver', 'LaunchQueue', 'MediaSession', 'MediaStreamTrackProcessor',
  'NDEFReader', 'NavigateEvent', 'Notification', 'OffscreenCanvas', 'PaymentRequest', 'PerformanceObserver',
  'PictureInPictureWindow', 'PublicKeyCredential', 'RTCPeerConnection', 'ReportingObserver', 'ResizeObserver',
  'Sanitizer', 'Scheduler', 'Serial', 'ServiceWorker', 'SharedArrayBuffer', 'SharedWorker', 'SpeechRecognition',
  'SpeechSynthesis', 'TrustedTypePolicy', 'USB', 'VideoDecoder', 'VirtualKeyboard', 'VisualViewport', 'WakeLock',
  'WebAssembly', 'WebTransport', 'WebSocket', 'WebSocketStream', 'WindowControlsOverlay', 'XRSystem', 'webkitSpeechRecognition',
  'queryLocalFonts', 'showOpenFilePicker', 'getScreenDetails', 'structuredClone', 'requestIdleCallback', 'navigation',
  'documentPictureInPicture', 'Highlight', 'ViewTransition', 'SpeechGrammarList', 'webkitRequestFileSystem', 'chrome',
  'opr', 'safari', 'InstallTrigger', 'mozInnerScreenX', 'ApplePaySession', 'GestureEvent',
];

const CSS_FEATURES = [
  'display: grid', 'display: contents', 'aspect-ratio: 1', 'backdrop-filter: blur(1px)', 'container-type: inline-size',
  'selector(:has(a))', 'selector(:is(a))', 'color: color-mix(in srgb, red, blue)', 'color: oklch(50% 0.2 200)',
  'text-wrap: balance', 'scroll-snap-type: x', 'overscroll-behavior: contain', 'accent-color: red', 'field-sizing: content',
  'view-transition-name: x', 'animation-timeline: scroll()', 'anchor-name: --a', 'interpolate-size: allow-keywords',
  'position: sticky', 'zoom: 1', '-webkit-text-stroke: 1px', '-moz-appearance: none', 'font-variation-settings: normal',
];

export const features: Collector = {
  id: 'features',
  stable: true,
  bits: 5,
  run() {
    const w = window as any;
    const apis = APIS.filter((a) => a in w || (typeof navigator !== 'undefined' && a.toLowerCase() in navigator));
    const cssSupport = CSS_FEATURES.filter((f) => {
      try {
        if (f.startsWith('selector(')) return CSS.supports(f);
        const i = f.indexOf(':');
        return CSS.supports(f.slice(0, i).trim(), f.slice(i + 1).trim());
      } catch {
        return false;
      }
    });
    const navKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(navigator)).sort();
    return { apis, css: cssSupport, navigatorProperties: navKeys };
  },
};

export const engine: Collector = {
  id: 'engine',
  stable: true,
  bits: 2,
  run() {
    let errorMessage = '';
    try {
      (null as any).x;
    } catch (e: any) {
      errorMessage = String(e.message);
    }
    const stack = (() => {
      try {
        throw new Error('x');
      } catch (e: any) {
        return String(e.stack ?? '').split('\n')[1] ?? '';
      }
    })();
    return {
      errorMessage,
      // "at fn (url:1:1)" is V8, "fn@url:1:1" is SpiderMonkey/JavaScriptCore.
      stackStyle: stack.trim().startsWith('at ') ? 'v8' : stack.includes('@') ? 'gecko-or-jsc' : 'unknown',
      evalLength: eval.toString().length,
      nativeToString: Function.prototype.toString.call(Function.prototype.toString).length,
      timePrecisionMs: timePrecision(),
    };
  },
};

/** Smallest observable step of performance.now(). 100ms/1ms means Tor/RFP; 0.1ms Chromium; 0.005 isolated. */
function timePrecision(): number | null {
  if (typeof performance === 'undefined') return null;
  let min = Infinity;
  let last = performance.now();
  for (let i = 0; i < 2000; i++) {
    const t = performance.now();
    const d = t - last;
    if (d > 0 && d < min) min = d;
    last = t;
  }
  return Number.isFinite(min) ? Number(min.toPrecision(1)) : null;
}
