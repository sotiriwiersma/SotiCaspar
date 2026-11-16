import { defineConfig } from 'vitest/config';

/** Tests that need a running CasparCG server. Not part of `npm test`. */
export default defineConfig({
  test: {
    include: ['packages/**/test-live/**/*.test.ts', 'apps/**/test-live/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
});
