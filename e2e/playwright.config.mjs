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
      // Browser E2E needs the real Vite middleware so /admin renders the React app.
      // Keep the database isolated, but do not make createApp think this is Vitest.
      NODE_ENV: 'development',
      VITEST: '',
      HOST: '127.0.0.1',
      PORT: '4173',
      DATABASE_PATH: './temp/playwright-e2e.sqlite',
      SEED_DEMO_DATA: 'false',
    },
  },
});
