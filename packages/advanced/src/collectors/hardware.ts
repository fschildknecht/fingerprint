/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, round } from '@fingerprint/core';
import type { Collector } from './types';

export type GpuClass = 'software' | 'integrated' | 'discrete' | 'mobile' | 'unknown';

/** Classify a GPU from its (unmasked) WebGL renderer string. Heuristic, vendors rename things. */
export function gpuClass(renderer: string | null | undefined): GpuClass {
  const r = (renderer ?? '').toLowerCase();
  if (!r) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|mesa offscreen|microsoft basic render|software/.test(r)) return 'software';
  if (/adreno|mali|powervr|videocore|immortalis|xclipse/.test(r)) return 'mobile';
  if (/apple (m\d|gpu)/.test(r)) return /apple gpu/.test(r) ? 'mobile' : 'integrated';
  if (/geforce|rtx|gtx|quadro|tesla|nvidia|radeon rx|radeon pro|arc a\d|arc\(tm\) a\d/.test(r)) return 'discrete';
  if (/intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega|amd radeon\(tm\)/.test(r)) return 'integrated';
  return 'unknown';
}

const COMMON_HZ = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 240, 360];

/** Median frame interval over ~30 rAF callbacks, snapped to the nearest common refresh rate. */
function measureRefreshRate(): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function' || document.visibilityState === 'hidden') return resolve(null);
    const deltas: number[] = [];
    let last = 0;
    const timer = setTimeout(() => resolve(null), 1200);
    const tick = (t: number) => {
      if (last) deltas.push(t - last);
      last = t;
      if (deltas.length < 30) return requestAnimationFrame(tick);
      clearTimeout(timer);
      const sorted = deltas.slice(5).sort((a, b) => a - b); // drop warm-up frames
      const hz = 1000 / sorted[Math.floor(sorted.length / 2)];
      resolve(COMMON_HZ.reduce((best, c) => (Math.abs(c - hz) < Math.abs(best - hz) ? c : best)));
    };
    requestAnimationFrame(tick);
  });
}

async function webgpuInfo(): Promise<unknown> {
  const gpu = nav().gpu;
  if (!gpu?.requestAdapter) return null;
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { supported: true, adapter: null };
  const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
  const L = adapter.limits ?? {};
  return {
    supported: true,
    vendor: info.vendor || null,
    architecture: info.architecture || null,
    device: info.device || null,
    description: info.description || null,
    isFallbackAdapter: adapter.isFallbackAdapter ?? null,
    features: [...(adapter.features ?? [])].sort(),
    limits: {
      maxTextureDimension2D: L.maxTextureDimension2D,
      maxBufferSize: L.maxBufferSize,
      maxStorageBufferBindingSize: L.maxStorageBufferBindingSize,
      maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize,
      maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup,
    },
  };
}

export const hardware: Collector = {
  id: 'hardware',
  stable: true,
  bits: 5,
  timeoutMs: 3000,
  async run() {
    const [webgpu, refreshRateHz] = await Promise.all([webgpuInfo().catch(() => null), measureRefreshRate()]);
    return { webgpu, refreshRateHz: refreshRateHz === null ? null : round(refreshRateHz, 0) };
  },
};
