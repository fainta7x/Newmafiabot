import { expect, test } from '@playwright/test';

const box = async (locator) => {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value;
};

test.describe('Player active-evening status', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps the useful live status in page flow without covering the cabinet', async ({ page }, testInfo) => {
    await page.goto('/e2e/player-shell.html');
    await page.evaluate(async () => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '713px');
      await document.fonts.ready;
    });

    const topBar = page.getByTestId('player-top-bar');
    const slot = page.getByTestId('player-live-status-slot');
    const launcher = slot.locator(':scope > button').first();
    const pageTitle = page.getByRole('heading', { name: 'Главная', exact: true });
    const bottomNav = page.getByTestId('player-bottom-nav');

    await expect(launcher).toBeVisible();
    await expect(launcher).toContainText('Live');
    await expect(launcher).toContainText('Игровой вечер — 21 августа');

    const positioning = await launcher.evaluate((element) => {
      const style = getComputedStyle(element);
      return { position: style.position, zIndex: style.zIndex, transform: style.transform };
    });
    expect(positioning.position).toBe('relative');
    expect(positioning.transform).toBe('none');

    const top = await box(topBar);
    const live = await box(launcher);
    const title = await box(pageTitle);
    const bottom = await box(bottomNav);

    expect.soft(live.y).toBeGreaterThanOrEqual(top.y + top.height - 1);
    expect.soft(live.y + live.height).toBeLessThanOrEqual(title.y + 1);
    expect.soft(live.y + live.height).toBeLessThan(bottom.y);

    const path = testInfo.outputPath('player-active-evening-inline.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('player-active-evening-inline.png', { path, contentType: 'image/png' });
  });
});
