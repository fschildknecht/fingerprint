/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, withTimeout } from '@fingerprint/core';
import type { Collector } from './types';

/** Keys whose character differs between layouts, so a handful identifies QWERTY/QWERTZ/AZERTY/Dvorak/... */
const KEYS = ['KeyQ', 'KeyW', 'KeyY', 'KeyZ', 'KeyA', 'KeyM', 'Semicolon', 'Comma', 'Period', 'Slash', 'Minus', 'Equal', 'BracketLeft', 'Backquote', 'IntlBackslash', 'IntlYen'];

/**
 * Physical keyboard layout (Chromium, secure context). Tells layout and often the user's country
 * regardless of the language setting, e.g. a Swiss-German layout behind an English browser.
 */
export const keyboard: Collector = {
  id: 'keyboard',
  stable: true,
  bits: 3,
  timeoutMs: 1500,
  async run() {
    const kb = nav().keyboard;
    if (!kb?.getLayoutMap) return { supported: false };
    const map: Map<string, string> = await kb.getLayoutMap();
    const layout = KEYS.map((k) => `${k}=${map.get(k) ?? ''}`).join(',');
    const q = map.get('KeyQ'), w = map.get('KeyW'), y = map.get('KeyY'), z = map.get('KeyZ'), a = map.get('KeyA');
    let family: string | null = null;
    if (q === 'q' && w === 'w') family = y === 'z' && z === 'y' ? 'QWERTZ' : 'QWERTY';
    else if (q === 'a' && w === 'z') family = 'AZERTY';
    else if (q === "'" || a === 'a' && map.get('Semicolon') === 's') family = 'Dvorak-like';
    return { supported: true, size: map.size, family, layout };
  },
};

/**
 * Hardware that exists on this device, asked without any permission prompt. Adapters being
 * present or absent separates laptops, desktops, VMs and phones, and anti-detect profiles rarely
 * emulate these.
 */
export const availability: Collector = {
  id: 'availability',
  stable: true,
  bits: 3,
  timeoutMs: 2500,
  async run() {
    const n = nav();
    const ask = async <T>(f: () => Promise<T> | undefined): Promise<T | null> => {
      try {
        const p = f();
        return p ? await withTimeout<T>(p, 1500) : null;
      } catch {
        return null;
      }
    };
    const [bluetooth, vr, ar] = await Promise.all([
      ask<boolean>(() => n.bluetooth?.getAvailability?.()),
      ask<boolean>(() => n.xr?.isSessionSupported?.('immersive-vr')),
      ask<boolean>(() => n.xr?.isSessionSupported?.('immersive-ar')),
    ]);
    return {
      bluetoothAdapter: bluetooth,
      xr: { vr, ar },
      multiScreen: (window.screen as any).isExtended ?? null,
      pointer: { fine: matchMedia('(any-pointer: fine)').matches, coarse: matchMedia('(any-pointer: coarse)').matches },
    };
  },
};
