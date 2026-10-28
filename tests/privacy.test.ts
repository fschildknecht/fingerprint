import { describe, expect, it } from 'vitest';
import { classifyDurability, detectTor } from '../packages/advanced/src/privacy';

const light = (over: any = {}): any => ({
  browser: { engine: 'Gecko' },
  locale: { timezone: 'UTC', timezoneOffsetMinutes: 0 },
  screen: { width: 1400, height: 900, devicePixelRatio: 1, colorDepth: 24, viewport: { innerWidth: 1400, innerHeight: 900 } },
  ...over,
});
const torEnv = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0', hardwareConcurrency: 2, languages: ['en-US', 'en'] };
const torParts = { engine: { timePrecisionMs: 100 }, speechVoices: { count: 0 }, webgl: { supported: true } };

describe('detectTor', () => {
  it('recognises the Tor Browser fingerprint', () => {
    const r = detectTor(light(), torParts, torEnv);
    expect(r.isTor).toBe(true);
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['frozen-ua', 'letterboxing', 'utc', 'coarse-timer']));
  });

  it('does not flag ordinary Firefox', () => {
    const r = detectTor(
      light({ locale: { timezone: 'Europe/Zurich', timezoneOffsetMinutes: -60 }, screen: { width: 3440, height: 1440, devicePixelRatio: 1, colorDepth: 24, viewport: { innerWidth: 1479, innerHeight: 1273 } } }),
      { engine: { timePrecisionMs: 0.005 }, speechVoices: { count: 19 } },
      { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0', hardwareConcurrency: 22, languages: ['de-CH', 'de'] },
    );
    expect(r.isTor).toBe(false);
  });

  it('is never Tor outside Gecko', () => {
    expect(detectTor(light({ browser: { engine: 'Blink' } }), torParts, torEnv)).toMatchObject({ isTor: false, score: 0 });
  });

  it('needs a structural tell, not just many weak hints', () => {
    // UTC + 2 cores + en-US + no voices + coarse timer, but a normal UA and an un-snapped window.
    const r = detectTor(
      light({ screen: { width: 1920, height: 1080, devicePixelRatio: 1, colorDepth: 24, viewport: { innerWidth: 1477, innerHeight: 913 } } }),
      torParts,
      { ...torEnv, userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0' },
    );
    expect(r.score).toBeGreaterThan(0.4);
    expect(r.isTor).toBe(false);
  });
});

describe('classifyDurability (Chromium incognito timing)', () => {
  // Medians measured on Chrome/Edge 155: normal 2.7-3.2, incognito 1.0-1.2
  it('flags in-memory storage (ratio ~1) as private', () => {
    expect(classifyDurability([0.9, 1.0, 1.05, 1.1, 1.2])).toMatchObject({ isPrivate: true, confidence: 0.88 });
  });

  it('treats disk-backed storage (ratio ~3) as normal', () => {
    expect(classifyDurability([2.3, 2.9, 3.0, 3.2, 3.6])).toMatchObject({ isPrivate: false, confidence: 0.88 });
  });

  it('uses the median, so single outliers do not flip the verdict', () => {
    expect(classifyDurability([1.0, 1.0, 1.1, 1.0, 9.5]).isPrivate).toBe(true);
    expect(classifyDurability([3.0, 3.1, 2.9, 3.0, 0.2]).isPrivate).toBe(false);
  });

  it('lowers confidence near the threshold', () => {
    expect(classifyDurability([1.25, 1.25, 1.25]).confidence).toBeLessThan(0.8);
    expect(classifyDurability([1.5, 1.5, 1.5]).confidence).toBeLessThan(0.8);
  });
});
