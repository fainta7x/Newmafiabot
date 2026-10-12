import { test, expect } from '@playwright/test';

// The CRM «Проект» screen on a phone: no sideways scroll, every tab works, the cards open, touch targets are large enough.
for (const width of [360, 390]) test(`project board fits and works at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/e2e/project-board.html');
  const board = page.getByTestId('project-board');
  await expect(board).toBeVisible();
  await expect(page.getByTestId('project-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`project-waiting-${width}.png`) });
  await page.getByTestId('project-card').first().locator('summary').click();
  await expect(page.getByTestId('project-card').first().locator('div').last()).toBeVisible();
  await page.getByTestId('project-tab-roadmap').click();
  await expect(page.getByTestId('project-direction-game')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`project-roadmap-${width}.png`) });
  await page.getByTestId('project-tab-prs').click();
  await expect(page.getByTestId('project-pr')).toHaveCount(3);
  await expect(page.getByTestId('project-pr').first()).toContainText('🤖 Claude');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const heights = await board.locator('button:visible').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.every((height) => height >= 35.5)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`project-prs-${width}.png`) });
});
