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

test.describe('Organizer evening operations on mobile', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('opens one focused operation at a time and keeps immediate actions first', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-evening-roster.html');
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { name: 'Сейчас' })).toBeVisible();
    await expect(page.getByTestId('evening-roster-workboard')).toBeVisible();
    await expect(page.getByRole('button', { name: /Состав/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Задачи/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Столы/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Закрыть/ })).toBeVisible();

    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('2 действия');
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('Явка 1');
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('Оплата 1');
    await expect(page.getByTestId('evening-roster-row-ep-bogdan')).toBeVisible();

    const matroskinaRow = page.getByTestId('evening-roster-row-ep-matroskina');
    await expect(matroskinaRow).toContainText('Здесь');
    await expect(page.getByTestId('evening-roster-action-ep-matroskina')).toHaveText('Принять 400 ₽');

    await expect(page.getByText('Задачи вечера', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Столы вечера', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Быстрая сверка перед завершением', { exact: true })).not.toBeVisible();
    await expectNoHorizontalOverflow(page, 'evening operations now');
    await attachViewport(page, testInfo, 'crm-evening-operations-now.png');

    await matroskinaRow.getByRole('button').first().click();
    const matroskinaSheet = page.getByTestId('evening-roster-player-sheet');
    await expect(matroskinaSheet).toContainText('Здесь · осталось 400 ₽');
    await expect(matroskinaSheet).toContainText('Ответ: Приду позже');
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();

    await page.getByRole('button', { name: /Состав/ }).click();
    await expect(page.getByRole('heading', { name: 'Состав' })).toBeVisible();
    await expect(page.getByTestId('evening-roster-workboard')).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Добавить на вечер/ })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'evening operations roster');
    await attachViewport(page, testInfo, 'crm-evening-operations-roster.png');

    await page.getByRole('button', { name: /Сейчас/ }).click();
    const bogdanAction = page.getByTestId('evening-roster-action-ep-bogdan');
    await bogdanAction.click();
    await expect(page.getByTestId('evening-roster-row-ep-bogdan')).toContainText('Здесь');
    await expect(page.getByTestId('evening-roster-action-ep-bogdan')).toHaveText('Принять 400 ₽');
    await page.getByTestId('evening-roster-action-ep-bogdan').click();
    await expect(page.getByTestId('evening-roster-action-summary')).toContainText('1 действие');
  });
});
