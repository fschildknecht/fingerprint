/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav, withTimeout } from '@fingerprint/core';
import type { Collector } from './types';

interface VideoProbe {
  id: string;
  contentType: string;
  hdr?: 'pq' | 'hlg';
}

const VIDEO: VideoProbe[] = [
  { id: 'h264', contentType: 'video/mp4; codecs="avc1.640028"' },
  { id: 'h264-4k', contentType: 'video/mp4; codecs="avc1.640033"' },
  { id: 'hevc', contentType: 'video/mp4; codecs="hev1.1.6.L93.B0"' },
  { id: 'vp9', contentType: 'video/webm; codecs="vp09.00.10.08"' },
  { id: 'vp9-hdr', contentType: 'video/webm; codecs="vp09.02.10.10"', hdr: 'pq' },
  { id: 'av1', contentType: 'video/mp4; codecs="av01.0.08M.08"' },
  { id: 'av1-hdr', contentType: 'video/mp4; codecs="av01.0.09M.10"', hdr: 'pq' },
  { id: 'hevc-hlg', contentType: 'video/mp4; codecs="hev1.2.4.L120.B0"', hdr: 'hlg' },
];

/** `h` = hardware decoder (power efficient), `s` = smooth, `-` = unsupported. */
async function decoding(p: VideoProbe): Promise<string | null> {
  const mc = nav().mediaCapabilities;
  if (!mc?.decodingInfo) return null;
  const big = /4k|hdr|hlg/.test(p.id);
  try {
    const r = await withTimeout<any>(
      mc.decodingInfo({
        type: 'file',
        video: {
          contentType: p.contentType,
          width: big ? 3840 : 1920,
          height: big ? 2160 : 1080,
          bitrate: big ? 20_000_000 : 6_000_000,
          framerate: 30,
          ...(p.hdr ? { transferFunction: p.hdr, colorGamut: 'rec2020', hdrMetadataType: 'smpteSt2086' } : {}),
        },
      }),
      1500,
    );
    if (!r.supported) return '-';
    return (r.powerEfficient ? 'h' : '') + (r.smooth ? 's' : '') || 'y';
  } catch {
    return null;
  }
}

async function webCodecs(): Promise<Record<string, unknown> | null> {
  const w = window as any;
  if (!w.VideoDecoder && !w.VideoEncoder) return null;
  const check = async (Ctor: any, config: any): Promise<boolean | null> => {
    if (!Ctor?.isConfigSupported) return null;
    try {
      return !!(await withTimeout<any>(Ctor.isConfigSupported(config), 1500)).supported;
    } catch {
      return null;
    }
  };
  const dec = (codec: string, pref: string) => check(w.VideoDecoder, { codec, codedWidth: 1920, codedHeight: 1080, hardwareAcceleration: pref });
  const enc = (codec: string, pref: string) => check(w.VideoEncoder, { codec, width: 1280, height: 720, bitrate: 2_000_000, framerate: 30, hardwareAcceleration: pref });
  const [h264Hw, h264Sw, hevcHw, av1Hw, vp9Hw, encH264Hw, encAv1Hw] = await Promise.all([
    dec('avc1.640028', 'prefer-hardware'),
    dec('avc1.640028', 'prefer-software'),
    dec('hev1.1.6.L93.B0', 'prefer-hardware'),
    dec('av01.0.08M.08', 'prefer-hardware'),
    dec('vp09.00.10.08', 'prefer-hardware'),
    enc('avc1.640028', 'prefer-hardware'),
    enc('av01.0.04M.08', 'prefer-hardware'),
  ]);
  return { decode: { h264Hw, h264Sw, hevcHw, av1Hw, vp9Hw }, encode: { h264Hw: encH264Hw, av1Hw: encAv1Hw } };
}

/**
 * Which codecs the machine can decode in hardware, and whether HDR playback is possible. That
 * mirrors the GPU generation (AV1 hardware decode = RTX 30+/Arc/M3+) and is independent of the
 * WebGL renderer string, so it also catches a spoofed GPU.
 */
export const mediaCapabilities: Collector = {
  id: 'mediaCapabilities',
  stable: true,
  bits: 5,
  timeoutMs: 5000,
  async run() {
    if (!nav().mediaCapabilities?.decodingInfo) return { supported: false };
    const [results, codecs] = await Promise.all([Promise.all(VIDEO.map(decoding)), webCodecs()]);
    const decode = Object.fromEntries(VIDEO.map((p, i) => [p.id, results[i]]));
    const hw = (id: string) => (decode[id] ?? '').includes('h');
    return {
      supported: true,
      decode,
      webCodecs: codecs,
      hardwareDecode: VIDEO.filter((p) => !p.hdr && hw(p.id)).map((p) => p.id),
      hdrPlayback: VIDEO.filter((p) => p.hdr && decode[p.id] && decode[p.id] !== '-').map((p) => p.id),
    };
  },
};
