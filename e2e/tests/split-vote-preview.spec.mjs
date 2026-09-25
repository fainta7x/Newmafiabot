import { test, expect } from '@playwright/test';

test('split-vote exercise fits a Telegram-sized screen and explains the choice', async ({ page }, testInfo) => {
  await page.goto('/e2e/split-vote.html');
  await expect(page.getByTestId('split-vote-training')).toBeVisible();
  await expect(page.getByTestId('guide-tab-split')).toBeInViewport();
  await expect(page.getByTestId('split-vote-modes')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('split-vote-modes.png'), fullPage: true });
  await page.getByRole('button', { name: 'Практика · 5 вопросов' }).first().click();
  await expect(page.getByRole('button', { name: /^За №/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-vote-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /^За №/ }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('split-vote-choice.png') });
  await page.getByRole('button', { name: /^За №/ }).first().click();
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('status')).toContainText('по 5 голосов');
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await expect(page.getByRole('button', { name: 'Проверить ответ' })).toBeDisabled();
});

test('whole-table voting uses nomination order on a phone', async ({ page }, testInfo) => {
  await page.goto('/e2e/split-vote.html');
  await page.getByRole('button', { name: 'Бесконечная практика' }).click();
  const nominees = (await page.getByTestId('split-vote-nominees').textContent()).match(/№\d+/g);
  for (const nominee of nominees) {
    await expect(page.getByRole('heading', { name: `Кто голосует за ${nominee}?` })).toBeVisible();
    if (nominee === nominees[0]) {
      await page.getByRole('button', { name: '№1', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath('split-vote-whole-table-390.png'), fullPage: true });
      await page.getByRole('button', { name: 'Продолжить' }).click();
      await expect(page.getByRole('button', { name: '№1', exact: true })).toHaveCount(0);
    } else {
      await page.getByRole('button', { name: 'Пропустить' }).click();
    }
  }
  await expect(page.getByTestId('split-vote-review')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Проверить голосование' }).click();
  await expect(page.getByRole('status')).toContainText('Распределение голосов неверное');
});
