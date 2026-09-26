import { test, expect } from '@playwright/test';

test('split-vote exercise fits a Telegram-sized screen and explains the choice', async ({ page }, testInfo) => {
  await page.goto('/e2e/split-vote.html');
  await expect(page.getByTestId('split-vote-training')).toBeVisible();
  await expect(page.getByTestId('guide-back')).toBeInViewport();
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
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ json: { passed: ['basic', 'advanced'] } }));
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

test('passed exam is clearly marked on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ json: { passed: ['basic'] } }));
  await page.goto('/e2e/split-vote.html');
  const level = page.getByTestId('split-vote-level-basic');
  await expect(level.getByTestId('split-vote-passed-basic')).toContainText('Экзамен сдан');
  await expect(level.getByRole('button', { name: 'Пройти ещё раз' })).toBeVisible();
  await level.screenshot({ path: testInfo.outputPath('split-vote-passed-390.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('guide home leads a novice through lessons and sections on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/e2e/split-vote.html?tab=home');
  await expect(page.getByTestId('guide-continue')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('guide-home-390.png'), fullPage: true });

  await page.getByTestId('guide-continue').click();
  await expect(page.getByTestId('guide-lesson-content')).toBeVisible();
  await expect(page.getByRole('button', { name: /Следующий урок/ })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('guide-lesson-390.png') });

  await page.getByTestId('guide-back').click();
  await page.getByTestId('guide-tab-roles').click();
  await expect(page.getByTestId('guide-role-card')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('guide-roles-390.png'), fullPage: true });
  await page.goBack();
  await page.getByTestId('guide-tab-rules').click();
  await expect(page.getByTestId('guide-rule').first()).toBeVisible();
  await page.getByTestId('guide-rule').filter({ hasText: 'Попил в первый день' }).getByRole('button').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('guide-rules-390.png'), fullPage: true });
});

test('guide articles and trainers shelves open on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/e2e/split-vote.html?tab=home');
  await page.getByTestId('guide-shelf-articles').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('guide-home-shelves-390.png') });
  await page.getByTestId('guide-tab-split-article').click();
  await expect(page.getByTestId('guide-article')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('guide-article-390.png') });
});
