import { test, expect } from '@playwright/test';
for (const width of [360, 390]) test(`evening price settings at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  let policy = { casual_game: 100, casual_cap: 400, novice_game: 200, novice_cap: null, rating_entry: 500 };
  await page.route('**/api/admin-data/summary', route => route.fulfill({ json: { achievements: [], shop_items: [] } }));
  await page.route('**/api/evening-prices', route => {
    if (route.request().method() === 'PUT') policy = route.request().postDataJSON();
    return route.fulfill({ json: policy });
  });
  await page.goto('/e2e/evening-prices.html?before=1');
  await expect(page.getByText('Данные и настройки', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`evening-prices-before-${width}.png`), fullPage: true });
  await page.goto('/e2e/evening-prices.html');
  await expect(page.getByRole('button', { name: 'Сохранить цены' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath(`evening-prices-after-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Обычный вечер · за игру', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Сохранить цены' }).click();
  await expect(page.getByRole('status')).toHaveText('Сохранено. Цены действуют для новых вечеров.');
  expect(policy.casual_game).toBe(150);
  await page.reload();
  await expect(page.getByLabel('Обычный вечер · за игру', { exact: true })).toHaveValue('150');
  await page.getByLabel('Новички · максимум', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Сохранить цены' }).click();
  expect(policy.novice_cap).toBe(500);
});
