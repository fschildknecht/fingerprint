import type { ConfidenceFactor, ConfidenceLevel, ConfidencePenalty, ConfidenceResult } from './types';
import { clamp, round } from './utils';

export function levelOf(score: number): ConfidenceLevel {
  if (score < 0.4) return 'low';
  if (score < 0.7) return 'medium';
  if (score < 0.9) return 'high';
  return 'very-high';
}

/**
 * Confidence model.
 *
 *   score = (sum of weights of signals that were obtained / sum of all weights) - sum of penalties
 *
 * Factors answer "did we get enough independent evidence?", penalties answer "does the
 * evidence contradict itself or look manipulated?". The result is clamped to 0..1.
 */
export class ConfidenceBuilder {
  private factors: ConfidenceFactor[] = [];
  private penalties: ConfidencePenalty[] = [];

  factor(id: string, weight: number, present: boolean, note?: string): this {
    this.factors.push({ id, weight, present, note });
    return this;
  }

  penalty(id: string, amount: number, note: string): this {
    this.penalties.push({ id, amount, note });
    return this;
  }

  build(): ConfidenceResult {
    const total = this.factors.reduce((s, f) => s + f.weight, 0) || 1;
    const got = this.factors.reduce((s, f) => s + (f.present ? f.weight : 0), 0);
    const pen = this.penalties.reduce((s, p) => s + p.amount, 0);
    const score = round(clamp(got / total - pen));
    return { score, level: levelOf(score), factors: this.factors, penalties: this.penalties };
  }
}
