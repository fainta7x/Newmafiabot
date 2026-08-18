import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.CI ? 'chrome' : undefined,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      // Browser E2E uses test-safe DB behavior/workers, but explicitly opts
      // into Vite middleware so /admin renders the real browser UI.
      NODE_ENV: 'test',
      VITEST: '1',
      PLAYWRIGHT_E2E: '1',
      HOST: '127.0.0.1',
      PORT: '4173',
      DATABASE_PATH: './temp/playwright-e2e.sqlite',
      SEED_DEMO_DATA: 'false',
    },
  },
});
