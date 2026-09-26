import { test, expect } from '@playwright/test';

test('split-vote exercise fits a Telegram-sized screen and explains the choice', async ({ page }, testInfo) => {
  await page.goto('/e2e/split-vote.html');
  await expect(page.getByTestId('split-vote-training')).toBeVisible();
  await expect(page.getByTestId('guide-back')).toBeInViewport();
  await expect(page.getByTestId('split-vote-modes')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('split-vote-modes.png'), fullPage: true });
  await page.getByRole('button', { name: 'Практика · 5 вопросов' }).first().click();
  await expect(page.getByRole('button', { name: /^В \d+$/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-vote-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /^В \d+$/ }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('split-vote-choice.png') });
  await page.getByRole('button', { name: /^В \d+$/ }).first().click();
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('status')).toContainText('по 5 голосов');
  await page.getByRole('button', { name: 'Следующая задача' }).click();
  await expect(page.getByRole('button', { name: 'Проверить ответ' })).toBeDisabled();
});

test('whole-table voting uses nomination order on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ json: { passed: ['basic', 'advanced'] } }));
  await page.goto('/e2e/split-vote.html');
  await page.getByTestId('split-vote-level-interactive').getByRole('button', { name: 'Бесконечная практика' }).click();
  const nominees = (await page.getByTestId('split-vote-nominees').textContent()).split(':')[1].match(/\d+/g);
  for (const nominee of nominees) {
    await expect(page.getByRole('heading', { name: `Кто голосует в ${nominee}?` })).toBeVisible();
    if (nominee === nominees[0]) {
      await page.getByRole('button', { name: '1', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath('split-vote-whole-table-390.png'), fullPage: true });
      await page.getByRole('button', { name: 'Продолжить' }).click();
      await expect(page.getByRole('button', { name: '1', exact: true })).toHaveCount(0);
    } else {
      await page.getByRole('button', { name: /^(Пропустить|Продолжить)$/ }).click();
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
  // Every section and the novice path fit the first phone screen.
  await expect(page.getByTestId('guide-section-trainers')).toBeInViewport();
  await expect(page.getByTestId('guide-section-articles')).toBeInViewport();
  await expect(page.getByTestId('guide-continue')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('guide-home-390.png'), fullPage: true });

  await page.getByTestId('guide-continue').click();
  await expect(page.getByTestId('guide-lesson-content')).toBeVisible();
  await expect(page.getByRole('button', { name: /Следующий урок/ })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('guide-lesson-390.png') });

  await page.getByTestId('guide-back').click();
  await page.getByTestId('guide-section-reference').click();
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

test('guide articles and trainers sections open on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/e2e/split-vote.html?tab=home');
  await page.getByTestId('guide-section-trainers').click();
  await expect(page.getByTestId('guide-tab-split-three')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('guide-trainers-390.png') });
  await page.getByTestId('guide-tab-split-three').click();
  await expect(page.getByTestId('split-three-modes')).toBeVisible();
  await page.getByTestId('guide-more').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('guide-trainer-more-390.png') });
  await page.goto('/e2e/split-vote.html?tab=articles');
  await page.getByTestId('guide-tab-split-article').click();
  await expect(page.getByTestId('guide-article')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('guide-article-390.png') });
});

test('expert level shows the break and a running 15-second timer on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ json: { passed: ['basic', 'advanced', 'interactive'] } }));
  await page.goto('/e2e/split-vote.html');
  await page.getByTestId('split-vote-level-expert').getByRole('button', { name: 'Практика · 5 вопросов' }).click();
  await expect(page.getByTestId('split-vote-break')).toBeVisible();
  await expect(page.getByTestId('split-vote-timer')).toContainText('с');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-vote-expert-390.png'), fullPage: true });
});

test('three-way split trainer fits a phone at both levels', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ json: { passed: ['three_easy'] } }));
  await page.goto('/e2e/split-vote.html?tab=split-three');
  await expect(page.getByTestId('split-three-modes')).toBeVisible();
  await page.getByTestId('split-three-level-three_easy').getByRole('button', { name: 'Практика · 5 вопросов' }).click();
  await expect(page.getByRole('button', { name: /^В \d+$/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-three-easy-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'К выбору режима' }).click();
  await page.getByTestId('split-three-level-three_medium').getByRole('button', { name: 'Практика · 5 вопросов' }).click();
  await expect(page.getByTestId('split-three-interactive')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-three-medium-390.png'), fullPage: true });
});

test('three-way split hard level shows both sheriffs on a phone', async ({ page }, testInfo) => {
  await page.route('**/api/player/split-vote-progress', (route) => route.fulfill({ json: { passed: ['three_easy', 'three_medium'] } }));
  await page.goto('/e2e/split-vote.html?tab=split-three');
  await page.getByTestId('split-three-level-three_hard').getByRole('button', { name: 'Практика · 5 вопросов' }).click();
  await expect(page.getByTestId('split-three-sheriffs')).toContainText('Город меньше верит шерифу');
  // The task opens from its conditions even though the level card was lower on the page.
  await expect(page.getByTestId('split-three-sheriffs')).toBeInViewport();
  await expect(page.getByTestId('split-table-map')).toBeVisible();
  await expect(page.getByTestId('split-three-interactive')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('split-three-hard-390.png') });
  for (let step = 0; step < 6; step += 1) {
    const next = page.getByRole('button', { name: /^(Пропустить|Продолжить)$/ });
    if (!(await next.isVisible())) break;
    await next.click();
  }
  await page.getByRole('button', { name: 'Проверить голосование' }).click();
  await expect(page.getByRole('status')).toContainText('Если прав шериф');
  await page.screenshot({ path: testInfo.outputPath('split-three-hard-answer-390.png'), fullPage: true });
});

test('a guide screen opened from the bottom of another starts at its top', async ({ page }) => {
  // The app scrolls inside #root, so the reset must not rely on window.scrollTo alone.
  await page.goto('/e2e/split-vote.html?tab=split-three');
  await page.getByTestId('guide-more').scrollIntoViewIfNeeded();
  await page.getByTestId('guide-tab-split').click();
  await expect(page.getByTestId('split-vote-modes')).toBeVisible();
  await expect(page.getByTestId('guide-place')).toBeInViewport();
  expect(await page.evaluate(() => document.getElementById('root').scrollTop)).toBe(0);
});
