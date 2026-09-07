import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['crm-evening-roster.spec.mjs', 'ui-preview.spec.mjs', 'mobile-usability.spec.mjs', 'crm-visual-audit.spec.mjs', 'player-cabinet-visual-audit.spec.mjs'],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  retries: 0,
  outputDir: './preview-results',
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: process.env.CI ? 'chrome' : undefined,
    viewport: { width: 390, height: 713 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js temp/ui-preview --host 127.0.0.1 --port 4173 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:4173/preview/index.html',
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
