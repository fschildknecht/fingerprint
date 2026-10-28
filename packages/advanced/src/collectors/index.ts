import type { Collector } from './types';
import { canvas } from './canvas';
import { webgl } from './webgl';
import { audio, audioContext } from './audio';
import { fonts, localFonts } from './fonts';
import { navigatorInfo, timezone, intl, math, css, features, engine } from './system';
import { connection, webrtc } from './network';
import { codecs, mediaDevices, speechVoices } from './media';
import { drm } from './drm';
import { adBlocker } from './adblock';
import { sensors, battery, permissions, storage } from './device';
import { hardware } from './hardware';
import { plugins, browserSpecs, extensions } from './specs';

export const COLLECTORS: Collector[] = [
  navigatorInfo,
  plugins,
  browserSpecs,
  hardware,
  timezone,
  intl,
  math,
  css,
  features,
  engine,
  canvas,
  webgl,
  audio,
  audioContext,
  fonts,
  localFonts,
  codecs,
  speechVoices,
  drm,
  sensors,
  connection,
  webrtc,
  mediaDevices,
  battery,
  permissions,
  storage,
  extensions,
  adBlocker,
];

export type { Collector };
