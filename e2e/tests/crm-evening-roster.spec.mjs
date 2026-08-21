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

test.describe('Organizer evening roster mobile workflow', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps attendance and payment actions first while secondary tools stay collapsed', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-evening-roster.html');
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('evening-roster-workboard')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Пятничный клубный вечер' })).toBeVisible();
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('2 действия');
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('Явка 1');
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('Оплата 1');

    await expect(page.getByTestId('evening-roster-row-ep-bogdan')).toBeVisible();
    const matroskinaRow = page.getByTestId('evening-roster-row-ep-matroskina');
    await expect(matroskinaRow).toBeVisible();
    await expect(matroskinaRow).toContainText('осталось 400 ₽');
    await expect(page.getByTestId('evening-roster-action-ep-matroskina')).toHaveText('Принять 400 ₽');
    await expect(page.getByTestId('evening-roster-row-ep-pristan')).not.toBeVisible();
    await expect(page.getByTestId('evening-roster-add-player')).toBeVisible();
    await expect(page.getByText('Рассылка и игровая регистрация', { exact: true })).toBeVisible();
    await expect(page.getByText('Telegram-анонс', { exact: true })).not.toBeVisible();

    const filterHeights = await page.locator('[data-testid^="evening-roster-filter-"]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.min(...filterHeights)).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, 'evening roster actions');
    await attachViewport(page, testInfo, 'crm-evening-roster-actions.png');

    const bogdanAction = page.getByTestId('evening-roster-action-ep-bogdan');
    await expect(bogdanAction).toHaveText('Пришёл');
    await bogdanAction.click();
    await expect(page.getByTestId('evening-roster-action-ep-bogdan')).toHaveText('Принять 400 ₽');
    await page.getByTestId('evening-roster-action-ep-bogdan').click();
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('1 действие');
    await expect(page.getByTestId('evening-roster-row-ep-bogdan')).not.toBeVisible();

    await page.getByTestId('evening-roster-filter-all').click();
    await expect(page.getByTestId('evening-roster-row-ep-pristan')).toBeVisible();
    await page.getByTestId('evening-roster-row-ep-pristan').getByRole('button').first().click();
    const sheet = page.getByTestId('evening-roster-player-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Пока думаю');
    await expect(sheet.getByRole('button', { name: 'Пришёл', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Не пришёл', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Открыть профиль игрока', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'evening roster player sheet');
    await attachViewport(page, testInfo, 'crm-evening-roster-player-sheet.png');
  });
});
