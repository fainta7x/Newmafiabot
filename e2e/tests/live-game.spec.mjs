import { expect, test } from '@playwright/test';

const ROLE_SEQUENCE = [
  'Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный',
  'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный',
];

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    shell: document.querySelector('.evening-live-engine-shell')?.scrollWidth || 0,
    shellClient: document.querySelector('.evening-live-engine-shell')?.clientWidth || 0,
  }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  if (metrics.shellClient > 0) {
    expect.soft(metrics.shell, `${label}: Live Game shell overflow`).toBeLessThanOrEqual(metrics.shellClient + 1);
  }
};

const expectHorizontallyInsideViewport = async (page, locator, label) => {
  await expect(locator, `${label}: visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect.soft(box.x, `${label}: left edge`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.x + box.width, `${label}: right edge`).toBeLessThanOrEqual(viewport.width + 1);
};

const attachViewport = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const tableGrid = (page) => page
  .locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]')
  .first();

const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);

const clickOptional = async (locator) => {
  if (await locator.isVisible().catch(() => false)) await locator.click();
};

const prepareGame = async (page, testInfo) => {
  await page.goto('/e2e/live-game.html');
  await expect(page.getByText('Раздача ролей', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'setup');
  await attachViewport(page, testInfo, '01-setup.png');

  await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
  const dealIntro = page.getByText('Подготовьте 10 карт');
  await expect(dealIntro).toBeVisible();
  const dealPanel = dealIntro.locator('xpath=ancestor::section[1]');
  await expectHorizontallyInsideViewport(page, dealPanel, 'role-deal intro');
  await dealPanel.getByRole('button', { name: 'Начать раздачу', exact: true }).click();

  for (const role of ROLE_SEQUENCE) {
    await page.getByRole('button', { name: new RegExp(role) }).click();
  }
  await page.getByRole('button', { name: /Роли зафиксированы/ }).click();

  await expect(page.getByText('Нулевая ночь', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'zero night');

  await page.getByRole('button', { name: /Договорка · 75с/ }).click();
  await page.getByRole('button', { name: /Вызов шерифа · 10с/ }).click();
  await page.getByRole('button', { name: /Посадка · 40с/ }).click();
  await page.getByRole('button', { name: /Разбудить город/ }).click();

  await expect(page.getByText('Круг обсуждения')).toBeVisible();
  await expect(tableGrid(page)).toBeVisible();
  await expectNoHorizontalOverflow(page, 'day discussion');
  await attachViewport(page, testInfo, '02-day-table.png');
};

const startSpeech = async (page, slot) => {
  const start = page.getByRole('button', { name: new RegExp(`Речь #${slot}(?:\\s| ·)`) });
  await expect(start.first()).toBeVisible();
  await start.last().click();
  await expect(page.getByRole('button', { name: new RegExp(`Завершить речь #${slot}`) })).toBeVisible();
};

const finishSpeech = async (page, slot) => {
  await page.getByRole('button', { name: new RegExp(`Завершить речь #${slot}`) }).click();
};

const openPlayerAction = async (page, slot) => {
  await seatCard(page, slot).click();
  const overlay = page.locator('div[class*="z-[112]"]').filter({ hasText: `#${slot} · Игрок ${slot}` }).first();
  await expectHorizontallyInsideViewport(page, overlay.locator(':scope > div').first(), `player action #${slot}`);
  return overlay;
};

const nominate = async (page, slot) => {
  const overlay = await openPlayerAction(page, slot);
  await overlay.getByRole('button', { name: /Выставить/ }).click();
};

const bestMoveOverlay = (page) => page
  .locator('div[class*="z-[120]"]')
  .filter({ hasText: 'Протокол ЛХ' })
  .first();

const fillBestMove = async (page, seats) => {
  const overlay = bestMoveOverlay(page);
  await expect(overlay).toBeVisible();
  await expectHorizontallyInsideViewport(page, overlay.locator(':scope > div').first(), 'best-move protocol');
  for (const seat of seats) {
    await overlay.getByRole('button', { name: String(seat), exact: true }).click();
  }
  await overlay.getByRole('button', { name: 'Подтвердить протокол', exact: true }).click();
};

test.describe('Live Game browser stabilization', () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(90_000);

  test('conducts a zero-round vote and a complete first-night cycle on mobile', async ({ page }, testInfo) => {
    await prepareGame(page, testInfo);

    await startSpeech(page, 1);
    await page.getByRole('button', { name: 'Назад', exact: true }).last().click();
    await expect(page.getByRole('button', { name: /Речь #1(?:\s| ·)/ }).first()).toBeVisible();

    await startSpeech(page, 1);
    await nominate(page, 2);
    await finishSpeech(page, 1);

    await startSpeech(page, 2);
    await nominate(page, 3);
    await finishSpeech(page, 2);

    for (let slot = 3; slot <= 10; slot += 1) {
      await startSpeech(page, slot);
      await finishSpeech(page, slot);
    }

    await expect(page.getByText('Все выступили ✓')).toBeVisible();
    await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
    await expect(page.getByText(/Кто против/)).toBeVisible();
    await expectNoHorizontalOverflow(page, 'voting');
    await attachViewport(page, testInfo, '03-voting.png');

    for (const voter of [1, 2, 3, 4, 5, 6]) {
      await seatCard(page, voter).click();
    }
    await page.getByRole('button', { name: /Следующий/ }).click();
    await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();

    await expect(page.getByText('Игрок #2 покидает стол')).toBeVisible();
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await fillBestMove(page, [1, 4, 8]);

    await expect(page.getByText('Прощальная речь #2')).toBeVisible();
    await page.getByRole('button', { name: 'Завершить прощальные', exact: true }).click();

    await expect(page.getByText('🌙 Ночь 1')).toBeVisible();
    await clickOptional(page.getByRole('button', { name: /Включить музыку ночи/ }));
    await page.getByRole('button', { name: 'Стрельба мафии', exact: true }).click();
    await seatCard(page, 1).click();
    await expect(page.getByTestId('live-game-night-status')).toHaveText('Выстрел: #1');
    await expect(seatCard(page, 1).getByText('Жертва', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
    await seatCard(page, 4).click();
    await expect(page.getByTestId('live-game-night-status')).toHaveText(/Дон проверил #4: Шериф/);
    await expect(seatCard(page, 4).getByText('Дон', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Проверка Шерифа', exact: true }).click();
    await seatCard(page, 6).click();
    await expect(page.getByTestId('live-game-night-status')).toHaveText('Шериф проверил #6: ЧЁРНЫЙ!');
    await expect(seatCard(page, 6).getByText('Шериф', { exact: true })).toBeVisible();
    await attachViewport(page, testInfo, '04-night-checks.png');
    await clickOptional(page.getByRole('button', { name: /Выключить музыку/ }));

    await page.getByRole('button', { name: 'ЛХ первого убитого', exact: true }).click();
    await fillBestMove(page, [2, 6, 8]);
    await expectNoHorizontalOverflow(page, 'night best move');
    await attachViewport(page, testInfo, '05-night-best-move.png');

    await page.getByRole('button', { name: 'Зафиксировать ночь', exact: true }).click();
    await expect(page.getByText('Прощальная речь #1')).toBeVisible();
    await page.getByRole('button', { name: /Протокол убитого · 15с/ }).click();

    const deathProtocol = page.getByText('Протокол убитого', { exact: true }).locator('xpath=ancestor::div[contains(@class,"max-w-2xl")][1]');
    await expectHorizontallyInsideViewport(page, deathProtocol, 'death protocol');
    await attachViewport(page, testInfo, '06-death-protocol.png');
    await page.getByRole('button', { name: 'Сохранить → день', exact: true }).click();

    await expect(page.getByText('☀️ День 2')).toBeVisible();
    await expect(page.getByRole('button', { name: /Речь #3/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, 'day 2');
    await attachViewport(page, testInfo, '07-day-2.png');
  });

  test('PPK confirmation ends the sandbox game and reaches the save boundary', async ({ page }, testInfo) => {
    await prepareGame(page, testInfo);
    await startSpeech(page, 1);

    const action = await openPlayerAction(page, 6);
    await attachViewport(page, testInfo, '08-player-action.png');
    const ppkButton = action.getByRole('button', { name: 'ППК', exact: true });
    await expect(ppkButton).toBeVisible();
    await ppkButton.click();

    const confirmation = page.locator('div[class*="z-[126]"]').filter({ hasText: 'Зафиксировать ППК' }).first();
    await expectHorizontallyInsideViewport(page, confirmation.locator(':scope > div').first(), 'PPK confirmation');
    await attachViewport(page, testInfo, '09-ppk-confirmation.png');
    await confirmation.getByRole('button', { name: 'Подтвердить ППК', exact: true }).click();

    await expect(page.getByTestId('e2e-live-game-result')).toHaveText('E2E LIVE GAME COMPLETED');
    await expectNoHorizontalOverflow(page, 'completed sandbox');
  });
});
