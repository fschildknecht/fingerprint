/* eslint-disable @typescript-eslint/no-explicit-any */
import { sha256 } from '@fingerprint/core';
import type { Collector } from './types';

export const audio: Collector = {
  id: 'audio',
  stable: true,
  bits: 5,
  timeoutMs: 3000,
  async run() {
    const Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!Ctx) return { supported: false };

    const ctx = new Ctx(1, 5000, 44100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;

    const comp = ctx.createDynamicsCompressor();
    const set = (p: string, v: number) => {
      if (comp[p]?.setValueAtTime) comp[p].setValueAtTime(v, ctx.currentTime);
    };
    set('threshold', -50);
    set('knee', 40);
    set('ratio', 12);
    set('attack', 0);
    set('release', 0.25);

    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);

    const buffer: AudioBuffer = await ctx.startRendering();
    const data = buffer.getChannelData(0).subarray(4500);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);

    return {
      supported: true,
      sum,
      hash: await sha256(Array.from(data).join(',')),
      sampleRate: ctx.sampleRate,
      compressorReduction: typeof comp.reduction === 'number' ? comp.reduction : comp.reduction?.value ?? null,
    };
  },
};

export const audioContext: Collector = {
  id: 'audioContext',
  stable: true,
  bits: 2,
  async run() {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return { supported: false };
    const ctx = new Ctx();
    try {
      return {
        supported: true,
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency ?? null,
        outputLatency: ctx.outputLatency ?? null,
        maxChannelCount: ctx.destination.maxChannelCount,
        state: ctx.state,
      };
    } finally {
      ctx.close?.();
    }
  },
};
