import { sha256 } from '@fingerprint/core';
import type { Collector } from './types';

function render(): { url: string; blank: boolean; geometry: string; text: string } | null {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Geometry layer
  ctx.globalCompositeOperation = 'multiply';
  for (const [color, x, y] of [
    ['#f2f', 40, 40],
    ['#2ff', 80, 40],
    ['#ff2', 60, 70],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#f9c';
  ctx.arc(60, 60, 60, 0, Math.PI * 2, true);
  ctx.arc(60, 60, 20, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  const geometry = canvas.toDataURL();

  // Text layer: emoji + mixed fonts expose the platform's font rasteriser and emoji set
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.font = '14px "Times New Roman", serif';
  ctx.fillText('Cwm fjordbank glyphs vext quiz, \u{1F603}\u{1F9EC}', 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.font = '18pt Arial, sans-serif';
  ctx.fillText('Cwm fjordbank glyphs vext quiz, \u{1F603}', 4, 45);
  const url = canvas.toDataURL();

  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let blank = true;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== 0) {
      blank = false;
      break;
    }
  }
  return { url, blank, geometry, text: url };
}

export const canvas: Collector = {
  id: 'canvas',
  stable: true,
  bits: 9,
  async run() {
    const a = render();
    if (!a) return { supported: false };
    const b = render();
    // Rendering the same scene twice must give identical bytes. If not, the browser injects noise
    // (Brave "farbling", Firefox RFP, anti-detect browsers, extensions).
    const randomized = !!b && a.url !== b.url;
    return {
      supported: true,
      hash: await sha256(a.url),
      geometryHash: await sha256(a.geometry),
      blank: a.blank,
      randomized,
    };
  },
};
