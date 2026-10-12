import { expect, test } from '@playwright/test';

test('poker 2.5D seats use readable integrated typography on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html');
  await page.getByRole('button', { name: '+ Создать стол · 1 000 жетонов' }).click();

  await expect(page.locator('.poker-seat-name')).toHaveCount(2);
  // The wide-screen sidebar repeats the names (hidden on a phone), so look at the table itself.
  const table = page.getByTestId('poker-table-frame');
  await expect(table.getByText('Бот Лаки', { exact: true })).toBeVisible();
  await expect(table.getByText('Бот Блеф', { exact: true })).toBeVisible();
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

test('poker chat: an emote over the sender, the chat button above the actions, the emote board on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html?chat=emote');
  await page.getByRole('button', { name: '+ Создать стол · 1 000 жетонов' }).click();

  await expect(page.getByTestId('poker-emote')).toContainText('Страшно?');
  await expect(page.getByTestId('poker-chat-bubble')).toHaveText('ну давай, давай');
  const button = page.getByTestId('poker-chat-open');
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const seated = await page.screenshot({ path: info.outputPath('poker-chat-emote-390x844.png') });
  await info.attach('poker-chat-emote-390x844.png', { body: seated, contentType: 'image/png' });

  await button.click();
  const sheet = page.getByTestId('poker-chat-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('poker-emote-board').getByRole('button')).toHaveCount(18);
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox.x).toBeGreaterThanOrEqual(0);
  expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(390);
  expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(844);
  const sheetShot = await page.screenshot({ path: info.outputPath('poker-chat-sheet-390x844.png') });
  await info.attach('poker-chat-sheet-390x844.png', { body: sheetShot, contentType: 'image/png' });

  // The on-screen keyboard leaves about half of the phone: the line to write and «Отправить» must stay on screen.
  await page.setViewportSize({ width: 390, height: 440 });
  await page.evaluate(() => document.documentElement.style.setProperty('--tg-viewport-height', '440px'));
  await page.waitForTimeout(200);
  const input = await page.getByLabel('Сообщение за стол').boundingBox();
  const send = await page.getByRole('button', { name: 'Отправить' }).boundingBox();
  expect(input.y).toBeGreaterThanOrEqual(0);
  expect(input.y + input.height).toBeLessThanOrEqual(440);
  expect(send.y + send.height).toBeLessThanOrEqual(440);
  const keyboardShot = await page.screenshot({ path: info.outputPath('poker-chat-keyboard-390x440.png') });
  await info.attach('poker-chat-keyboard-390x440.png', { body: keyboardShot, contentType: 'image/png' });
});

test('poker tournament card: the table of levels and the late entry fit a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html?tournaments=1');
  const entry = page.getByTestId('poker-tournament-late-reg');
  await expect(entry).toBeVisible();
  const entryBox = await entry.boundingBox();
  expect(entryBox.x).toBeGreaterThanOrEqual(0);
  expect(entryBox.x + entryBox.width).toBeLessThanOrEqual(390);
  expect(entryBox.height).toBeGreaterThanOrEqual(44);

  await page.getByText('Уровни и время').click();
  const table = page.getByTestId('poker-tournament-schedule');
  await expect(table).toBeVisible();
  await expect(table).toContainText('10/20');
  await expect(table).toContainText('Поздняя запись закрывается после 6-го уровня');
  const box = await table.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  // No row overflows sideways: every cell stays inside the table's width.
  const overflow = await table.evaluate((element) => [...element.querySelectorAll('li')].filter((row) => row.scrollWidth > row.clientWidth + 1).length);
  expect(overflow).toBe(0);
  await table.scrollIntoViewIfNeeded();
  const shot = await page.screenshot({ path: info.outputPath('poker-tournament-schedule-390x844.png') });
  await info.attach('poker-tournament-schedule-390x844.png', { body: shot, contentType: 'image/png' });
});

test('the organizer form of a poker tournament keeps its live table of levels inside the phone screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/poker-harness.html?tournaments=1');
  await page.getByRole('button', { name: '+ Турнир' }).click();
  const form = page.getByTestId('poker-tournament-form');
  await expect(form).toBeVisible();
  await form.locator('input[name="level"]').fill('8');
  await form.locator('input[name="rebuyLevel"]').fill('7');
  const draft = page.getByTestId('poker-tournament-draft-schedule');
  await expect(draft).toContainText('займут 136 мин');
  await expect(draft).toContainText('до конца 7-го уровня');
  const box = await draft.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const overflow = await draft.evaluate((element) => [...element.querySelectorAll('li')].filter((row) => row.scrollWidth > row.clientWidth + 1).length);
  expect(overflow).toBe(0);
  await draft.scrollIntoViewIfNeeded();
  const shot = await page.screenshot({ path: info.outputPath('poker-tournament-form-390x844.png') });
  await info.attach('poker-tournament-form-390x844.png', { body: shot, contentType: 'image/png' });
});
