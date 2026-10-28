import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  dts: true,
  clean: true,
  minify: true,
  target: 'es2020',
  noExternal: [/^@fingerprint\//],
  globalName: 'FingerprintAdvanced',
});
