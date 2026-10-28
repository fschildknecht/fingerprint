import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@fingerprint/core': src('core'),
      '@fingerprint/light': src('light'),
      '@fingerprint/advanced': src('advanced'),
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
