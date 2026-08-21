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

test.describe('Organizer players mobile workflow', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps player work action-first and secondary history collapsed', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-players.html');
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { name: 'Игроки', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Ник, имя, телефон или Telegram')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeVisible();
    await expect(page.getByTestId('crm-player-list')).toBeVisible();
    await expect(page.getByRole('button', { name: /Богдан/ })).toBeVisible();
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
    await expect(quickActions.getByRole('button', { name: 'Ещё', exact: true })).toBeVisible();

    const actionHeights = await quickActions.locator('a, button').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.min(...actionHeights)).toBeGreaterThanOrEqual(48);

    const history = page.getByTestId('crm-player-history');
    await expect(history).not.toHaveAttribute('open', '');
    await expect(history.getByText('Подтвердил, что будет в пятницу', { exact: true })).not.toBeVisible();
    await expectNoHorizontalOverflow(page, 'player profile');
    await attachViewport(page, testInfo, 'crm-player-profile.png');

    await history.locator('summary').click();
    await expect(history.getByText('Подтвердил, что будет в пятницу', { exact: true })).toBeVisible();
  });
});
