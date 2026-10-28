/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Collector } from './types';

const VIDEO = [
  'video/mp4; codecs="avc1.42E01E"',
  'video/mp4; codecs="avc1.640028"',
  'video/mp4; codecs="hev1.1.6.L93.B0"',
  'video/mp4; codecs="av01.0.05M.08"',
  'video/webm; codecs="vp8"',
  'video/webm; codecs="vp9"',
  'video/webm; codecs="av01.0.05M.08"',
  'video/ogg; codecs="theora"',
  'video/x-matroska; codecs="avc1.42E01E"',
  'application/vnd.apple.mpegurl',
  'application/x-mpegURL',
];
const AUDIO = [
  'audio/mpeg',
  'audio/mp4; codecs="mp4a.40.2"',
  'audio/mp4; codecs="ac-3"',
  'audio/mp4; codecs="ec-3"',
  'audio/ogg; codecs="vorbis"',
  'audio/ogg; codecs="opus"',
  'audio/webm; codecs="opus"',
  'audio/flac',
  'audio/wav; codecs="1"',
  'audio/aac',
  'audio/x-m4a',
];

export const codecs: Collector = {
  id: 'codecs',
  stable: true,
  bits: 5,
  run() {
    const v = document.createElement('video');
    const a = document.createElement('audio');
    const MS = (window as any).MediaSource || (window as any).ManagedMediaSource;
    const MR = (window as any).MediaRecorder;
    return {
      canPlayType: {
        ...Object.fromEntries(VIDEO.map((t) => [t, v.canPlayType(t)])),
        ...Object.fromEntries(AUDIO.map((t) => [t, a.canPlayType(t)])),
      },
      mediaSource: MS ? [...VIDEO, ...AUDIO].filter((t) => MS.isTypeSupported?.(t)) : null,
      // Skip HEVC: the first MediaRecorder HEVC query boots an encoder and blocks the main thread for ~1.4 s.
      mediaRecorder: MR ? [...VIDEO, ...AUDIO].filter((t) => !/hev1|hvc1/.test(t) && MR.isTypeSupported?.(t)) : null,
    };
  },
};

/** Counts of attached devices; labels only appear if the user already granted camera/microphone. */
export const mediaDevices: Collector = {
  id: 'mediaDevices',
  stable: false,
  bits: 3,
  async run() {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return { supported: false };
    const list = await md.enumerateDevices();
    const count = (k: string) => list.filter((d) => d.kind === k).length;
    return {
      supported: true,
      audioinput: count('audioinput'),
      audiooutput: count('audiooutput'),
      videoinput: count('videoinput'),
      labelsVisible: list.some((d) => !!d.label),
      labels: list.filter((d) => d.label).map((d) => ({ kind: d.kind, label: d.label })),
    };
  },
};

export const speechVoices: Collector = {
  id: 'speechVoices',
  stable: true,
  bits: 5,
  timeoutMs: 2500,
  async run() {
    const s = (window as any).speechSynthesis;
    if (!s) return { supported: false };
    // Voices arrive in batches (Chrome adds its network voices a moment after the local ones), so
    // wait until the list has stopped changing before reading it.
    const settled = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const done = () => {
        s.removeEventListener?.('voiceschanged', onChange);
        resolve(s.getVoices());
      };
      const onChange = () => {
        clearTimeout(timer);
        timer = setTimeout(done, 250);
      };
      s.addEventListener?.('voiceschanged', onChange);
      timer = setTimeout(done, s.getVoices().length ? 250 : 1000);
    });
    // Only on-device voices go into the signal; network voices depend on connectivity and account.
    const local = settled.filter((v) => v.localService !== false);
    return {
      supported: true,
      count: local.length,
      voices: local
        .slice(0, 150)
        .map((v) => ({ name: v.name, lang: v.lang, default: v.default }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang)),
    };
  },
};
