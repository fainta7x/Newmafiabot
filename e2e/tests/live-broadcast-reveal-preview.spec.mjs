import { test, expect } from '@playwright/test';

// The OBS screen at full HD: a revealed player is marked and the announced checks sit on his card.
test('broadcast shows reveals and announced checks on the player cards at 1920x1080', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/e2e/live-broadcast-reveal.html');
  await expect(page.locator('.live-broadcast-player')).toHaveCount(10);
  await expect(page.locator('.live-broadcast-reveal-banner')).toHaveCount(2);
  const don = page.locator('.live-broadcast-player', { has: page.locator('.live-broadcast-seat-number', { hasText: /^10$/ }) });
  await expect(don.locator('.live-broadcast-fact.is-reveal')).toContainText('красн.');
  await expect(don.locator('.live-broadcast-reveal-banner')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('broadcast-reveals-1920.png') });
});
