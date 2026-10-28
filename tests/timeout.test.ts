import { describe, expect, it } from 'vitest';
import { safe, withTimeout } from '@fingerprint/core';

const busy = (ms: number) => {
  const end = performance.now() + ms;
  while (performance.now() < end);
};

describe('withTimeout', () => {
  it('rejects when the work really is too slow', async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 400)), 100)).rejects.toThrow('timeout');
  });

  it('resolves normally', async () => {
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
  });

  it('does not count time the main thread was blocked by a sibling', async () => {
    // 200 ms budget, but a sibling freezes the thread for 300 ms and the work needs 150 ms of real waiting.
    const p = withTimeout(new Promise((r) => setTimeout(() => r('done'), 150)), 200);
    setTimeout(() => busy(300), 10);
    await expect(p).resolves.toBe('done');
  });

  it('safe() reports a timeout as data, never throws', async () => {
    const r = await safe(() => new Promise(() => {}), 80);
    expect(r).toMatchObject({ ok: false, error: 'timeout' });
  });
});
