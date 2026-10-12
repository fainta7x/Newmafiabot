import { test, expect } from '@playwright/test';

// The drawn medals (places 1–3 and a plain one) and nomination plaques render at phone width without sideways scroll.
test('trophy icons render as a gallery at 390px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/e2e/trophy-icons.html');
  await expect(page.getByTestId('icon-medals').locator('svg')).toHaveCount(4);
  await expect(page.getByTestId('icon-plaques').locator('svg')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('trophy-icons-390.png') });
});
