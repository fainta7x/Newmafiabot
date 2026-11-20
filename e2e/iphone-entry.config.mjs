import { defineConfig } from '@playwright/test';

// npm run build, then IPHONE_ENGINE=webkit (or chromium) playwright test --config=e2e/iphone-entry.config.mjs.
const browserName = process.env.IPHONE_ENGINE || 'chromium';
const executablePath = browserName === 'webkit' ? process.env.WEBKIT_EXECUTABLE_PATH : process.env.CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
  testDir: './tests',
  testMatch: 'iphone-entry.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5000 },
  reporter: 'line',
  outputDir: `../temp/iphone-entry-${browserName}`,
  use: {
    baseURL: 'http://127.0.0.1:4183',
    browserName,
    launchOptions: executablePath ? { executablePath } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm exec vite preview -- --host 127.0.0.1 --port 4183 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: !process.env.CI,
  },
});
