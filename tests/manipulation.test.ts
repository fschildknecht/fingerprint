import { describe, expect, it } from 'vitest';
import { levelOfManipulation, scoreManipulation } from '../packages/advanced/src/manipulation';

const sig = (category: any, weight: number) => ({ id: 'x', category, weight, detail: 'x' });

describe('scoreManipulation', () => {
  it('is 0 / none without signals', () => {
    const r = scoreManipulation([]);
    expect(r.score).toBe(0);
    expect(r.level).toBe('none');
  });

  it('combines independent signals as 1 - prod(1 - w)', () => {
    expect(scoreManipulation([sig('tampering', 0.5), sig('cross-context', 0.5)]).score).toBe(0.75);
  });

  it('reports a per-category breakdown', () => {
    const r = scoreManipulation([sig('tampering', 0.5), sig('tampering', 0.5), sig('noise', 0.2)]);
    expect(r.categories).toEqual({ tampering: 0.75, noise: 0.2 });
  });

  it('maps scores to levels', () => {
    expect(levelOfManipulation(0.1)).toBe('none');
    expect(levelOfManipulation(0.3)).toBe('low');
    expect(levelOfManipulation(0.5)).toBe('medium');
    expect(levelOfManipulation(0.9)).toBe('high');
  });
});
