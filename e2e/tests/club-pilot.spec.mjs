import { expect, test } from '@playwright/test';

const attachViewport = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
};

test.describe('Stage 3 club pilot', () => {
  test.use({ viewport: { width: 390, height: 620 } });

  test('keeps the club directory usable in a Telegram-sized viewport', async ({ page }, testInfo) => {
    await page.goto('/e2e/club-pilot.html');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    });

    const directory = page.getByTestId('club-directory');
    await expect(directory).toBeVisible();
    await expect(page.getByText('Чагин', { exact: true })).toBeVisible();
    await expect(page.getByText('Богданчик', { exact: true })).toBeVisible();
    await expect(page.getByText('6', { exact: true }).first()).toBeVisible();

    const clubTabs = page.locator('nav[aria-label="Разделы клуба"] button');
    await expect(clubTabs.nth(0)).toHaveAttribute('aria-current', 'page');
    await expect(clubTabs.nth(1)).not.toHaveAttribute('aria-current', 'page');
    const tabHeights = await clubTabs.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    expect(tabHeights).toHaveLength(3);
    for (const height of tabHeights) expect(height).toBeGreaterThanOrEqual(44);

    const tabBackgrounds = await clubTabs.evaluateAll((buttons) =>
      buttons.map((button) => getComputedStyle(button).backgroundColor),
    );
    expect(tabBackgrounds[0]).not.toBe(tabBackgrounds[1]);
    expect(tabBackgrounds[0]).not.toBe(tabBackgrounds[2]);

    await expectNoHorizontalOverflow(page, 'club list');
    await attachViewport(page, testInfo, 'club-pilot-list.png');

    const search = page.getByTestId('club-search');
    await search.fill('Матро');
    await expect(page.getByText('Матроскина', { exact: true })).toBeVisible();
    await expect(page.getByText('Богданчик', { exact: true })).toHaveCount(0);

    await search.fill('НетТакогоИгрока');
    const emptyState = page.locator('[data-slot="async-state"][data-state-kind="empty"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('Никого не нашли');
    await search.fill('');

    await page.getByTestId('club-player-p2').click();
    const sheet = page.getByTestId('club-player-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Богданчик', { exact: true })).toBeVisible();
    await expect(sheet.getByText('ELO 1688', { exact: true })).toBeVisible();
    await expect(sheet.getByText('84', { exact: true })).toBeVisible();

    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect.soft(sheetBox.x, 'sheet left edge').toBeGreaterThanOrEqual(-1);
    expect.soft(sheetBox.x + sheetBox.width, 'sheet right edge').toBeLessThanOrEqual(391);
    expect.soft(sheetBox.y, 'sheet top edge').toBeGreaterThanOrEqual(-1);
    expect.soft(sheetBox.y + sheetBox.height, 'sheet bottom edge').toBeLessThanOrEqual(621);

    await expectNoHorizontalOverflow(page, 'club player sheet');
    await attachViewport(page, testInfo, 'club-pilot-sheet.png');

    await sheet.getByRole('button', { name: 'Закрыть' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('club-player-p2')).toBeFocused();
  });
});
