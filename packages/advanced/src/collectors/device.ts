/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, round } from '@fingerprint/core';
import type { Collector } from './types';

export const sensors: Collector = {
  id: 'sensors',
  stable: true,
  bits: 4,
  run() {
    const w = window as any;
    const n = nav();
    const has = (k: string) => k in w;
    const touchEvent = (() => {
      try {
        document.createEvent('TouchEvent');
        return true;
      } catch {
        return false;
      }
    })();
    return {
      deviceMotion: has('DeviceMotionEvent'),
      deviceOrientation: has('DeviceOrientationEvent'),
      // iOS 13+ gates motion events behind an explicit permission call
      motionNeedsPermission: typeof w.DeviceMotionEvent?.requestPermission === 'function',
      genericSensors: ['Accelerometer', 'Gyroscope', 'Magnetometer', 'AbsoluteOrientationSensor', 'RelativeOrientationSensor', 'LinearAccelerationSensor', 'GravitySensor', 'AmbientLightSensor'].filter(has),
      touch: { maxTouchPoints: n.maxTouchPoints ?? 0, touchEvent, ontouchstart: 'ontouchstart' in w, pointerEvents: has('PointerEvent') },
      peripherals: {
        vibrate: typeof n.vibrate === 'function',
        bluetooth: !!n.bluetooth,
        usb: !!n.usb,
        hid: !!n.hid,
        serial: !!n.serial,
        nfc: has('NDEFReader'),
        xr: !!n.xr,
        gpu: !!n.gpu,
        wakeLock: !!n.wakeLock,
        share: typeof n.share === 'function',
        contacts: !!n.contacts,
        geolocation: !!n.geolocation,
        gamepads: typeof n.getGamepads === 'function' ? Array.from(n.getGamepads()).filter(Boolean).length : null,
      },
    };
  },
};

export const battery: Collector = {
  id: 'battery',
  stable: false,
  bits: 1,
  timeoutMs: 1500,
  async run() {
    const n = nav();
    if (typeof n.getBattery !== 'function') return { supported: false };
    const b = await n.getBattery();
    return {
      supported: true,
      charging: b.charging,
      level: round(b.level, 2),
      chargingTime: Number.isFinite(b.chargingTime) ? b.chargingTime : null,
      dischargingTime: Number.isFinite(b.dischargingTime) ? b.dischargingTime : null,
    };
  },
};

const PERMISSIONS = [
  'geolocation', 'notifications', 'push', 'midi', 'camera', 'microphone', 'speaker-selection', 'background-sync',
  'bluetooth', 'persistent-storage', 'ambient-light-sensor', 'accelerometer', 'gyroscope', 'magnetometer',
  'clipboard-read', 'clipboard-write', 'display-capture', 'nfc', 'screen-wake-lock', 'storage-access',
  'window-management', 'local-fonts', 'idle-detection', 'payment-handler', 'top-level-storage-access',
];

/** Queries only. Never requests a permission, so no prompt is shown. */
export const permissions: Collector = {
  id: 'permissions',
  stable: false,
  bits: 2,
  timeoutMs: 2500,
  async run() {
    const p = nav().permissions;
    if (!p?.query) return { supported: false };
    const entries = await Promise.all(
      PERMISSIONS.map(async (name) => {
        try {
          return [name, (await p.query({ name })).state] as const;
        } catch {
          return [name, 'unsupported'] as const;
        }
      }),
    );
    return { supported: true, states: Object.fromEntries(entries) };
  },
};

export const storage: Collector = {
  id: 'storage',
  stable: false,
  bits: 2,
  timeoutMs: 2500,
  async run() {
    const w = window as any;
    const n = nav();
    const attempt = <T>(f: () => T): T | null => {
      try {
        return f();
      } catch {
        return null;
      }
    };
    const est = n.storage?.estimate ? await n.storage.estimate() : null;
    const persisted = n.storage?.persisted ? await n.storage.persisted() : null;

    const idb = await new Promise<boolean>((resolve) => {
      try {
        const req = indexedDB.open('__fp_probe__');
        req.onsuccess = () => {
          req.result.close();
          indexedDB.deleteDatabase('__fp_probe__');
          resolve(true);
        };
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
      } catch {
        resolve(false);
      }
    });

    const quota = est?.quota ?? null;
    return {
      quota,
      usage: est?.usage ?? null,
      persisted,
      localStorage: attempt(() => !!w.localStorage),
      sessionStorage: attempt(() => !!w.sessionStorage),
      indexedDB: idb,
      cacheStorage: 'caches' in w,
      serviceWorker: 'serviceWorker' in n,
      cookies: n.cookieEnabled ?? null,
      // Private-window detection lives in the dedicated privateMode collector.
    };
  },
};
