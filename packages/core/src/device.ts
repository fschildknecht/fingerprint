import type { ClientHints, DeviceClassification, DeviceType, ParsedUserAgent } from './types';
import { clamp, round } from './utils';

export interface DeviceContext {
  ua: ParsedUserAgent;
  hints: ClientHints | null;
  maxTouchPoints: number;
  /** CSS pixels, orientation independent */
  shortSide: number;
  longSide: number;
  platform: string;
  coarsePointer: boolean | null;
  hover: boolean | null;
}

const MOBILE_OS = new Set(['iOS', 'Android', 'HarmonyOS', 'Windows Phone']);

/**
 * Combine the User-Agent string with independent evidence (client hints, pointer type,
 * touch points, screen size, navigator.platform) into one device type and a confidence.
 *
 * The UA string is the weakest of these signals because it is trivially spoofable, so every
 * independent source that agrees with it raises the confidence and every one that
 * disagrees lowers it and is reported as an inconsistency.
 */
export function classifyDevice(ctx: DeviceContext): DeviceClassification {
  const { ua, hints, maxTouchPoints, shortSide, longSide, platform, coarsePointer, hover } = ctx;
  const reasons: string[] = [];
  const inconsistencies: string[] = [];

  let type: DeviceType = ua.device.type ?? 'unknown';
  let confidence = type === 'unknown' ? 0.2 : 0.55;
  if (type !== 'unknown') reasons.push(`User-Agent indicates ${type}`);

  // iPadOS 13+ pretends to be a Mac. Real Macs have no touch screen.
  if (ua.os.name === 'macOS' && maxTouchPoints > 1 && /^Mac/i.test(platform)) {
    type = 'tablet';
    confidence = 0.8;
    reasons.push('Reports macOS but has multi-touch: iPadOS in desktop mode');
  }

  const wantsMobile = type === 'mobile' || type === 'tablet';

  if (hints?.mobile != null) {
    const agrees = hints.mobile === (type === 'mobile');
    if (type === 'mobile' || type === 'desktop') {
      if (agrees) {
        confidence += 0.12;
        reasons.push('Client hint "mobile" agrees');
      } else {
        confidence -= 0.2;
        inconsistencies.push(`Client hint mobile=${hints.mobile} contradicts UA type ${type}`);
      }
    }
  }

  if (coarsePointer !== null && hover !== null) {
    const touchPrimary = coarsePointer && !hover;
    if (wantsMobile && touchPrimary) {
      confidence += 0.1;
      reasons.push('Primary pointer is coarse and cannot hover');
    } else if (type === 'desktop' && !coarsePointer && hover) {
      confidence += 0.1;
      reasons.push('Primary pointer is fine and can hover');
    } else if (type === 'desktop' && touchPrimary) {
      // "Request desktop site" on a phone: desktop UA, but the hardware is touch-first.
      inconsistencies.push('Desktop UA but touch-first pointer: likely "desktop site" mode on a mobile device');
      if (shortSide > 0 && shortSide < 700) {
        type = shortSide < 500 ? 'mobile' : 'tablet';
        confidence = 0.62;
        reasons.push(`Overrode UA based on pointer type and ${shortSide}px short side`);
      } else {
        confidence -= 0.15;
      }
    } else if (wantsMobile && !coarsePointer && hover) {
      confidence -= 0.15;
      inconsistencies.push('Mobile UA but mouse-like pointer: emulator, devtools or spoofed UA');
    }
  }

  if (shortSide > 0) {
    if (type === 'mobile') {
      if (shortSide <= 540) {
        confidence += 0.08;
        reasons.push('Screen size fits a phone');
      } else {
        confidence -= 0.1;
        inconsistencies.push(`Mobile UA but ${shortSide}px short side`);
      }
    } else if (type === 'tablet') {
      if (shortSide >= 480 && shortSide <= 1100) confidence += 0.06;
      else if (shortSide < 400) {
        confidence -= 0.1;
        inconsistencies.push('Tablet UA but a phone-sized screen');
      }
    } else if (type === 'desktop') {
      if (longSide >= 1024) confidence += 0.05;
      else if (longSide < 700) {
        confidence -= 0.1;
        inconsistencies.push(`Desktop UA but only ${longSide}px wide screen`);
      }
    }
  }

  if (platform) {
    const p = platform.toLowerCase();
    const platformMobile = /iphone|ipad|ipod|android|arm|linux armv|linux aarch64/.test(p);
    const platformDesktop = /^win|^mac|linux x86|^linux$|cros|x11/.test(p);
    const uaMobileOS = MOBILE_OS.has(ua.os.name);
    if (uaMobileOS && platformDesktop && !/^linux$/.test(p) && !/linux x86/.test(p)) {
      confidence -= 0.2;
      inconsistencies.push(`UA says ${ua.os.name} but navigator.platform is "${platform}"`);
    } else if (!uaMobileOS && ua.os.name !== 'Unknown' && platformMobile && /iphone|ipad|ipod/.test(p)) {
      confidence -= 0.2;
      inconsistencies.push(`UA says ${ua.os.name} but navigator.platform is "${platform}"`);
    } else if (ua.os.name !== 'Unknown') {
      confidence += 0.05;
    }
  }

  if (hints?.platform && ua.os.name !== 'Unknown') {
    const hp = hints.platform.toLowerCase();
    const uo = ua.os.name.toLowerCase();
    const same = hp === uo || (hp === 'macos' && uo === 'macos') || (hp === 'chrome os' && uo === 'chromeos') || uo.startsWith(hp);
    if (!same) {
      confidence -= 0.2;
      inconsistencies.push(`Client hint platform "${hints.platform}" contradicts UA OS "${ua.os.name}"`);
    }
  }

  if (ua.isBotUA) {
    type = 'bot';
    confidence = Math.max(confidence, 0.85);
    reasons.push('UA matches a known bot/automation pattern');
  }

  return { type, confidence: round(clamp(confidence, 0.05, 0.99)), reasons, inconsistencies };
}
