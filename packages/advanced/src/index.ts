/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfidenceBuilder, VERSION, hashOf, now, round, safe } from '@fingerprint/core';
import type { ConfidenceResult } from '@fingerprint/core';
import { getLight } from '@fingerprint/light';
import type { LightOptions, LightResult } from '@fingerprint/light';
import { analyze } from './analysis';
import type { Analysis } from './analysis';
import { COLLECTORS } from './collectors';
import { buildHardware } from './categorize';
import type { HardwareProfile } from './categorize';

export type { PrivateModeResult, TorAnalysis, TorSignal } from './analysis';
export type { Analysis, BotAnalysis, BotSignal, ManipulationAnalysis, ManipulationSignal, ManipulationCategory } from './analysis';
export type { LightResult } from '@fingerprint/light';
export { COLLECTORS };
export type { HardwareProfile };
export { gpuClass } from './collectors/hardware';
export { VERSION };

export interface AdvancedOptions extends LightOptions {
  /** Only run these collector ids (and any opt-in ones listed here). */
  include?: string[];
  /** Skip these collector ids, e.g. ['webrtc'] to avoid contacting a STUN server. */
  exclude?: string[];
  /** Per-collector timeout override in ms. */
  timeoutMs?: number;
}

export type ComponentResult =
  | { ok: true; value: unknown; ms: number; stable: boolean; hash: string }
  | { ok: false; error: string; ms: number; stable: boolean };

export interface AdvancedResult {
  version: string;
  /** Hash of all stable components plus the Light identity. Far more unique than light.visitorId. */
  visitorId: string;
  /** Confidence that this ID will be reproduced for the same browser and is not forged. */
  confidence: ConfidenceResult;
  /** Heuristic upper bound of identifying information in the stable components. Signals correlate. */
  estimatedEntropyBits: number;
  light: LightResult;
  /** Hardware regrouped by category: cpu, memory, gpu, display, input, audio, camera, sensors, connectivity. */
  hardware: HardwareProfile;
  /**
   * Battery state, or null where the Battery Status API doesn't exist (Firefox, Safari) or is blocked.
   * `chargingTime`/`dischargingTime` are seconds, or null when the browser reports Infinity (unknown).
   */
  battery: { charging: boolean; chargingTime: number | null; dischargingTime: number | null; level: number } | null;
  analysis: Analysis;
  /** Time spent on bot / tamper / manipulation checks (they include a worker round-trip). */
  analysisMs: number;
  components: Record<string, ComponentResult>;
  durationMs: number;
}

export async function getAdvanced(options: AdvancedOptions = {}): Promise<AdvancedResult> {
  const start = now();
  const light = await getLight(options);

  const selected = COLLECTORS.filter((c) => {
    if (options.exclude?.includes(c.id)) return false;
    if (options.include) return options.include.includes(c.id);
    return !c.optIn;
  });

  const runs = await Promise.all(
    selected.map(async (c) => {
      const r = await safe(c.run, options.timeoutMs ?? c.timeoutMs ?? 3000);
      return [c, r] as const;
    }),
  );

  const components: Record<string, ComponentResult> = {};
  const values: Record<string, any> = {};
  for (const [c, r] of runs) {
    if (r.ok) {
      values[c.id] = r.value;
      components[c.id] = { ok: true, value: r.value, ms: r.ms, stable: c.stable, hash: (await hashOf(r.value)).slice(0, 16) };
    } else {
      components[c.id] = { ok: false, error: r.error, ms: r.ms, stable: c.stable };
    }
  }

  const analysisStart = now();
  const analysis = await analyze(light, values);
  const analysisMs = round(now() - analysisStart, 1);

  // visitorId: stable components only. Anything the user may toggle between visits is excluded.
  const stableHashes = Object.fromEntries(
    Object.entries(components)
      .filter(([, v]) => v.stable && v.ok)
      .map(([k, v]) => [k, (v as { hash: string }).hash]),
  );
  const visitorId = (await hashOf({ light: light.visitorId, ...stableHashes })).slice(0, 32);

  // --- Confidence ---
  const cb = new ConfidenceBuilder();
  const supported = (id: string) => !!values[id] && values[id].supported !== false;
  for (const c of COLLECTORS.filter((x) => x.stable && !x.optIn)) {
    cb.factor(c.id, c.bits, !!components[c.id]?.ok && supported(c.id), `~${c.bits} bits`);
  }
  cb.factor('light', 6, light.confidence.score >= 0.5, `light confidence ${light.confidence.score}`);
  // Light's own contradictions are already priced into its score; carry them over proportionally.
  const lightPenalty = round((1 - light.confidence.score) * 0.3);
  if (lightPenalty > 0) cb.penalty('light-confidence', lightPenalty, 'device/browser identification was uncertain');
  if (analysis.bot.score >= 0.3) cb.penalty('bot-likelihood', round(analysis.bot.score * 0.35), `bot score ${analysis.bot.score}`);
  // The manipulation score already folds in patched natives, contradictions and canvas noise: price it once.
  const manip = analysis.manipulation;
  if (manip.score >= 0.15) {
    cb.penalty('manipulation', round(manip.score * 0.4), `manipulation likelihood ${manip.score} (${manip.level})`);
  }
  if (values.canvas?.randomized) cb.penalty('unstable-canvas', 0.1, 'canvas hash changes on every call, ID will not be reproducible');
  const confidence = cb.build();

  // Signals correlate (the GPU predicts the OS, the OS predicts fonts...), so a plain sum would
  // wildly overstate. Each further signal counts 30% less than the one before, strongest first.
  const estimatedEntropyBits = round(
    COLLECTORS.filter((c) => c.stable && components[c.id]?.ok && supported(c.id))
      .map((c) => c.bits)
      .sort((a, b) => b - a)
      .reduce((sum, bits, i) => sum + bits * 0.7 ** i, 0),
    1,
  );

  return {
    version: VERSION,
    visitorId,
    confidence,
    estimatedEntropyBits,
    light,
    hardware: buildHardware(light, values),
    battery: values.battery?.supported
      ? {
          charging: values.battery.charging,
          chargingTime: values.battery.chargingTime,
          dischargingTime: values.battery.dischargingTime,
          level: values.battery.level,
        }
      : null,
    analysis,
    analysisMs,
    components,
    durationMs: round(now() - start, 1),
  };
}
