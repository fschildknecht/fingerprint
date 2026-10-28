/* eslint-disable @typescript-eslint/no-explicit-any */
import { nav } from '@fingerprint/core';
import type { Collector } from './types';

export const connection: Collector = {
  id: 'connection',
  stable: false,
  bits: 1,
  run() {
    const n = nav();
    const c = n.connection || n.mozConnection || n.webkitConnection;
    return {
      supported: !!c,
      effectiveType: c?.effectiveType ?? null,
      type: c?.type ?? null,
      downlink: c?.downlink ?? null,
      downlinkMax: c?.downlinkMax ?? null,
      rtt: c?.rtt ?? null,
      saveData: c?.saveData ?? null,
      onLine: n.onLine ?? null,
      secureContext: (window as any).isSecureContext ?? null,
      crossOriginIsolated: (window as any).crossOriginIsolated ?? null,
      protocol: location.protocol,
      referrerPolicyDefault: document.referrer ? 'has-referrer' : 'no-referrer',
    };
  },
};

interface Candidate {
  type: string;
  protocol: string;
  address: string;
  kind: 'local' | 'mdns' | 'public' | 'ipv6' | 'unknown';
}

function classify(address: string): Candidate['kind'] {
  if (address.endsWith('.local')) return 'mdns';
  if (address.includes(':')) return 'ipv6';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(address)) return 'local';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) return 'public';
  return 'unknown';
}

/**
 * Gather ICE candidates against a public STUN server. Reveals the public (server-reflexive) IP
 * even behind some proxies, and local IPs unless the browser hides them behind mDNS names.
 * This contacts stun.l.google.com, which is why it can be switched off via options.exclude.
 */
export const webrtc: Collector = {
  id: 'webrtc',
  stable: false,
  slow: true,
  bits: 3,
  timeoutMs: 4000,
  async run() {
    const RTC = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection;
    if (!RTC) return { supported: false };

    const pc = new RTC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const candidates: Candidate[] = [];
    const done = new Promise<void>((resolve) => {
      const finish = () => resolve();
      pc.onicecandidate = (e: any) => {
        if (!e.candidate) return finish();
        const parts = String(e.candidate.candidate).split(' ');
        const address = parts[4];
        if (address) {
          candidates.push({ type: parts[7] ?? 'unknown', protocol: parts[2] ?? '', address, kind: classify(address) });
        }
      };
      pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && finish();
      setTimeout(finish, 3000);
    });

    try {
      pc.createDataChannel('fp');
      await pc.setLocalDescription(await pc.createOffer());
      await done;
    } finally {
      pc.close();
    }

    const uniq = (kind: Candidate['kind']) => [...new Set(candidates.filter((c) => c.kind === kind).map((c) => c.address))];
    const caps = (kind: string) => {
      try {
        const c = (window as any).RTCRtpSender?.getCapabilities?.(kind);
        return c ? c.codecs.map((x: any) => x.mimeType).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) : null;
      } catch {
        return null;
      }
    };
    return {
      supported: true,
      publicIps: uniq('public'),
      localIps: uniq('local'),
      mdnsHosts: uniq('mdns').length,
      ipv6: uniq('ipv6'),
      candidateTypes: [...new Set(candidates.map((c) => c.type))],
      videoCodecs: caps('video'),
      audioCodecs: caps('audio'),
    };
  },
};
