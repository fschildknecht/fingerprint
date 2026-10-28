/* eslint-disable @typescript-eslint/no-explicit-any */
import { mq, nav, withTimeout } from '@fingerprint/core';
import type { Collector } from './types';

const PDF_VIEWERS = new Set([
  'PDF Viewer',
  'Chrome PDF Viewer',
  'Chromium PDF Viewer',
  'Microsoft Edge PDF Viewer',
  'WebKit built-in PDF',
]);

/** Installed plugins with their MIME types. Modern browsers return a fixed PDF-viewer list by spec. */
export const plugins: Collector = {
  id: 'plugins',
  stable: true,
  bits: 2,
  run() {
    const list = Array.from((nav().plugins ?? []) as ArrayLike<any>).map((p: any) => ({
      name: p.name,
      filename: p.filename,
      description: p.description,
      mimeTypes: Array.from({ length: p.length }, (_, i) => p[i]?.type).filter(Boolean),
    }));
    return {
      count: list.length,
      plugins: list,
      pdfViewerEnabled: nav().pdfViewerEnabled ?? null,
      // Chrome 94+/Firefox 99+/Safari 15.4+ hard-code this list, so it carries almost no entropy.
      onlyStandardPdfViewers: list.length > 0 && list.every((p) => PDF_VIEWERS.has(p.name)),
    };
  },
};

const WASM = {
  simd: [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11],
  bulkMemory: [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12, 0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 0, 11],
  threads: [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11],
};

/** Does `new Function` accept this syntax? */
const syntax = (code: string): boolean => {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
};

async function applePay(): Promise<unknown> {
  const A = (window as any).ApplePaySession;
  if (!A) return { available: false };
  let maxVersion: number | null = null;
  for (let v = 20; v >= 1; v--) {
    try {
      if (A.supportsVersion(v)) {
        maxVersion = v;
        break;
      }
    } catch {
      /* unsupported */
    }
  }
  let canMakePayments: boolean | null = null;
  let canMakePaymentsWithActiveCard: string | null = null;
  try {
    canMakePayments = A.canMakePayments();
  } catch {
    /* insecure context or blocked in iframe */
  }
  return { available: true, maxVersion, canMakePayments, canMakePaymentsWithActiveCard };
}

async function webauthn(): Promise<unknown> {
  const P = (window as any).PublicKeyCredential;
  if (!P) return { supported: false };
  const ask = async (name: string) => {
    try {
      return typeof P[name] === 'function' ? await withTimeout<boolean>(P[name](), 1000) : null;
    } catch {
      return null;
    }
  };
  return {
    supported: true,
    platformAuthenticator: await ask('isUserVerifyingPlatformAuthenticatorAvailable'),
    conditionalMediation: await ask('isConditionalMediationAvailable'),
    clientCapabilities: typeof P.getClientCapabilities === 'function',
  };
}

function cookieWritable(): boolean {
  try {
    const k = '__fp_cookie_probe__';
    document.cookie = `${k}=1; SameSite=Lax; path=/`;
    const ok = document.cookie.includes(`${k}=1`);
    document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    return ok;
  } catch {
    return false;
  }
}

/** Declared capabilities of the browser itself: cookies, payments, WebAuthn, WASM, JS syntax, HTTP version. */
export const browserSpecs: Collector = {
  id: 'browserSpecs',
  stable: true,
  bits: 4,
  timeoutMs: 3000,
  async run() {
    const w = window as any;
    const n = nav();
    const nt = performance.getEntriesByType?.('navigation')?.[0] as any;

    const wasm = typeof WebAssembly === 'object'
      ? Object.fromEntries(Object.entries(WASM).map(([k, bytes]) => {
          try {
            return [k, WebAssembly.validate(new Uint8Array(bytes))];
          } catch {
            return [k, false];
          }
        }))
      : null;

    return {
      cookies: { enabled: n.cookieEnabled ?? null, writable: cookieWritable() },
      javascript: { enabled: true, userAgentDataAvailable: !!n.userAgentData },
      applePay: await applePay(),
      paymentRequest: !!w.PaymentRequest,
      webauthn: await webauthn(),
      webAssembly: wasm && { supported: true, ...wasm, sharedMemory: typeof SharedArrayBuffer === 'function' },
      jsFeatures: {
        optionalChaining: syntax('return a?.b'),
        nullishCoalescing: syntax('return a ?? b'),
        classFields: syntax('class A { x = 1 }'),
        privateFields: syntax('class A { #x = 1 }'),
        topLevelAwaitSyntax: syntax('async () => { await 1 }'),
        regexLookbehind: syntax('return /(?<=a)b/'),
        bigint: typeof BigInt === 'function',
        arrayAt: typeof ([] as any).at === 'function',
        findLast: typeof ([] as any).findLast === 'function',
        objectHasOwn: typeof (Object as any).hasOwn === 'function',
        structuredClone: typeof structuredClone === 'function',
        intlSegmenter: typeof (Intl as any).Segmenter === 'function',
        temporal: typeof w.Temporal === 'object',
        arrayFromAsync: typeof (Array as any).fromAsync === 'function',
        setMethods: typeof (new Set() as any).union === 'function',
      },
      document: {
        characterSet: document.characterSet,
        compatMode: document.compatMode,
        contentType: document.contentType,
        fullscreenEnabled: document.fullscreenEnabled,
        pictureInPictureEnabled: (document as any).pictureInPictureEnabled ?? null,
      },
      context: {
        secureContext: w.isSecureContext ?? null,
        crossOriginIsolated: w.crossOriginIsolated ?? null,
        inIframe: window.top !== window.self,
        standalonePwa: mq('(display-mode: standalone)'),
        httpProtocol: nt?.nextHopProtocol ?? null,
        notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : null,
        online: n.onLine ?? null,
      },
    };
  },
};

const DOM_MARKERS: [string, string, string][] = [
  ['Dark Reader', 'html', 'data-darkreader-mode'],
  ['Grammarly', 'body', 'data-gr-ext-installed'],
  ['Grammarly', 'body', 'data-new-gr-c-s-check-loaded'],
  ['LanguageTool', 'body', 'data-lt-installed'],
  ['ColorZilla', 'body', 'cz-shortcut-listen'],
  ['LastPass', 'html', 'data-lastpass-root'],
  ['Honey', 'html', 'data-honey-extension-installed'],
];

const GLOBAL_MARKERS: [string, string][] = [
  ['Ethereum wallet (MetaMask etc.)', 'ethereum'],
  ['Solana wallet', 'solana'],
  ['Redux DevTools', '__REDUX_DEVTOOLS_EXTENSION__'],
  ['React DevTools', '__REACT_DEVTOOLS_GLOBAL_HOOK__'],
  ['Vue DevTools', '__VUE_DEVTOOLS_GLOBAL_HOOK__'],
];

/**
 * Best-effort extension hints (ad blockers: see the adBlocker collector). Does NOT probe chrome-extension:// URLs (slow, invasive, and
 * blocked by most browsers). Content scripts may not have run yet, so absence proves nothing.
 */
export const extensions: Collector = {
  id: 'extensions',
  stable: false,
  bits: 3,
  timeoutMs: 2000,
  async run() {
    const found = new Set<string>();
    for (const [name, sel, attr] of DOM_MARKERS) {
      if (document.querySelector(sel)?.hasAttribute(attr)) found.add(name);
    }
    for (const [name, key] of GLOBAL_MARKERS) if (key in window) found.add(name);
    if (document.querySelector('grammarly-desktop-integration, grammarly-extension')) found.add('Grammarly');
    return { detected: [...found].sort() };
  },
};
