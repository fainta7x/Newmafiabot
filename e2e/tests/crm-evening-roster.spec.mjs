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

  test('filters the mounted roster and payments and restores filters after search', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-evening-roster.html');
    await page.evaluate(() => document.fonts.ready);
    const roster = page.getByTestId('evening-active-roster');
    const nav = page.getByRole('navigation', { name: 'Рабочие разделы вечера' });
    await expect(roster).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Организатор вечера' })).not.toBeVisible();
    await expect(roster.getByTestId('evening-active-row-ep-pristan')).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 'roster');
    await attachViewport(page, testInfo, 'crm-active-roster.png');

    await roster.getByRole('button', { name: '1 Ожидаем', exact: true }).click();
    await expect(roster.getByTestId('evening-active-row-ep-bogdan')).toBeVisible();
    await expect(roster.getByTestId('evening-active-row-ep-vid')).toHaveCount(0);
    await roster.getByRole('textbox', { name: 'Найти участника вечера' }).fill('ВИД');
    await expect(roster.getByTestId('evening-active-row-ep-vid')).toBeVisible();
    await attachViewport(page, testInfo, 'crm-active-roster-search.png');
    await roster.getByRole('button', { name: 'Очистить поиск' }).click();
    await expect(roster.getByRole('button', { name: '1 Ожидаем', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await roster.getByRole('button', { name: 'Пришёл', exact: true }).click();
    await expect(roster.getByText('Все участники уже пришли.')).toBeVisible();
    await expect(roster.getByRole('button', { name: '0 Ожидаем', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await nav.getByRole('button', { name: 'Оплата', exact: true }).click();
    const payments = page.getByTestId('evening-payments-panel');
    await expect(payments).toBeVisible();
    await payments.getByRole('button', { name: '2 Не оплатили', exact: true }).click();
    await expect(payments.getByTestId('evening-payment-row-ep-vid')).toHaveCount(0);
    await payments.getByRole('textbox', { name: 'Найти игрока в оплатах' }).fill('Вид');
    await expect(payments.getByTestId('evening-payment-row-ep-vid')).toBeVisible();
    await payments.getByRole('button', { name: 'Очистить поиск' }).click();
    await payments.getByTestId('evening-payment-row-ep-bogdan').getByRole('button', { name: 'Не оплатил', exact: true }).click();
    await expect(payments.getByRole('button', { name: '1 Не оплатили', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(payments.getByTestId('evening-payment-row-ep-bogdan')).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 'payments');
    const heights = await payments.locator('button:visible').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    await attachViewport(page, testInfo, 'crm-payments-filtered.png');
    await payments.getByTestId('evening-payment-row-ep-matroskina').getByRole('button', { name: 'Не оплатил', exact: true }).click();
    await expect(payments.getByText('Все оплаты отмечены.')).toBeVisible();
    await payments.getByRole('button', { name: '3 Все', exact: true }).click();
    await expect(payments.getByTestId('evening-payment-row-ep-vid')).toBeVisible();
  });
});
