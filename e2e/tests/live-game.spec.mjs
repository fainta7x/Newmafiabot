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
const centerPanel = (page) => page.getByTestId('live-judge-hud');

const expectHudLocked = async (page, label) => {
  const metrics = await page.evaluate(() => {
    const hud = document.querySelector('[data-testid="live-judge-hud"]');
    const hudBody = hud?.querySelector('.live-judge-hud__body');
    const shell = document.querySelector('.evening-live-engine-shell');
    return {
      hudClient: hud?.clientHeight || 0,
      hudScroll: hud?.scrollHeight || 0,
      bodyClient: hudBody?.clientHeight || 0,
      bodyScroll: hudBody?.scrollHeight || 0,
      shellClient: shell?.clientHeight || 0,
      shellScroll: shell?.scrollHeight || 0,
      shellTop: shell?.scrollTop || 0,
    };
  });

  expect.soft(metrics.hudScroll, `${label}: HUD must fit`).toBeLessThanOrEqual(metrics.hudClient + 1);
  expect.soft(metrics.bodyScroll, `${label}: HUD body must fit`).toBeLessThanOrEqual(metrics.bodyClient + 1);
  expect.soft(metrics.shellScroll, `${label}: board shell must not scroll`).toBeLessThanOrEqual(metrics.shellClient + 1);
  expect.soft(metrics.shellTop, `${label}: board shell must stay at top`).toBeLessThanOrEqual(1);
};

const expectNightMarkerIcon = async (page, slot, modifier) => {
  const marker = seatCard(page, slot).locator(`.live-seat-night-marker--${modifier}`);
  const icon = marker.locator('svg');
  await expect(marker).toBeVisible();
  await expect(icon).toBeVisible();
  const iconBox = await icon.boundingBox();
  expect(iconBox, `${modifier} icon box`).not.toBeNull();
  expect.soft(iconBox.width, `${modifier} icon width`).toBeGreaterThanOrEqual(12);
  expect.soft(iconBox.height, `${modifier} icon height`).toBeGreaterThanOrEqual(12);
  const quickbarDisplay = await marker.locator('..').evaluate((node) => getComputedStyle(node).display);
  expect.soft(quickbarDisplay, `${modifier} quickbar layout`).toBe('flex');
};

const clickOptional = async (locator) => {
  if (await locator.isVisible().catch(() => false)) await locator.click();
};

const expectCanonicalJudgeBaseline = async (page) => {
  const hud = centerPanel(page);
  await expect(hud).toBeVisible();
  await expect(hud.getByText('Нулевой круг', { exact: true }).first()).toBeVisible();
  await expect(hud).not.toContainText('Круг обсуждения');
  await expect(hud).not.toContainText('спорн');

  expect(await tableGrid(page).locator('svg.lucide-crosshair').count()).toBe(0);
  await expect(seatCard(page, 1).getByRole('button', { name: 'Выставить #1', exact: true })).toBeVisible();

  const seatColors = await page.evaluate(() => {
    const getColor = (seat) => {
      const node = document.querySelector(`.live-seat-number[data-seat="${seat}"]`);
      return node ? getComputedStyle(node).backgroundColor : '';
    };
    return { five: getColor(5), six: getColor(6) };
  });
  expect(seatColors.five).toBeTruthy();
  expect(seatColors.six).toBeTruthy();
  expect(seatColors.five).not.toBe(seatColors.six);
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

  const zeroNightMusicStart = page.getByRole('button', { name: /Включить музыку ночи/ });
  await expect(zeroNightMusicStart).toBeVisible();
  await zeroNightMusicStart.click();
  await page.getByRole('button', { name: /Договорка · 75с/ }).click();
  await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
  await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
  const zeroNightMusicStop = page.getByRole('button', { name: /Выключить музыку/ });
  await expect(zeroNightMusicStop).toBeVisible();
  await zeroNightMusicStop.click();
  await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();

  await expect(tableGrid(page)).toBeVisible();
  await expectCanonicalJudgeBaseline(page);
  await expectNoHorizontalOverflow(page, 'zero round');
  await expectHudLocked(page, 'zero round');
  await attachViewport(page, testInfo, '02-zero-round-table.png');
};

const startSpeech = async (page, slot) => {
  const start = page.getByRole('button', { name: new RegExp(`Речь #${slot}(?:\\s| ·|$)`) });
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
  await overlay.getByRole('button', { name: 'Выставить', exact: true }).click();
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

const nominateTwoPlayersAndFinishDay = async (page) => {
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
  await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
};

const castFiveFiveVote = async (page) => {
  for (const voter of [1, 2, 3, 4, 5]) await seatCard(page, voter).click();
  await page.getByRole('button', { name: /Следующий/ }).click();
  await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();
};

test.describe('Live Game browser stabilization', () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(90_000);

  test('conducts a zero-round vote and a complete first-night cycle on mobile', async ({ page }, testInfo) => {
    await prepareGame(page, testInfo);

    await startSpeech(page, 1);
    await expectHudLocked(page, 'speech timer');
    await page.getByRole('button', { name: 'Назад', exact: true }).last().click();
    await expect(page.getByRole('button', { name: /Речь #1(?:\s| ·|$)/ }).first()).toBeVisible();

    await startSpeech(page, 1);
    await expect(seatCard(page, 1).locator('.live-seat-quickbar__group')).toBeVisible();
    const playerAction = await openPlayerAction(page, 1);
    await playerAction.getByRole('button', { name: '+ Обычный фол', exact: true }).click();
    await expect(seatCard(page, 1).locator('.evening-live-discipline-foul')).toHaveAttribute('data-count', '1');
    await attachViewport(page, testInfo, '03-card-actions-clean.png');

    await nominate(page, 2);
    await finishSpeech(page, 1);

    await startSpeech(page, 2);
    await nominate(page, 3);
    await finishSpeech(page, 2);

    for (let slot = 3; slot <= 10; slot += 1) {
      await startSpeech(page, slot);
      await finishSpeech(page, slot);
    }

    await expect(centerPanel(page).getByText('Все речи завершены', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
    const votingHud = centerPanel(page);
    await expect(votingHud.getByText(/Кто против/)).toBeVisible();
    await expect(votingHud.getByRole('button', { name: '+1' })).toHaveCount(0);
    await expect(votingHud.getByRole('button', { name: '−1' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 'voting');
    await expectHudLocked(page, 'voting');

    for (const voter of [1, 2, 3, 4, 5, 6]) {
      await seatCard(page, voter).click();
    }
    await expect(votingHud.locator('.live-judge-stat__value').first()).toHaveText('6');
    await expect(votingHud.locator('.live-judge-stat__value').nth(1)).toHaveText('4/10');
    await expect(seatCard(page, 1).getByText('→ #2', { exact: true })).toBeVisible();
    await attachViewport(page, testInfo, '04-voting-card-selection.png');

    await page.getByRole('button', { name: /Следующий/ }).click();
    await expect(seatCard(page, 7).getByText(/Авто/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();

    await expect(centerPanel(page).getByText(/Заголосован/)).toBeVisible();
    await expect(centerPanel(page)).toContainText('#2');
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await fillBestMove(page, [1, 4, 8]);

    await expect(centerPanel(page).getByText('Последняя речь #2', { exact: true })).toBeVisible();
    const farewellAction = await openPlayerAction(page, 2);
    await expect(farewellAction.getByRole('button', { name: '+ Обычный фол', exact: true })).toBeVisible();
    await expect(farewellAction.getByRole('button', { name: 'Выставить', exact: true })).toHaveCount(0);
    await farewellAction.getByRole('button', { name: '×', exact: true }).click();
    await page.getByRole('button', { name: 'Завершить последние речи', exact: true }).click();

    await expect(centerPanel(page).getByText('Ночь 1', { exact: true })).toBeVisible();
    const eliminatedIdentity = page.locator('.evening-live-identity[data-seat="2"][data-alive="false"]');
    const eliminatedAvatar = eliminatedIdentity.locator('.evening-live-player-avatar');
    await expect(eliminatedAvatar).toBeVisible();
    await expect(eliminatedIdentity.locator('.evening-live-identity-name')).toHaveCount(0);
    const eliminatedAvatarOpacity = await eliminatedAvatar.evaluate((node) => Number(getComputedStyle(node).opacity));
    expect.soft(eliminatedAvatarOpacity, 'eliminated avatar remains secondary').toBeGreaterThanOrEqual(0.25);
    expect.soft(eliminatedAvatarOpacity, 'eliminated avatar must not compete with status').toBeLessThanOrEqual(0.5);
    await clickOptional(page.getByRole('button', { name: /Включить музыку ночи/ }));
    await page.getByRole('button', { name: 'Отстрел', exact: true }).click();
    await seatCard(page, 1).click();
    await expect(page.getByTestId('live-game-night-status')).toHaveText('Отстрел: #1');
    await expect(seatCard(page, 1).getByText('Отстрел', { exact: true })).toBeVisible();
    await expectNightMarkerIcon(page, 1, 'shot');

    await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
    await seatCard(page, 4).click();
    await expect(page.getByTestId('live-game-night-status')).toHaveText('Дон · #4: Шериф');
    await expect(seatCard(page, 4).getByText('Дон', { exact: true })).toBeVisible();
    await expectNightMarkerIcon(page, 4, 'don');

    await page.getByRole('button', { name: 'Проверка Шерифа', exact: true }).click();
    await seatCard(page, 6).click();
    await expect(page.getByTestId('live-game-night-status')).toHaveText('Шериф · #6: ЧЁРНЫЙ!');
    await expect(seatCard(page, 6).getByText('Шериф', { exact: true })).toBeVisible();
    await expectNightMarkerIcon(page, 6, 'sheriff');
    await attachViewport(page, testInfo, '05-night-checks.png');
    await clickOptional(page.getByRole('button', { name: /Выключить музыку/ }));

    await page.getByRole('button', { name: 'ЛХ первого убитого', exact: true }).click();
    await fillBestMove(page, [2, 6, 8]);
    await expectNoHorizontalOverflow(page, 'night best move');
    await attachViewport(page, testInfo, '06-night-best-move.png');

    await page.getByRole('button', { name: 'Зафиксировать ночь', exact: true }).click();
    await expect(centerPanel(page).getByText('Последняя речь #1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Протокол убитого · 15с/ }).click();

    const deathProtocol = page.getByText('Протокол убитого', { exact: true }).locator('xpath=ancestor::div[contains(@class,"max-w-2xl")][1]');
    await expectHorizontallyInsideViewport(page, deathProtocol, 'death protocol');
    await attachViewport(page, testInfo, '07-death-protocol.png');
    await page.getByRole('button', { name: 'Сохранить → день', exact: true }).click();

    await expect(centerPanel(page).getByText('День 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Речь #3/ }).first()).toBeVisible();
    await expect(eliminatedAvatar).toBeVisible();
    await expectNoHorizontalOverflow(page, 'day 1');
    await attachViewport(page, testInfo, '08-day-1.png');
  });

  test('PPK confirmation ends the sandbox game and reaches the save boundary', async ({ page }, testInfo) => {
    await prepareGame(page, testInfo);
    await startSpeech(page, 1);

    const action = await openPlayerAction(page, 6);
    await expect(action.getByText('Фолы', { exact: true })).toBeVisible();
    await expect(action.getByText('Малый тех', { exact: true })).toBeVisible();
    await expect(action.getByText('Большой тех', { exact: true })).toBeVisible();
    await attachViewport(page, testInfo, '09-player-action.png');
    const ppkButton = action.getByRole('button', { name: 'ППК', exact: true });
    await expect(ppkButton).toBeVisible();
    await ppkButton.click();

    const confirmation = page.locator('div[class*="z-[126]"]').filter({ hasText: 'Зафиксировать ППК' }).first();
    await expectHorizontallyInsideViewport(page, confirmation.locator(':scope > div').first(), 'PPK confirmation');
    await attachViewport(page, testInfo, '10-ppk-confirmation.png');
    await confirmation.getByRole('button', { name: 'Подтвердить ППК', exact: true }).click();

    await expect(page.getByTestId('e2e-live-game-result')).toHaveText('E2E LIVE GAME COMPLETED');
    await expectNoHorizontalOverflow(page, 'completed sandbox');
  });

  test('applies speech penalties, confirms removals and cancels the next voting', async ({ page }, testInfo) => {
    await prepareGame(page, testInfo);

    for (let index = 0; index < 3; index += 1) {
      const action = await openPlayerAction(page, 1);
      await action.getByRole('button', { name: /Обычный фол/ }).click();
    }

    await startSpeech(page, 1);
    await expect(centerPanel(page).getByText('30с', { exact: true })).toBeVisible();
    await finishSpeech(page, 1);

    const fourthFoulAction = await openPlayerAction(page, 1);
    await fourthFoulAction.getByRole('button', { name: /Обычный фол/ }).click();
    const fourthFoulConfirm = page.locator('div[class*="z-[126]"]').filter({ hasText: 'Удаление по 4-му фолу' }).first();
    await expect(fourthFoulConfirm).toBeVisible();
    await attachViewport(page, testInfo, '11-fourth-foul-confirmation.png');
    await fourthFoulConfirm.getByRole('button', { name: 'Подтвердить 4-й фол', exact: true }).click();

    const removedOne = await openPlayerAction(page, 1);
    await expect(removedOne.getByRole('button', { name: 'Вернуть за стол', exact: true })).toBeVisible();
    await removedOne.getByRole('button', { name: '×', exact: true }).click();

    let techAction = await openPlayerAction(page, 2);
    await techAction.getByRole('button', { name: /Малый тех/ }).click();
    techAction = await openPlayerAction(page, 2);
    await expect(techAction.getByText(/Малый тех: 1/)).toBeVisible();
    await techAction.getByRole('button', { name: /Малый тех/ }).click();
    const techConfirm = page.locator('div[class*="z-[126]"]').filter({ hasText: 'Удаление по второму техфолу' }).first();
    await expect(techConfirm).toBeVisible();
    await techConfirm.getByRole('button', { name: 'Подтвердить техфол', exact: true }).click();

    const removedTwo = await openPlayerAction(page, 2);
    await expect(removedTwo.getByRole('button', { name: 'Вернуть за стол', exact: true })).toBeVisible();
    await removedTwo.getByRole('button', { name: '×', exact: true }).click();

    for (let slot = 3; slot <= 10; slot += 1) {
      await startSpeech(page, slot);
      await finishSpeech(page, slot);
    }

    await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
    await expect(page.getByText('Ближайшее голосование отменено из-за удаления', { exact: true })).toBeVisible();
    await expect(centerPanel(page).getByText('Ночь 1', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'discipline cancellation night');
    await attachViewport(page, testInfo, '12-discipline-voting-cancelled.png');
  });

  test('walks a repeated tie through revote speeches and the table decision', async ({ page }, testInfo) => {
    await prepareGame(page, testInfo);
    await nominateTwoPlayersAndFinishDay(page);
    await castFiveFiveVote(page);

    await expect(centerPanel(page).getByText('Переголосование', { exact: true })).toBeVisible();
    await expect(centerPanel(page)).toContainText('#2 · #3');
    await page.getByRole('button', { name: 'Речи по 30 секунд', exact: true }).click();
    await expect(centerPanel(page).getByText(/Речи перед переголосованием · 30 сек/)).toBeVisible();
    await attachViewport(page, testInfo, '13-revote-speeches.png');

    await page.getByRole('button', { name: 'Следующий игрок', exact: true }).click();
    await page.getByRole('button', { name: 'К переголосованию', exact: true }).click();
    await expect(centerPanel(page).getByText(/Кто против/)).toBeVisible();

    await castFiveFiveVote(page);
    const hud = centerPanel(page);
    await expect(hud.getByText(/Поднять \/ оставить/)).toBeVisible();
    await expect(hud.getByText('Поднять всех?', { exact: true })).toBeVisible();
    await expect(hud.locator('.live-judge-table-voter')).toHaveCount(0);
    await expect(hud.getByText(/Нажимайте карточки игроков/)).toBeVisible();
    await expectHudLocked(page, 'raise-leave decision');

    for (const voter of [1, 2, 3, 4, 5, 6]) {
      await seatCard(page, voter).click();
      await expect(seatCard(page, voter)).toHaveAttribute('data-table-vote-selected', 'true');
    }
    await expect(hud.locator('.live-judge-table-decision-count strong')).toContainText('6/10');
    await expect(hud.getByText('нужно 6', { exact: true })).toBeVisible();
    await expect(seatCard(page, 7)).not.toHaveAttribute('data-table-vote-selected', 'true');
    await expectNoHorizontalOverflow(page, 'raise-leave decision');
    await attachViewport(page, testInfo, '14-table-decision-card-selection.png');
    await page.getByRole('button', { name: 'Зафиксировать решение', exact: true }).click();

    await expect(centerPanel(page).getByText('Последняя речь #2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Последняя речь #3', exact: true }).click();
    await expect(centerPanel(page).getByText('Последняя речь #3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Завершить последние речи', exact: true }).click();
    await expect(centerPanel(page).getByText('Ночь 1', { exact: true })).toBeVisible();
  });

  test('restores a saved Day 1 browser session into a usable next action', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html?mode=recovery');
    await expect(page.getByText(/Найдена незавершённая игра · 18:00/)).toBeVisible();
    await expectNoHorizontalOverflow(page, 'recovery banner');
    await attachViewport(page, testInfo, '15-recovery-banner.png');

    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await expect(centerPanel(page).getByText('День 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Речь #3/ }).first()).toBeVisible();
    await expect(page.getByText('Прерванная игра восстановлена', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'restored Day 1');
    await expectHudLocked(page, 'restored Day 1');
    await attachViewport(page, testInfo, '16-restored-day-1.png');
  });
});
