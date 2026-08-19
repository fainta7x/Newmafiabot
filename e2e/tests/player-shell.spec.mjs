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

const expectInsideViewport = async (page, locator, label) => {
  await expect(locator, `${label}: visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, `${label}: viewport`).not.toBeNull();
  expect.soft(box.x, `${label}: left`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.x + box.width, `${label}: right`).toBeLessThanOrEqual(viewport.width + 1);
  expect.soft(box.y, `${label}: top`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.y + box.height, `${label}: bottom`).toBeLessThanOrEqual(viewport.height + 1);
};

test.describe('Stage 4 shared player shell', () => {
  test.use({ viewport: { width: 390, height: 620 } });

  test('keeps shared top and bottom chrome usable in a Telegram-sized viewport', async ({ page }, testInfo) => {
    await page.goto('/e2e/player-shell.html');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    });

    const topBar = page.getByTestId('player-top-bar');
    const bottomNav = page.getByTestId('player-bottom-nav');
    await expectInsideViewport(page, topBar, 'top bar');
    await expectInsideViewport(page, bottomNav, 'bottom navigation');
    await expectNoHorizontalOverflow(page, 'shared shell');

    const quickButtons = page.locator('[data-testid^="player-quick-"]');
    expect(await quickButtons.count()).toBe(2);
    const quickHeights = await quickButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    for (const height of quickHeights) expect(height).toBeGreaterThanOrEqual(44);

    const navButtons = bottomNav.locator('button');
    expect(await navButtons.count()).toBe(5);
    const navHeights = await navButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    for (const height of navHeights) expect(height).toBeGreaterThanOrEqual(44);

    await expect(page.getByTestId('player-nav-home')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('player-nav-club').click();
    await expect(page.getByTestId('player-nav-club')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('player-shell-content')).toContainText('Текущий раздел: club');

    await page.getByTestId('player-quick-wallet').click();
    await expect(page.getByTestId('player-quick-wallet')).toHaveAttribute('aria-pressed', 'true');
    await expect(bottomNav.locator('[aria-current="page"]')).toHaveCount(0);

    await page.getByTestId('player-quick-profile').click();
    await expect(page.getByTestId('player-quick-profile')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('player-shell-content')).toContainText('Текущий раздел: profile');

    const path = testInfo.outputPath('stage4-player-shell.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('stage4-player-shell.png', { path, contentType: 'image/png' });
  });
});
