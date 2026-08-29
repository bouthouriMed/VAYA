import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // The vertical-journey suite (tests/journeys/) registers several real
  // accounts per test against auth.routes.ts's real OTP rate limit
  // (5/minute/IP) and retries with the server's own backoff rather than
  // bypassing it (see journey-helpers.ts's requestOtpWithBackoff) — the
  // default 30s per-test timeout isn't enough headroom for that wait.
  timeout: 120_000,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'api',
      testMatch: /.*\.api\.test\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
      },
    },
    {
      name: 'web',
      testMatch: /.*\.web\.test\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.WEB_URL || 'http://localhost:3001',
      },
    },
  ],
  outputDir: './test-results',
});
