import { describe, expect, it } from 'vitest';
import { ConfidenceBuilder, classifyDevice, cyrb53, estimateDiagonal, hashOf, parseUserAgent, sizeClassOf, stableStringify } from '@fingerprint/core';

const UA = {
  win10Chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  pixel:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  galaxy:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  galaxyTab:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  reducedAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsungBrowser:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
  tv: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36',
  xbox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 Chrome/48.0.2564.82 Safari/537.36 Edge/20.02',
  ie11: 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko',
};

describe('parseUserAgent', () => {
  it('detects Chrome on Windows', () => {
    const r = parseUserAgent(UA.win10Chrome);
    expect(r.browser).toMatchObject({ name: 'Chrome', major: 126 });
    expect(r.os).toEqual({ name: 'Windows', version: '10' });
    expect(r.engine.name).toBe('Blink');
    expect(r.device.type).toBe('desktop');
  });

  it('prefers Edge over Chrome', () => {
    expect(parseUserAgent(UA.edge).browser.name).toBe('Edge');
  });

  it('detects Firefox on Linux', () => {
    const r = parseUserAgent(UA.firefoxLinux);
    expect(r.browser).toMatchObject({ name: 'Firefox', major: 127 });
    expect(r.engine.name).toBe('Gecko');
    expect(r.os.name).toBe('Linux');
  });

  it('detects Safari on macOS', () => {
    const r = parseUserAgent(UA.macSafari);
    expect(r.browser).toMatchObject({ name: 'Safari', major: 17 });
    expect(r.os).toEqual({ name: 'macOS', version: '10.15.7' });
    expect(r.engine.name).toBe('WebKit');
  });

  it('detects iPhone and uses WebKit even for Chrome on iOS', () => {
    const r = parseUserAgent(UA.iphone);
    expect(r.device).toMatchObject({ type: 'mobile', vendor: 'Apple', model: 'iPhone' });
    expect(r.os).toEqual({ name: 'iOS', version: '17.5' });
    const c = parseUserAgent(UA.iphoneChrome);
    expect(c.browser.name).toBe('Chrome');
    expect(c.engine.name).toBe('WebKit');
  });

  it('detects iPad', () => {
    const r = parseUserAgent(UA.ipad);
    expect(r.device.type).toBe('tablet');
    expect(r.os.name).toBe('iPadOS');
  });

  it('extracts Android model and vendor', () => {
    const p = parseUserAgent(UA.pixel);
    expect(p.device).toMatchObject({ type: 'mobile', model: 'Pixel 8', vendor: 'Google' });
    expect(parseUserAgent(UA.galaxy).device).toMatchObject({ model: 'SM-S918B', vendor: 'Samsung' });
  });

  it('treats Android without "Mobile" as tablet', () => {
    expect(parseUserAgent(UA.galaxyTab).device.type).toBe('tablet');
  });

  it('ignores the reduced-UA model placeholder "K"', () => {
    expect(parseUserAgent(UA.reducedAndroid).device.model).toBeNull();
  });

  it('detects Samsung Internet', () => {
    expect(parseUserAgent(UA.samsungBrowser).browser.name).toBe('Samsung Internet');
  });

  it('flags bots and headless browsers', () => {
    expect(parseUserAgent(UA.googlebot).device.type).toBe('bot');
    const h = parseUserAgent(UA.headless);
    expect(h.isBotUA).toBe(true);
    expect(h.browser.name).toBe('Chrome');
  });

  it('detects TVs and consoles', () => {
    expect(parseUserAgent(UA.tv).device.type).toBe('tv');
    expect(parseUserAgent(UA.xbox).device.type).toBe('console');
  });

  it('detects IE 11', () => {
    const r = parseUserAgent(UA.ie11);
    expect(r.browser).toMatchObject({ name: 'Internet Explorer', major: 11 });
    expect(r.engine.name).toBe('Trident');
  });

  it('survives garbage', () => {
    expect(parseUserAgent('').browser.name).toBe('Unknown');
    expect(parseUserAgent('???').device.type).toBeNull();
  });
});

const base = { hints: null, maxTouchPoints: 0, platform: '', coarsePointer: null, hover: null };

describe('classifyDevice', () => {
  it('is confident when UA, pointer, hints and screen agree on a phone', () => {
    const r = classifyDevice({
      ...base,
      ua: parseUserAgent(UA.pixel),
      hints: { brands: [], mobile: true, platform: 'Android' },
      maxTouchPoints: 5,
      shortSide: 412,
      longSide: 915,
      platform: 'Linux armv81',
      coarsePointer: true,
      hover: false,
    });
    expect(r.type).toBe('mobile');
    expect(r.confidence).toBeGreaterThan(0.85);
    expect(r.inconsistencies).toEqual([]);
  });

  it('flags a mobile UA with a mouse and a desktop screen', () => {
    const r = classifyDevice({
      ...base,
      ua: parseUserAgent(UA.pixel),
      shortSide: 1080,
      longSide: 1920,
      platform: 'Win32',
      coarsePointer: false,
      hover: true,
    });
    expect(r.inconsistencies.length).toBeGreaterThanOrEqual(2);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('recognises iPadOS masquerading as a Mac', () => {
    const r = classifyDevice({ ...base, ua: parseUserAgent(UA.macSafari), maxTouchPoints: 5, platform: 'MacIntel', shortSide: 820, longSide: 1180 });
    expect(r.type).toBe('tablet');
  });

  it('detects "desktop site" mode on a phone', () => {
    const r = classifyDevice({
      ...base,
      ua: parseUserAgent(UA.firefoxLinux),
      maxTouchPoints: 5,
      shortSide: 412,
      longSide: 915,
      platform: 'Linux x86_64',
      coarsePointer: true,
      hover: false,
    });
    expect(r.type).toBe('mobile');
    expect(r.inconsistencies.join()).toMatch(/desktop site/);
  });

  it('catches UA OS vs client hint platform mismatch', () => {
    const r = classifyDevice({
      ...base,
      ua: parseUserAgent(UA.win10Chrome),
      hints: { brands: [], mobile: false, platform: 'macOS' },
      shortSide: 1080,
      longSide: 1920,
    });
    expect(r.inconsistencies.join()).toMatch(/platform/);
  });

  it('reports bots with high confidence', () => {
    const r = classifyDevice({ ...base, ua: parseUserAgent(UA.googlebot), shortSide: 0, longSide: 0 });
    expect(r.type).toBe('bot');
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

describe('ConfidenceBuilder', () => {
  it('scores present weight over total and subtracts penalties', () => {
    const r = new ConfidenceBuilder().factor('a', 1, true).factor('b', 1, true).factor('c', 2, false).penalty('x', 0.1, 'x').build();
    expect(r.score).toBe(0.4);
    expect(r.level).toBe('medium');
  });

  it('clamps to 0..1', () => {
    expect(new ConfidenceBuilder().factor('a', 1, true).build().score).toBe(1);
    expect(new ConfidenceBuilder().factor('a', 1, false).penalty('x', 5, 'x').build().score).toBe(0);
  });
});

describe('screen helpers', () => {
  it('classifies width', () => {
    expect(sizeClassOf(390)).toBe('xs');
    expect(sizeClassOf(1920)).toBe('xl');
  });

  it('estimates phone diagonal from CSS pixels', () => {
    const d = estimateDiagonal(412, 915, 2.6, 'mobile');
    expect(d.value).toBeGreaterThan(5.5);
    expect(d.value).toBeLessThan(6.8);
    expect(d.confidence).toBeGreaterThan(0.5);
  });

  it('gives desktop estimates low confidence', () => {
    const d = estimateDiagonal(1920, 1080, 1, 'desktop');
    expect(d.value).toBeCloseTo(22.9, 0);
    expect(d.confidence).toBeLessThan(0.4);
  });
});

describe('hashing', () => {
  it('is independent of key order', async () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(await hashOf({ a: 1, b: 2 })).toBe(await hashOf({ b: 2, a: 1 }));
  });

  it('sha256 is 64 hex chars; cyrb53 is deterministic', async () => {
    expect(await hashOf('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(cyrb53('abc')).toBe(cyrb53('abc'));
    expect(cyrb53('abc')).not.toBe(cyrb53('abd'));
  });
});
