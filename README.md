# fingerprint

Open-source browser fingerprinting in TypeScript, in two flavours:

| | **Light** `@fingerprint/light` | **Advanced** `@fingerprint/advanced` |
|---|---|---|
| Goal | *What is this?* Device, browser, screen, with a confidence score | *Everything a browser will tell us*, plus bot / tamper / privacy-tool detection |
| Size (min) | ~15 KB (~5 KB gzip) | ~45 KB |
| Time | ~20 ms | ~1.5 s |
| Prompts / network | none | none by default; WebRTC contacts a public STUN server (opt out with `exclude`) |
| ID | coarse `visitorId` (groups similar devices) | high-entropy `visitorId` (~25 bits estimated) |

Everything runs client-side. No dependencies, no server, no telemetry.

## Quick start

```bash
npm install
npm run build
npm run demo        # http://localhost:5173
```

```ts
import { getLight } from '@fingerprint/light';

const fp = await getLight();
fp.device.type;               // 'mobile' | 'tablet' | 'desktop' | 'tv' | 'console' | 'wearable' | 'bot'
fp.device.model;              // 'Pixel 8' (Chromium client hints), 'iPhone', ...
fp.browser.name;              // 'Chrome' | 'Edge' | 'Brave' | 'Safari' | 'Samsung Internet' ...
fp.screen.physicalWidth;      // 1170  (css px * devicePixelRatio)
fp.screen.estimatedDiagonalInches; // { value: 6.1, confidence: 0.6, method: '...' }
fp.confidence;                // { score: 0.91, level: 'very-high', factors: [...], penalties: [...] }
```

```ts
import { getAdvanced } from '@fingerprint/advanced';

const fp = await getAdvanced({ exclude: ['webrtc'] });
fp.visitorId;
fp.analysis.bot;              // { score: 0.97, isBot: true, signals: [{ id: 'webdriver', ... }] }
fp.analysis.tampering;        // ['HTMLCanvasElement.toDataURL']
fp.analysis.privacyTools;     // [{ name: 'Brave Shields', ... }]
fp.components.webgl;          // { ok: true, value: {...}, hash, ms, stable }
```

Via script tag: `FingerprintLight.getLight()` / `FingerprintAdvanced.getAdvanced()` (`dist/index.global.js`).

## What Light reports

- **Device**: type, vendor, model, OS (with Windows 11 / macOS name resolution via client hints), CPU cores, memory, touch capability.
- **Browser**: name, version, engine, WebView, Brave, UA-CH brands.
- **Screen**: CSS and physical pixels, DPR, orientation, viewport, zoom, colour gamut, HDR, multi-monitor, size class and an **estimated physical diagonal** (browsers don't expose real DPI, so this is a heuristic with an honest confidence value).
- **Locale**, privacy flags (DNT, GPC), `inconsistencies[]` and `reasons[]` explaining the verdict.

## What Advanced adds

| Group | Signals |
|---|---|
| Rendering | Canvas (with noise-injection detection), WebGL 1/2 (unmasked GPU, limits, extensions, render hash), audio (OfflineAudioContext), fonts (~130 probes), CSS system colours/fonts, exact DPR via `resolution` bisect |
| System | full `navigator`, plugins, mime types, timezone history, Intl, Math quirks, API/CSS feature support, JS engine fingerprint, timer precision |
| Network | WebRTC ICE (public/local IP, mDNS, codecs), Network Information API |
| Media | codec support matrix, speech voices, camera/mic counts, DRM (opt-in) |
| Hardware | `fp.hardware` regrouped into cpu / memory / gpu (class + WebGPU adapter) / display (refresh rate) / input / audio / camera / sensors / connectivity, plus `fp.battery`, permissions state, storage quota / private-mode hint |
| Browser specs | cookies (enabled + writable), Apple Pay version, Payment Request, WebAuthn, WebAssembly (SIMD/threads), JS syntax support, HTTP version, secure/isolated context |
| Plugins & extensions | plugin list with MIME types, ad-blocker, DOM/global hints (Dark Reader, Grammarly, wallets, DevTools). No `chrome-extension://` probing |
| Analysis | bot score, patched-native detection, cross-signal inconsistencies, privacy tools (Brave, Tor/RFP, GPC) |

Opt-in collectors (`include: ['localFonts', 'drm']`) are the ones that can trigger browser UI.

## The confidence score

```
score = (weight of signals we obtained / weight of all signals) - penalties      clamped to 0..1
```

- **Factors** answer *did we get enough independent evidence?*
- **Penalties** answer *does the evidence contradict itself or look manipulated?* (UA says Android but `navigator.platform` is `Win32`, mouse pointer on a "phone", canvas noise, patched natives, bot likelihood ...)
- Every factor and penalty is returned in `confidence.factors` / `confidence.penalties`, so a score is never a black box.

In Light the score is *confidence in the classification*. In Advanced it is *confidence the ID is reproducible and not forged*. Both are heuristics, not probabilities.

## Manipulation score

`fp.analysis.manipulation` answers: *how likely was this visitor's fingerprint altered on purpose?* It is separate from the bot score (a human with a spoofing extension is not a bot).

| Category | What is checked |
|---|---|
| `cross-context` | navigator values in the page vs. a fresh iframe vs. a Web Worker. Spoofing extensions usually patch only the page. Strongest signal. |
| `tampering` | native functions whose `toString()` is no longer `[native code]`; `navigator.platform`/`hardwareConcurrency`/... redefined on the instance |
| `spoofing` | contradictions: UA vs. client hints vs. `navigator.platform` vs. WebGL GPU, timezone vs. Date offset, `screen` vs. `device-width` media query, UA version vs. client-hint version, touch/pointer vs. device type |
| `noise` | canvas output differing between two identical draws (randomisation) |
| `privacy` | legitimate tooling (Brave farbling, Tor/RFP), scored low on purpose |

Signals combine as `1 - prod(1 - weight)`; `levels`: none <0.15, low <0.4, medium <0.7, high. The advanced confidence score subtracts 40% of it. Every signal is returned with its category and detail, so you can show *why*.

Tested against a page that overrides `navigator.platform`, `hardwareConcurrency` and `toDataURL`: score 0.98, four categories hit. A clean Chrome/Edge scores 0. A sufficiently careful anti-detect browser that patches every realm consistently can still evade it.

## Layout

```
packages/core       types, UA parser, client hints, device classifier, screen, confidence, hashing
packages/light      getLight()
packages/advanced   getAdvanced(), 27 collectors, bot / tamper analysis
examples/           demo page + tiny static server
tests/              vitest
```

## Honest limits

- Fingerprinting is probabilistic. Browsers fight it (Safari, Firefox RFP, Brave, Tor). Expect lower stability there; the confidence score says so.
- Light's `visitorId` is deliberately coarse. It is not a unique person ID.
- Bot detection catches default automation and lazy stealth, not a determined adversary.

## Privacy and responsible use

Fingerprints are personal data under GDPR/ePrivacy in most jurisdictions. Use this for fraud prevention, bot defence, analytics you have a legal basis for, and research. Do not use it to track people who declined consent. `fp.flags.doNotTrack` and `globalPrivacyControl` are exposed so you can honour them.

## Development

```bash
npm test            # vitest
npm run typecheck
npm run build
```

## License

Apache-2.0, see [LICENSE](LICENSE).
