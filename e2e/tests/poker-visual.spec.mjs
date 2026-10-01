import { expect, test } from '@playwright/test';

test('poker 2.5D seats use readable integrated typography on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html');
  await page.getByRole('button', { name: '+ Создать открытый стол' }).click();

  await expect(page.locator('.poker-seat-name')).toHaveCount(2);
  await expect(page.getByText('Бот Лаки', { exact: true })).toBeVisible();
  await expect(page.getByText('Бот Блеф', { exact: true })).toBeVisible();
  await expect(page.locator('.poker-seat-stack').filter({ hasText: '1 080' })).toBeVisible();
  await expect(page.locator('.poker-hero-name')).toHaveText('Вы');
  await expect(page.locator('.poker-hand-label')).toContainText('Старшая карта: валет');

  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);

  // Capture the settled table after the staggered two-card deal animation.
  await page.waitForTimeout(700);
  const screenshot = info.outputPath('poker-seat-typography-390x844.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await info.attach('poker-seat-typography-390x844.png', { path: screenshot, contentType: 'image/png' });
});
