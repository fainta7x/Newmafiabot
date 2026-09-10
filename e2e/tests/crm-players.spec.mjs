import { expect, test } from '@playwright/test';

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
};

const attachViewport = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const openPlayer = async (page, searchText, playerText) => {
  const search = page.getByPlaceholder('Ник, имя, телефон или Telegram');
  await search.fill(searchText);
  const button = page.getByTestId('crm-player-list').getByRole('button').filter({ hasText: playerText }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByTestId('crm-player-work-card')).toBeVisible();
};

test.describe('Organizer players mobile workflow', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps one player domain and signs a player up immediately after access change', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-players.html');
    await page.evaluate(() => document.fonts.ready);

    const hub = page.getByRole('navigation', { name: 'Раздел игроков' });
    await expect(hub).toBeVisible();
    await expect(hub.getByRole('button', { name: 'База', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(hub.getByRole('button', { name: 'Рейтинг', exact: true })).toBeVisible();
    await expect(hub.getByRole('button', { name: 'Доступы', exact: true })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Игроки', exact: true })).toBeVisible();
    const search = page.getByPlaceholder('Ник, имя, телефон или Telegram');
    await expect(search).toBeVisible();
    expect(parseFloat(await search.evaluate((element) => getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(36);
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeVisible();
    await expect(page.getByTestId('crm-player-list')).toBeVisible();
    await expect(page.getByRole('button', { name: /Богдан/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Киндер/ })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'players list');
    await attachViewport(page, testInfo, 'crm-players-list.png');

    await page.getByRole('button', { name: /Богдан/ }).click();
    const profile = page.getByTestId('crm-player-work-card');
    await expect(profile).toBeVisible();
    await expect(page.getByTestId('crm-player-next')).toContainText('Пятничный клубный вечер');

    const quickActions = page.getByTestId('crm-player-quick-actions');
    await expect(quickActions.getByText('Связаться', { exact: true })).toBeVisible();
    await expect(quickActions.getByRole('button', { name: 'Задача', exact: true })).toBeVisible();
    await expect(quickActions.getByRole('button', { name: 'Общение', exact: true })).toBeVisible();
    await expect(quickActions.getByRole('button', { name: 'Настройки', exact: true })).toBeVisible();
    await expect(quickActions.getByRole('button', { name: 'Ещё', exact: true })).toHaveCount(0);

    const access = page.getByTestId('crm-player-access-summary');
    await expect(access).toContainText('Игровой статус и полномочия');
    await expect(access).toContainText('Опытный игрок');
    await expect(access).toContainText('Участник клуба');
    await expect(access).toContainText('Есть доступ');
    await expect(access.getByRole('button', { name: 'Добавить на игровой вечер', exact: true })).toBeVisible();

    const actionHeights = await quickActions.locator('a, button').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.min(...actionHeights)).toBeGreaterThanOrEqual(48);

    const history = page.getByTestId('crm-player-history');
    await expect(history).not.toHaveAttribute('open', '');
    await expect(history.getByText('Подтвердил, что будет в пятницу', { exact: true })).not.toBeVisible();
    await expectNoHorizontalOverflow(page, 'player profile');
    await attachViewport(page, testInfo, 'crm-player-profile.png');

    await quickActions.getByRole('button', { name: 'Настройки', exact: true }).click();
    await expect(page.getByText('Настройки профиля', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактировать данные', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать задачу', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Записать результат общения', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click();

    await search.fill('Киндер');
    await expect(page.getByRole('button', { name: /Киндер/ })).toBeVisible();
    await page.getByRole('button', { name: /Киндер/ }).click();
    const kinderAccess = page.getByTestId('crm-player-access-summary');
    await expect(kinderAccess).toContainText('Новичок');

    await page.getByTestId('crm-player-access-edit').click();
    const accessSheet = page.getByTestId('crm-player-access-sheet');
    await expect(accessSheet).toBeVisible();
    const gameLevelSelect = accessSheet.locator('label').filter({ hasText: 'Игровой уровень' }).locator('select');
    await gameLevelSelect.selectOption('club');
    await expect(page.getByRole('button', { name: 'Сохранить и записать', exact: true })).toBeVisible();
    await attachViewport(page, testInfo, 'crm-player-access-settings.png');
    await page.getByRole('button', { name: 'Сохранить и записать', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Записать на вечер', exact: true })).toBeVisible();
    await expect(page.getByText('Пятничный клубный вечер', { exact: true })).toBeVisible();
    await expect(page.getByText(/Будет добавлен со статусом «Иду»/)).toBeVisible();
    await expectNoHorizontalOverflow(page, 'player signup');
    await attachViewport(page, testInfo, 'crm-player-signup.png');

    await page.getByRole('button', { name: 'Записать и открыть вечер', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.signupPlayer)).toBe('kinder');
    await expect.poll(() => page.evaluate(() => document.body.dataset.signupStatus)).toBe('going');
    await expect.poll(() => page.evaluate(() => document.body.dataset.openEvening)).toBe('evening-friday');

    await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await hub.getByRole('button', { name: 'Рейтинг', exact: true }).click();
    await expect(hub.getByRole('button', { name: 'Рейтинг', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Рейтинговые периоды', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'players rating');
    await attachViewport(page, testInfo, 'crm-players-rating.png');
  });
});

test.describe('CRM-PLAYER-UX-001 visual evidence', () => {
  test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });

  test('captures player card, access editor, authorization confirmation, validation error and constrained keyboard view', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-players.html');
    await page.evaluate(() => document.fonts.ready);

    await openPlayer(page, 'Киндер', 'Киндер');
    await expectNoHorizontalOverflow(page, '360 player card');
    await attachViewport(page, testInfo, 'crm-player-card-360x800.png');

    await page.getByTestId('crm-player-access-edit').click();
    const accessSheet = page.getByTestId('crm-player-access-sheet');
    await expect(accessSheet).toBeVisible();
    await expect(accessSheet.getByText('Игровой уровень', { exact: true })).toBeVisible();
    await expect(accessSheet.getByText('Статус в клубе', { exact: true })).toBeVisible();
    await expect(accessSheet.getByText('Полномочия ведущего', { exact: true })).toBeVisible();
    await expect(accessSheet.getByText('Доступ к CRM организатора', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, '360 access editor');
    await attachViewport(page, testInfo, 'crm-player-access-editor-360x800.png');

    await page.getByRole('button', { name: 'Выдать доступ к CRM', exact: true }).click();
    await expect(page.getByText('Выдать доступ к CRM организатора?', { exact: true })).toBeVisible();
    await attachViewport(page, testInfo, 'crm-player-crm-authorization-confirmation-360x800.png');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();

    await page.evaluate(() => { document.body.dataset.failNextPlayerPatch = '1'; });
    const gameLevel = accessSheet.locator('label').filter({ hasText: 'Игровой уровень' }).locator('select');
    await gameLevel.selectOption('tournament');
    await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await expect(page.getByTestId('crm-player-access-error')).toContainText('Тестовая ошибка валидации');
    await expect(gameLevel).toHaveValue('tournament');
    await attachViewport(page, testInfo, 'crm-player-validation-error-360x800.png');

    await page.setViewportSize({ width: 360, height: 520 });
    await expect(page.getByRole('button', { name: 'Сохранить изменения', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'keyboard constrained editor');
    await attachViewport(page, testInfo, 'crm-player-telegram-keyboard-constrained-360.png');
  });

  test('keeps long identity text usable and has no horizontal overflow at supported mobile widths', async ({ page }, testInfo) => {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/e2e/crm-players.html');
      await page.evaluate(() => document.fonts.ready);
      await openPlayer(page, 'Очень длинный', 'Очень длинный никнейм');
      await expectNoHorizontalOverflow(page, `${width} long player card`);
      await page.getByTestId('crm-player-access-edit').click();
      await expect(page.getByTestId('crm-player-access-sheet')).toBeVisible();
      await expectNoHorizontalOverflow(page, `${width} long access editor`);
      if (width === 360) await attachViewport(page, testInfo, 'crm-player-long-nickname-360x800.png');
    }
  });
});
