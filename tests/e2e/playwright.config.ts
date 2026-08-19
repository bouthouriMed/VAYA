import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
