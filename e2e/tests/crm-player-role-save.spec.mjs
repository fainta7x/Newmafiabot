import { expect, test } from '@playwright/test';

const shot = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const noOverflow = async (page) => {
  const widths = await page.evaluate(() => ({ viewport: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.doc).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
};

const openKinder = async (page) => {
  await page.goto('/e2e/crm-players.html');
  await page.evaluate(() => document.fonts.ready);
  const search = page.getByPlaceholder('Ник, имя, телефон или Telegram');
  await search.fill('Киндер');
  const row = page.getByTestId('crm-active-player-list').getByRole('button').filter({ hasText: 'Киндер' }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('crm-player-work-card')).toBeVisible();
};

test.describe('CRM player classification persistence', () => {
  test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });

  test('saves game, club and judge roles, refetches them and keeps the player card open', async ({ page }, testInfo) => {
    await openKinder(page);
    await noOverflow(page);
    await shot(page, testInfo, 'crm-player-card-360x800.png');

    const summary = page.getByTestId('crm-player-access-summary');
    await expect(summary).toContainText('Новичок');
    await page.getByTestId('crm-player-access-edit').click();

    const sheet = page.getByTestId('crm-player-access-sheet');
    await expect(sheet).toBeVisible();
    const selects = sheet.getByRole('combobox');
    await expect(selects).toHaveCount(3);
    await selects.nth(0).selectOption('club');
    await selects.nth(1).selectOption('team');
    await selects.nth(2).selectOption('host');
    await noOverflow(page);
    await shot(page, testInfo, 'crm-player-access-editor-360x800.png');

    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

    await expect(sheet).not.toBeVisible();
    await expect(page.getByTestId('crm-player-work-card')).toBeVisible();
    await expect(page.getByTestId('crm-active-player-list')).not.toBeVisible();
    await expect(summary).toContainText('Опытный игрок');
    await expect(summary).toContainText('Команда клуба');
    await expect(summary).toContainText('Ведущий');
    await expect(page.getByTestId('crm-player-access-success')).toContainText('подтверждены повторным чтением');
    await shot(page, testInfo, 'crm-player-role-save-persisted-360x800.png');

    await page.getByTestId('crm-player-access-edit').click();
    const reopened = page.getByTestId('crm-player-access-sheet');
    const persisted = reopened.getByRole('combobox');
    await expect(persisted.nth(0)).toHaveValue('club');
    await expect(persisted.nth(1)).toHaveValue('team');
    await expect(persisted.nth(2)).toHaveValue('host');
  });

  test('keeps the editor open with selected values after a server error and shows CRM confirmation', async ({ page }, testInfo) => {
    await openKinder(page);
    await page.getByTestId('crm-player-access-edit').click();
    const sheet = page.getByTestId('crm-player-access-sheet');

    await page.getByRole('button', { name: 'Выдать доступ к CRM', exact: true }).click();
    await expect(page.getByText('Выдать доступ к CRM организатора?', { exact: true })).toBeVisible();
    await shot(page, testInfo, 'crm-player-crm-authorization-confirmation-360x800.png');
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();

    await page.evaluate(() => { document.body.dataset.failNextPlayerPatch = '1'; });
    const gameLevel = sheet.getByRole('combobox').nth(0);
    await gameLevel.selectOption('tournament');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByTestId('crm-player-access-error')).toContainText('Тестовая ошибка валидации');
    await expect(sheet).toBeVisible();
    await expect(gameLevel).toHaveValue('tournament');
    await shot(page, testInfo, 'crm-player-validation-error-360x800.png');

    await page.setViewportSize({ width: 360, height: 520 });
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
    await noOverflow(page);
    await shot(page, testInfo, 'crm-player-telegram-keyboard-constrained-360.png');
  });

  test('handles long player text without horizontal overflow at supported mobile widths', async ({ page }, testInfo) => {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/e2e/crm-players.html');
      await page.evaluate(() => document.fonts.ready);
      const search = page.getByPlaceholder('Ник, имя, телефон или Telegram');
      await search.fill('Очень длинный');
      const row = page.getByTestId('crm-active-player-list').getByRole('button').filter({ hasText: 'Очень длинный никнейм' }).first();
      await expect(row).toBeVisible();
      await row.click();
      await expect(page.getByTestId('crm-player-work-card')).toBeVisible();
      await noOverflow(page);
      await page.getByTestId('crm-player-access-edit').click();
      await expect(page.getByTestId('crm-player-access-sheet')).toBeVisible();
      await noOverflow(page);
      if (width === 360) await shot(page, testInfo, 'crm-player-long-nickname-360x800.png');
    }
  });
});
