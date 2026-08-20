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

test.describe('Organizer evening closeout', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.4 });

  test('keeps attendance, walk-ins, money and missing game stats quick on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-closeout.html');
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByText('Быстрая сверка перед завершением')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Все были' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Остальных не было' })).toBeVisible();
    await expect(page.getByText('Богдан')).toBeVisible();
    await expect(page.getByText('Матроскина')).toBeVisible();
    await expect(page.getByText('Гость без записи')).toBeVisible();
    await expect(page.getByText(/Черновиков игр: 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть вечер' })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await attachFullPage(page, testInfo, 'crm-evening-closeout-pending.png');

    await page.getByRole('button', { name: 'Остальных не было' }).click();
    await expect(page.getByText('Все ожидаемые игроки сверены.')).toBeVisible();
    await page.getByRole('button', { name: 'Пришёл без записи' }).click();
    await expect(page.getByPlaceholder('Найти игрока')).toBeVisible();
    await expect(page.getByText('Чагин')).toBeVisible();
    await page.getByText('Закрыть без полной игровой статистики.').click();
    await expect(page.getByRole('button', { name: 'Закрыть вечер' })).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await attachFullPage(page, testInfo, 'crm-evening-closeout-ready.png');
  });
});
