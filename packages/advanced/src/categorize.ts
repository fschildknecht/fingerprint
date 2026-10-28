/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LightResult } from '@fingerprint/light';
import { gpuClass } from './collectors/hardware';
import type { GpuClass } from './collectors/hardware';

export interface HardwareProfile {
  cpu: { cores: number | null; architecture: string | null; bitness: string | null };
  memory: { deviceMemoryGb: number | null; jsHeapLimitBytes: number | null };
  gpu: {
    vendor: string | null;
    renderer: string | null;
    class: GpuClass;
    webgl2: boolean | null;
    webgpu: { vendor: string | null; architecture: string | null; description: string | null; isFallback: boolean | null } | null;
  };
  display: {
    cssSize: string;
    physicalSize: string;
    pixelRatio: number;
    colorDepth: number;
    colorGamut: string | null;
    hdr: boolean | null;
    refreshRateHz: number | null;
    multiMonitor: boolean | null;
    estimatedDiagonalInches: number | null;
  };
  input: { touchPoints: number; primaryPointer: string; hover: boolean | null; gamepads: number | null; vibration: boolean | null };
  audio: { outputs: number | null; inputs: number | null; sampleRate: number | null; maxChannels: number | null; ttsVoices: number | null };
  camera: { count: number | null };
  sensors: string[];
  connectivity: { bluetooth: boolean; usb: boolean; hid: boolean; serial: boolean; nfc: boolean; effectiveType: string | null; downlinkMbps: number | null };
  xr: boolean | null;
}

type V = Record<string, any>;

/** Regroup raw collector output by hardware category, so consumers don't need to know collector ids. */
export function buildHardware(light: LightResult, c: V): HardwareProfile {
  const gl = c.webgl ?? {};
  const gpu = c.hardware?.webgpu;
  const s = light.screen;
  const sensors: V = c.sensors ?? {};
  const periph: V = sensors.peripherals ?? {};
  const devices: V = c.mediaDevices ?? {};
  const conn: V = c.connection ?? {};
  const renderer: string | null = gl.unmaskedRenderer ?? null;

  return {
    cpu: {
      cores: light.device.cpuCores,
      architecture: light.device.architecture,
      bitness: light.device.bitness,
    },
    memory: { deviceMemoryGb: light.device.memoryGb, jsHeapLimitBytes: c.navigator?.jsHeapSizeLimit ?? null },
    gpu: {
      vendor: gl.unmaskedVendor ?? null,
      renderer,
      class: gpuClass(renderer),
      webgl2: gl.supported === false ? null : !!gl.webgl2,
      webgpu: gpu?.supported && gpu.adapter !== null
        ? { vendor: gpu.vendor, architecture: gpu.architecture, description: gpu.description, isFallback: gpu.isFallbackAdapter }
        : null,
    },
    display: {
      cssSize: `${s.width}x${s.height}`,
      physicalSize: `${s.physicalWidth}x${s.physicalHeight}`,
      pixelRatio: s.devicePixelRatio,
      colorDepth: s.colorDepth,
      colorGamut: s.colorGamut,
      hdr: s.hdr,
      refreshRateHz: c.refreshRate?.hz ?? null,
      multiMonitor: s.isExtended,
      estimatedDiagonalInches: s.estimatedDiagonalInches.value,
    },
    input: {
      touchPoints: light.device.touch.maxTouchPoints,
      primaryPointer: light.device.touch.coarsePointer ? 'touch' : 'mouse',
      hover: light.device.touch.hover,
      gamepads: periph.gamepads ?? null,
      vibration: periph.vibrate ?? null,
    },
    audio: {
      outputs: devices.audiooutput ?? null,
      inputs: devices.audioinput ?? null,
      sampleRate: c.audioContext?.sampleRate ?? null,
      maxChannels: c.audioContext?.maxChannelCount ?? null,
      ttsVoices: c.speechVoices?.count ?? null,
    },
    camera: { count: devices.videoinput ?? null },
    sensors: sensors.genericSensors ?? [],
    connectivity: {
      bluetooth: !!periph.bluetooth,
      usb: !!periph.usb,
      hid: !!periph.hid,
      serial: !!periph.serial,
      nfc: !!periph.nfc,
      effectiveType: conn.effectiveType ?? null,
      downlinkMbps: conn.downlink ?? null,
    },
    xr: periph.xr ?? null,
  };
}
