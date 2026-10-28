export type DeviceType =
  | 'desktop'
  | 'mobile'
  | 'tablet'
  | 'tv'
  | 'console'
  | 'wearable'
  | 'bot'
  | 'unknown';

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very-high';

export interface ConfidenceFactor {
  id: string;
  weight: number;
  present: boolean;
  note?: string;
}

export interface ConfidencePenalty {
  id: string;
  amount: number;
  note: string;
}

export interface ConfidenceResult {
  /** 0..1 */
  score: number;
  level: ConfidenceLevel;
  factors: ConfidenceFactor[];
  penalties: ConfidencePenalty[];
}

export interface ParsedUserAgent {
  browser: { name: string; version: string | null; major: number | null };
  engine: { name: string; version: string | null };
  os: { name: string; version: string | null };
  device: { type: DeviceType | null; vendor: string | null; model: string | null };
  isBotUA: boolean;
  isWebView: boolean;
  raw: string;
}

export interface ClientHints {
  brands: { brand: string; version: string }[];
  mobile: boolean | null;
  platform: string | null;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  model?: string;
  uaFullVersion?: string;
  fullVersionList?: { brand: string; version: string }[];
  wow64?: boolean;
  formFactors?: string[];
}

export interface DeviceClassification {
  type: DeviceType;
  /** 0..1 */
  confidence: number;
  reasons: string[];
  inconsistencies: string[];
}

export interface ScreenInfo {
  /** CSS pixels, as reported by screen.width/height */
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  /** Device pixels: CSS pixels multiplied by devicePixelRatio */
  physicalWidth: number;
  physicalHeight: number;
  devicePixelRatio: number;
  colorDepth: number;
  pixelDepth: number;
  orientation: 'portrait' | 'landscape' | 'unknown';
  orientationAngle: number | null;
  viewport: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    visualScale: number | null;
  };
  /** Browser zoom as a factor (1 = 100%). Only meaningful on desktop. */
  zoom: { value: number | null; method: string };
  isExtended: boolean | null;
  colorGamut: 'srgb' | 'p3' | 'rec2020' | null;
  hdr: boolean | null;
  sizeClass: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  estimatedDiagonalInches: { value: number | null; confidence: number; method: string };
}
