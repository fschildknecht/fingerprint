/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DeviceType, ScreenInfo } from './types';
import { hasWindow, mq, round } from './utils';

export function sizeClassOf(cssWidth: number): ScreenInfo['sizeClass'] {
  if (cssWidth < 480) return 'xs';
  if (cssWidth < 768) return 'sm';
  if (cssWidth < 1024) return 'md';
  if (cssWidth < 1440) return 'lg';
  if (cssWidth < 2200) return 'xl';
  return 'xxl';
}

/**
 * Estimate the physical screen diagonal. Browsers never expose real DPI, so this is a
 * heuristic and always carries a low-to-medium confidence:
 *  - phones/tablets: CSS pixels are specified as ~1/160 inch (Android dp) so inches ~ css / 160
 *  - desktops: no reliable ratio exists (92 ppi desktop monitor ... 220 ppi laptop); we use the
 *    DPR to pick a plausible ppi band: dpr 1 -> ~96 ppi, dpr 1.25-1.5 -> ~125, dpr >= 2 -> ~200.
 */
export function estimateDiagonal(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  type: DeviceType,
): ScreenInfo['estimatedDiagonalInches'] {
  if (!cssWidth || !cssHeight) return { value: null, confidence: 0, method: 'no screen size' };
  const diagCss = Math.hypot(cssWidth, cssHeight);
  if (type === 'mobile' || type === 'tablet' || type === 'wearable') {
    return { value: round(diagCss / 160, 1), confidence: 0.6, method: 'css px / 160 (device-independent pixel)' };
  }
  const ppi = dpr >= 1.9 ? 200 : dpr >= 1.2 ? 125 : 96;
  const diagPhysicalPx = diagCss * dpr;
  return {
    value: round(diagPhysicalPx / ppi, 1),
    confidence: type === 'tv' ? 0.15 : 0.25,
    method: `physical px / assumed ${ppi} ppi (from devicePixelRatio ${dpr})`,
  };
}

export function collectScreen(deviceType: DeviceType = 'unknown'): ScreenInfo {
  const hasW = hasWindow();
  const s: any = typeof screen !== 'undefined' ? screen : {};
  const w: any = hasW ? window : {};
  const dpr = w.devicePixelRatio || 1;
  const width = s.width || 0;
  const height = s.height || 0;

  const orient = s.orientation?.type as string | undefined;
  let orientation: ScreenInfo['orientation'] = 'unknown';
  if (orient) orientation = orient.startsWith('portrait') ? 'portrait' : 'landscape';
  else if (width && height) orientation = height >= width ? 'portrait' : 'landscape';

  // Desktop zoom: outerWidth is zoom-independent device-independent px, innerWidth shrinks when zooming in.
  let zoom: ScreenInfo['zoom'] = { value: null, method: 'unavailable' };
  if (hasW && w.outerWidth > 0 && w.innerWidth > 0 && deviceType === 'desktop') {
    zoom = { value: round(w.outerWidth / w.innerWidth, 2), method: 'outerWidth / innerWidth (approximate, includes browser chrome)' };
  }

  let colorGamut: ScreenInfo['colorGamut'] = null;
  if (mq('(color-gamut: rec2020)')) colorGamut = 'rec2020';
  else if (mq('(color-gamut: p3)')) colorGamut = 'p3';
  else if (mq('(color-gamut: srgb)')) colorGamut = 'srgb';

  return {
    width,
    height,
    availWidth: s.availWidth || 0,
    availHeight: s.availHeight || 0,
    physicalWidth: Math.round(width * dpr),
    physicalHeight: Math.round(height * dpr),
    devicePixelRatio: round(dpr, 3),
    colorDepth: s.colorDepth || 0,
    pixelDepth: s.pixelDepth || 0,
    orientation,
    orientationAngle: typeof s.orientation?.angle === 'number' ? s.orientation.angle : null,
    viewport: {
      innerWidth: w.innerWidth || 0,
      innerHeight: w.innerHeight || 0,
      outerWidth: w.outerWidth || 0,
      outerHeight: w.outerHeight || 0,
      visualScale: w.visualViewport?.scale ?? null,
    },
    zoom,
    isExtended: typeof s.isExtended === 'boolean' ? s.isExtended : null,
    colorGamut,
    hdr: mq('(dynamic-range: high)'),
    sizeClass: sizeClassOf(Math.min(width, height) ? Math.max(width, height) : 0),
    estimatedDiagonalInches: estimateDiagonal(width, height, dpr, deviceType),
  };
}
