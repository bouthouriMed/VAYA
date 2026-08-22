import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The integration suites here run against real Postgres and the real
    // docker-composed OSRM instance — individual tests legitimately take
    // multiple seconds even unloaded, and turbo's parallel workers push some
    // past vitest's 5s default on slower machines. Assertion semantics
    // unchanged.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
