# fingerprint

Open-source browser fingerprinting in TypeScript, in two flavours:

| | **Light** `@fingerprint/light` | **Advanced** `@fingerprint/advanced` |
|---|---|---|
| Goal | *What is this?* Device, browser, screen, with a confidence score | *Everything a browser will tell us*, plus bot / tamper / privacy-tool detection |
| Size (min) | ~15 KB (~5 KB gzip) | ~45 KB |
| Time | ~20 ms | 4-5 s first call, ~0.8 s repeat, ~1.5-2 s with `fast: true` (see [Performance](#performance-and-stability)) |
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
| Plugins & blockers | plugin list with MIME types; **ad-blocker detection** with two independent methods (hidden bait elements + blocked ad request, each reported separately); DOM/global hints for extensions (Dark Reader, Grammarly, wallets, DevTools). No `chrome-extension://` probing |
| DRM | **Widevine** (L1/L2/L3, HDCP version), **PlayReady** (SL3000/SL2000, Edge/Windows), **FairPlay**, ClearKey. Tells you whether HD/4K streaming is possible. Skipped in Firefox (probing can trigger an install prompt) |
| Analysis | bot score, patched-native detection, cross-signal inconsistencies, privacy tools (Brave, Tor, RFP, GPC), private-window detection |

Opt-in collectors (`include: ['localFonts']`) are the ones that can trigger browser UI.

The ad-blocker network probe requests `static.doubleclick.net/instream/ad_status.js` (it is only reachable when no blocker is active). Use `exclude: ['adBlocker']` if you don't want that request.

## Performance and stability

```ts
await getAdvanced({ fast: true });   // skips WebRTC, AudioContext, DRM and the ad-blocker probe
```

Measured in headless Chrome 155 on a laptop: the first call takes 4-5 s, repeat calls ~0.8 s, `fast: true` ~1.5-2 s cold and ~0.5 s warm. The cold cost is almost entirely Chrome initialising subsystems on first use, and it happens **synchronously on the main thread**: the first `new RTCPeerConnection()` blocks for ~1.2 s, the first `new AudioContext()` ~0.5 s. That cannot be avoided from JavaScript, only skipped (`fast`, or `exclude: ['webrtc']`). `fast` changes the `visitorId` because fewer signals are mixed in.

What the library does to stay predictable:

- **Scheduling**: collectors yield to the browser between each other so the page can paint; long I/O-bound ones (DRM, WebRTC, network) start first and overlap with CPU-bound ones; timing-sensitive ones (`privateMode`, `refreshRate`) run last, alone, so sibling load cannot skew them.
- **Timeouts ignore main-thread stalls**: a sibling freezing the page for 2 s does not use up another collector's budget. The credit is capped at the original budget, and hidden tabs (whose timers the browser throttles) get none.
- **Wall-clock, not loop counts**: polling loops are bounded by time, because background tabs throttle `setTimeout` to ~1 Hz.
- **Stable signals only in the `visitorId`**: late-arriving network voices, refresh rate and other things that change between loads are reported but not hashed. `npm run test:browser` loads the page repeatedly and fails if the `visitorId` changes.

## The confidence score

```
score = (weight of signals we obtained / weight of all signals) - penalties      clamped to 0..1
```

- **Factors** answer *did we get enough independent evidence?*
- **Penalties** answer *does the evidence contradict itself or look manipulated?* (UA says Android but `navigator.platform` is `Win32`, mouse pointer on a "phone", canvas noise, patched natives, bot likelihood ...)
- Every factor and penalty is returned in `confidence.factors` / `confidence.penalties`, so a score is never a black box.

In Light the score is *confidence in the classification*. In Advanced it is *confidence the ID is reproducible and not forged*. Both are heuristics, not probabilities.

## Private window and Tor detection

`fp.analysis.tor` and `fp.analysis.privateMode`.

**Tor Browser / Mullvad Browser** (`tor.isTor`, `tor.score`, `tor.signals`): Tor Browser is Firefox ESR with `resistFingerprinting`, which leaves a recognisable pattern: a frozen Windows UA on every OS, UTC timezone, 2 cores, window size snapped to 200x100 steps (letterboxing), `screen` equal to the window, 100 ms timers. A verdict needs one structural tell (frozen UA or letterboxing) plus enough weaker hints. Mullvad Browser ships the same fingerprint on purpose, so the two cannot be told apart. This detects the *browser*; whether traffic really exits through Tor is only visible server-side (compare the IP with the public exit-node list).

**Private / incognito window** (`privateMode.isPrivate`: `true`, `false` or `null` = cannot tell):

| Browser | Method | Status |
|---|---|---|
| Chrome / Edge | IndexedDB commit timing: `durability: "strict"` vs `"relaxed"`. Incognito keeps IndexedDB in memory, so both cost the same (ratio ~1); on disk strict is ~3x slower | **verified** on Chrome and Edge 155 (headless and windowed): normal 2.7-3.2, incognito 1.0-1.2, threshold 1.3. Quota-based checks no longer work (identical in both modes) |
| Firefox | Origin Private File System throws a "Security error" in private windows; older builds fail IndexedDB with `InvalidStateError` | implemented, **untested here** |
| Safari | 17+: OPFS error "unknown transient reason"; 13-18: IndexedDB refuses to store a Blob; older: Web SQL / localStorage throw | implemented, **untested here** |

These techniques follow the ones documented by [detectIncognito.js](https://github.com/Joe12387/detectIncognito) and are reimplemented here. Browser vendors close such side channels on purpose, so treat `false` as "no evidence" and `null` as "undetectable". Confidence drops as the timing ratio approaches the threshold. Disks with near-free fsync (some Android storage) can make a normal profile look private, which is why the median of 7-15 rounds is used. The Chromium result is covered by `npm run test:browser`, which compares a normal and an off-the-record browser context.

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
packages/advanced   getAdvanced(), 28 collectors, bot / tamper analysis
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
npm test            # vitest (unit tests)
npm run test:browser # real Chrome/Edge: incognito + spoof detection
npm run typecheck
npm run build
```

## License

Apache-2.0, see [LICENSE](LICENSE).
