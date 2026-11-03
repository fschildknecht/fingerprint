import type { Collector } from './types';

/** One emoji per Unicode release. Platforms without that release draw a tofu box or two glyphs, which has a different width. */
const BY_VERSION: [string, string][] = [
  ['6.0', '\u{1F600}'],
  ['8.0', '\u{1F9C0}'], // cheese wedge
  ['9.0', '\u{1F923}'], // rofl
  ['10.0', '\u{1F9D9}'], // mage
  ['11.0', '\u{1F9B8}'], // superhero
  ['12.0', '\u{1F9CD}'], // standing person
  ['12.1', '\u{1F9D1}‍\u{1F9B0}'], // person: red hair
  ['13.0', '\u{1F972}'], // smiling face with tear
  ['13.1', '\u{1F62E}‍\u{1F4A8}'], // face exhaling
  ['14.0', '\u{1FAE0}'], // melting face
  ['15.0', '\u{1FAE8}'], // shaking face
  ['15.1', '\u{1F426}‍\u{1F525}'], // phoenix
  ['16.0', '\u{1FAE9}'], // face with bags under eyes
];

/**
 * Emoji set and rasteriser. The newest emoji the platform can draw dates the OS/browser font
 * update; the glyph metrics identify the emoji font (Apple, Segoe, Noto, Twemoji...). Uses
 * layout only, nothing is painted to a canvas, so canvas-blocking extensions do not affect it.
 */
export const emoji: Collector = {
  id: 'emoji',
  stable: true,
  bits: 4,
  run() {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
    const span = document.createElement('span');
    span.style.cssText = 'font-size:64px;white-space:nowrap;line-height:normal;font-family:sans-serif';
    holder.appendChild(span);
    document.body.appendChild(holder);
    const size = (text: string) => {
      span.textContent = text;
      const r = span.getBoundingClientRect();
      return [Number(r.width.toFixed(3)), Number(r.height.toFixed(3))] as const;
    };
    try {
      const tofu = size('\u{10FFFF}'); // unassigned: shows the missing-glyph box
      const metrics: Record<string, readonly number[]> = {};
      let newest: string | null = null;
      for (const [version, ch] of BY_VERSION) {
        const m = size(ch);
        metrics[version] = m;
        // Supported = narrower than two tofu boxes and not equal to the single-box fallback.
        const single = size(ch.split('‍')[0]);
        const joined = ch.includes('‍') ? m[0] < single[0] * 1.6 : m[0] !== tofu[0] || m[1] !== tofu[1];
        if (joined) newest = version;
      }
      return { newestUnicode: newest, tofu, metrics, flag: size('\u{1F1E8}\u{1F1ED}'), keycap: size('1️⃣') };
    } finally {
      holder.remove();
    }
  },
};
