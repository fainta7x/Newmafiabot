import { expect, test } from '@playwright/test';

test('poker 2.5D seats use readable integrated typography on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html');
  await page.getByRole('button', { name: '+ Создать стол · 1 000 жетонов' }).click();

  await expect(page.locator('.poker-seat-name')).toHaveCount(2);
  await expect(page.getByText('Бот Лаки', { exact: true })).toBeVisible();
  await expect(page.getByText('Бот Блеф', { exact: true })).toBeVisible();
  await expect(page.locator('.poker-seat-stack').filter({ hasText: '1 080' })).toBeVisible();
  await expect(page.locator('.poker-hero-name')).toHaveText('Я');
  await expect(page.locator('.poker-hand-label')).toContainText('Старшая карта: валет');

  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);

  // Capture the settled table after the staggered two-card deal animation.
  await page.waitForTimeout(700);
  const screenshot = info.outputPath('poker-seat-typography-390x844.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await info.attach('poker-seat-typography-390x844.png', { path: screenshot, contentType: 'image/png' });
});

test('poker table recovers its full width after Telegram resumes', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html');
  await page.getByRole('button', { name: '+ Создать стол · 1 000 жетонов' }).click();

  const frame = page.getByTestId('poker-table-frame');
  await expect.poll(async () => (await frame.locator('> div').boundingBox())?.width).toBeGreaterThan(380);

  // Telegram briefly reports a compact viewport while the Mini App is hidden, and Android can keep
  // that stale height after the restore. The table must not shrink into side bars (owner, 2026-10-02).
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--tg-viewport-height', '430px');
    window.dispatchEvent(new Event('telegramviewportchange'));
  });
  await page.waitForTimeout(400);
  expect((await frame.locator('> div').boundingBox())?.width).toBeGreaterThan(380);

  // On return the native viewport recovers without a browser resize event.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--tg-viewport-height', '844px');
    window.dispatchEvent(new Event('telegramviewportchange'));
  });
  await expect.poll(async () => (await frame.locator('> div').boundingBox())?.width).toBeGreaterThan(380);

  const box = await frame.locator('> div').boundingBox();
  expect(box?.height).toBeGreaterThan(500);
  const screenshot = info.outputPath('poker-after-telegram-resume-390x844.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await info.attach('poker-after-telegram-resume-390x844.png', { path: screenshot, contentType: 'image/png' });
});

test('poker table remains scrollable in a short Telegram landscape viewport', async ({ page }) => {
  await page.setViewportSize({ width: 713, height: 390 });
  await page.goto('/e2e/poker-harness.html');
  await page.getByRole('button', { name: '+ Создать стол · 1 000 жетонов' }).click();

  const geometry = await page.evaluate(() => ({
    viewportHeight: innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }));
  expect(geometry.documentHeight).toBeGreaterThan(geometry.viewportHeight);
  expect(geometry.bodyOverflowY).not.toBe('hidden');
  await expect(page.getByTestId('poker-table-frame')).toBeVisible();
});
