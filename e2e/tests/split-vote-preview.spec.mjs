import { test, expect } from '@playwright/test';

test('split-vote exercise fits a Telegram-sized screen and explains the choice', async ({ page }, testInfo) => {
  await page.goto('/e2e/split-vote.html');
  await expect(page.getByTestId('split-vote-training')).toBeVisible();
  await expect(page.getByRole('button', { name: /^За №/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-vote-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /^За №/ }).first().click();
  await page.getByRole('button', { name: 'Проверить голос' }).click();
  await expect(page.getByRole('status')).toContainText('5:5');
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await expect(page.getByRole('button', { name: 'Проверить голос' })).toBeDisabled();
});
