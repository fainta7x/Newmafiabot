import { expect, test } from '@playwright/test';

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
};

const attachViewport = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

for (const width of [360, 390]) {
  test.describe(`Organizer evening operations at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 360 ? 640 : 713 }, deviceScaleFactor: 2.4 });

    test('keeps secondary navigation compact, preserves RSVP truth and prevents list overflow', async ({ page }, testInfo) => {
      await page.goto('/e2e/crm-evening-roster.html');
      await page.evaluate(() => document.fonts.ready);
      const roster = page.getByTestId('evening-active-roster');
      const nav = page.getByRole('navigation', { name: 'Рабочие разделы вечера' });
      await expect(roster).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Организатор вечера' })).not.toBeVisible();
      await expect(roster.getByTestId('evening-active-row-ep-pristan')).toHaveCount(0);
      await expect(nav.getByRole('button', { name: 'Состав', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Оплата', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Ещё', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Задачи', exact: true })).toHaveCount(0);
      await nav.getByRole('button', { name: 'Ещё', exact: true }).click();
      await expect(page.getByTestId('evening-secondary-panes')).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Задачи', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Столы', exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Закрытие', exact: true })).toBeVisible();
      await nav.getByRole('button', { name: 'Состав', exact: true }).click();
      await expectNoHorizontalOverflow(page, 'roster');
      await attachViewport(page, testInfo, `crm-active-roster-${width}.png`);

      await roster.getByRole('button', { name: '1 Ожидаем', exact: true }).click();
      await expect(roster.getByTestId('evening-active-row-ep-bogdan')).toBeVisible();
      await expect(roster.getByTestId('evening-active-row-ep-vid')).toHaveCount(0);
      await roster.getByRole('textbox', { name: 'Найти участника вечера' }).fill('ВИД');
      await expect(roster.getByTestId('evening-active-row-ep-vid')).toBeVisible();
      await roster.getByRole('button', { name: 'Очистить поиск' }).click();
      await expect(roster.getByRole('button', { name: '1 Ожидаем', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await roster.getByRole('button', { name: 'Пришёл', exact: true }).click();
      await expect(roster.getByText('Все участники уже пришли.')).toBeVisible();

      await roster.getByRole('button', { name: 'Добавить игрока на вечер' }).click();
      const sheet = page.getByRole('dialog', { name: 'Добавить на вечер' });
      await expect(sheet).toContainText('не создаёт ответ «Иду»');
      await sheet.getByRole('button', { name: /Ручной Игрок С Очень Длинным Ником/ }).click();
      await sheet.getByRole('button', { name: 'Добавить · 1', exact: true }).click();
      const manualRow = roster.getByTestId('evening-active-row-ep-manual');
      await expect(manualRow).toBeVisible();
      await expect(manualRow).toContainText('В составе');
      await expect(manualRow).toContainText('RSVP: Нет ответа');
      await expect(manualRow).toContainText('Явка: не отмечена');
      const manualBody = await page.evaluate(() => JSON.parse(document.body.dataset.bulkParticipantBody || '{}'));
      expect(manualBody.response_status).toBe('unanswered');
      expect(manualBody.registration_status).toBe('unanswered');
      await attachViewport(page, testInfo, `crm-manual-rsvp-${width}.png`);

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
      await attachViewport(page, testInfo, `crm-payments-filtered-${width}.png`);
      await payments.getByTestId('evening-payment-row-ep-matroskina').getByRole('button', { name: 'Не оплатил', exact: true }).click();
      await expect(payments.getByText('Все оплаты отмечены.')).toBeVisible();
    });
  });
}
