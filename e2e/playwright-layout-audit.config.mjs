import { defineConfig } from '@playwright/test';
import preview from './playwright-preview.config.mjs';

// The whole-app layout and text audit (AGENTS.md, Layout and text gate) on the same isolated preview build as the UI
// preview checks, as its own CI job with parallel workers: it opens about 55 pages six times each.
export default defineConfig({
  ...preview,
  testMatch: ['app-text-audit.spec.mjs'],
  workers: 4,
  timeout: 60_000,
  outputDir: './layout-audit-results',
});
