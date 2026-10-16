import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: { alias: { '@explore/shared': resolve(__dirname, '../../packages/shared/src') } },
  test: {
    environment: 'node',
    include: ['tests/benchmarks/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
