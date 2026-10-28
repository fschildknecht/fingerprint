/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashOf, sha256 } from '@fingerprint/core';
import type { Collector } from './types';

const PARAMS = [
  'MAX_TEXTURE_SIZE',
  'MAX_CUBE_MAP_TEXTURE_SIZE',
  'MAX_RENDERBUFFER_SIZE',
  'MAX_VIEWPORT_DIMS',
  'MAX_VERTEX_ATTRIBS',
  'MAX_VERTEX_UNIFORM_VECTORS',
  'MAX_VARYING_VECTORS',
  'MAX_FRAGMENT_UNIFORM_VECTORS',
  'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
  'MAX_TEXTURE_IMAGE_UNITS',
  'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
  'ALIASED_LINE_WIDTH_RANGE',
  'ALIASED_POINT_SIZE_RANGE',
  'RED_BITS',
  'GREEN_BITS',
  'BLUE_BITS',
  'ALPHA_BITS',
  'DEPTH_BITS',
  'STENCIL_BITS',
  'SUBPIXEL_BITS',
  'VERSION',
  'SHADING_LANGUAGE_VERSION',
  'VENDOR',
  'RENDERER',
];

function describe(gl: any) {
  const params: Record<string, unknown> = {};
  for (const name of PARAMS) {
    try {
      const v = gl.getParameter(gl[name]);
      params[name] = v && typeof v === 'object' && 'length' in v ? Array.from(v as ArrayLike<number>) : v;
    } catch {
      params[name] = null;
    }
  }

  let unmaskedVendor: string | null = null;
  let unmaskedRenderer: string | null = null;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    unmaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    unmaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  }

  const precision: Record<string, number[]> = {};
  for (const shader of ['VERTEX_SHADER', 'FRAGMENT_SHADER']) {
    for (const p of ['LOW_FLOAT', 'MEDIUM_FLOAT', 'HIGH_FLOAT', 'LOW_INT', 'MEDIUM_INT', 'HIGH_INT']) {
      const f = gl.getShaderPrecisionFormat(gl[shader], gl[p]);
      if (f) precision[`${shader}.${p}`] = [f.rangeMin, f.rangeMax, f.precision];
    }
  }

  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  return {
    params,
    unmaskedVendor,
    unmaskedRenderer,
    precision,
    extensions: (gl.getSupportedExtensions() ?? []).slice().sort(),
    maxAnisotropy: aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : null,
    antialias: gl.getContextAttributes()?.antialias ?? null,
  };
}

/** Draw a gradient triangle and hash the pixels: exposes driver-level rasterisation differences. */
async function renderHash(gl: any): Promise<string | null> {
  try {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}');
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(
      fs,
      'precision mediump float;varying vec2 v;void main(){gl_FragColor=vec4(sin(v.x*12.9898)*.5+.5,fract(sin(dot(v,vec2(78.233,12.9898)))*43758.5453),cos(v.y*7.13)*.5+.5,1.);}',
    );
    gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 0, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return await sha256(Array.from(px).join(','));
  } catch {
    return null;
  }
}

function context(kind: 'webgl' | 'webgl2'): any {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  return c.getContext(kind, { antialias: true }) ?? (kind === 'webgl' ? c.getContext('experimental-webgl') : null);
}

export const webgl: Collector = {
  id: 'webgl',
  stable: true,
  bits: 8,
  async run() {
    const gl1 = context('webgl');
    const gl2 = context('webgl2');
    if (!gl1 && !gl2) return { supported: false };
    const primary = gl1 ?? gl2;
    const d = describe(primary);
    const d2 = gl2 ? describe(gl2) : null;
    return {
      supported: true,
      webgl1: !!gl1,
      webgl2: !!gl2,
      ...d,
      webgl2Extensions: d2?.extensions ?? null,
      webgl2Hash: d2 ? await hashOf({ p: d2.params, e: d2.extensions }) : null,
      renderHash: await renderHash(primary),
      paramsHash: await hashOf({ p: d.params, pr: d.precision, e: d.extensions }),
    };
  },
};
