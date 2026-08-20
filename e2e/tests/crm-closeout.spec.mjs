import { expect, test } from '@playwright/test';

const attachFullPage = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const expectNoHorizontalOverflow = async (page) => {
  const metrics = await page.evaluate(() => ({ viewport: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect.soft(metrics.doc).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
};

const expectCloseoutTouchTargets = async (page, label) => {
  const panel = page.getByTestId('evening-closeout-panel');
  const heights = await panel.locator('button:visible').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height),
  );
  expect(heights.length, `${label}: visible actions`).toBeGreaterThan(0);
  expect(Math.min(...heights), `${label}: smallest action`).toBeGreaterThanOrEqual(44);

  const textInputs = panel.locator('input:visible:not([type="checkbox"])');
  const inputCount = await textInputs.count();
  if (inputCount) {
    const inputHeights = await textInputs.evaluateAll((inputs) =>
      inputs.map((input) => input.getBoundingClientRect().height),
    );
    expect(Math.min(...inputHeights), `${label}: smallest text input`).toBeGreaterThanOrEqual(44);
  }
};

test.describe('Organizer evening closeout', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.4 });

  test('keeps attendance, unexpected arrivals, money and missing game stats quick on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-closeout.html');
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId('evening-closeout-panel')).toBeVisible();
    await expect(page.getByText('Быстрая сверка перед завершением')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Все были' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Остальных не было' })).toBeVisible();
    await expect(page.getByText('Богдан')).toBeVisible();
    await expect(page.getByText('Матроскина')).toBeVisible();
    await expect(page.getByText('Гость без записи', { exact: true })).toBeVisible();
    await expect(page.getByText(/Черновиков игр: 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть вечер' })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await expectCloseoutTouchTargets(page, 'pending closeout');
    await attachFullPage(page, testInfo, 'crm-evening-closeout-pending.png');

    const markPaid = page.getByRole('button', { name: 'Отметить оплату Пристань' });
    await expect(markPaid).toBeVisible();
    await markPaid.click();
    await expect(page.getByRole('button', { name: 'Снять оплату Пристань' })).toBeVisible();
    await expect(page.getByText('Оплачено 400 ₽', { exact: true })).toBeVisible();
    await expect(page.getByText('долгов сейчас 1')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectCloseoutTouchTargets(page, 'paid closeout');
    await attachFullPage(page, testInfo, 'crm-evening-closeout-paid-undo.png');

    await page.getByRole('button', { name: 'Снять оплату Пристань' }).click();
    const restoredMarkPaid = page.getByRole('button', { name: 'Отметить оплату Пристань' });
    await expect(restoredMarkPaid).toBeVisible();
    await expect(restoredMarkPaid.locator('..').getByText('осталось 400 ₽', { exact: true })).toBeVisible();
    await expect(page.getByText('долгов сейчас 2')).toBeVisible();

    await page.getByRole('button', { name: 'Остальных не было' }).click();
    await expect(page.getByText('Все ожидаемые игроки сверены.')).toBeVisible();

    await page.getByRole('button', { name: /Пришёл без записи/ }).click();
    const search = page.getByPlaceholder('Найти любого игрока');
    await expect(search).toBeVisible();
    await search.fill('Вид');
    await expect(page.getByRole('button', { name: /Вид.*Был/ })).toBeVisible();
    await expectCloseoutTouchTargets(page, 'walk-in closeout');
    await page.getByRole('button', { name: /Вид.*Был/ }).click();
    await expect(page.getByText(/Без предварительного «Иду»:.*Вид/)).toBeVisible();

    await page.getByPlaceholder('Найти любого игрока').fill('Чагин');
    await expect(page.getByText('Чагин')).toBeVisible();
    await expect(page.getByRole('button', { name: '400' })).toBeVisible();
    await expectCloseoutTouchTargets(page, 'amount closeout');

    await page.getByText('Закрыть без полной игровой статистики.').click();
    await expect(page.getByRole('button', { name: 'Закрыть вечер' })).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await expectCloseoutTouchTargets(page, 'ready closeout');
    await attachFullPage(page, testInfo, 'crm-evening-closeout-ready.png');
  });
});
