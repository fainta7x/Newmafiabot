import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
  test(`player cabinet stays aligned at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 713 });
    await page.goto('/e2e/player-cabinet.html?scenario=live');

    const launcher = page.getByTestId('player-live-launcher');
    await expect(launcher).toBeVisible();
    const launcherBox = await launcher.boundingBox();
    expect(launcherBox).not.toBeNull();
    expect(launcherBox.x).toBeGreaterThanOrEqual(11);
    expect(launcherBox.x + launcherBox.width).toBeLessThanOrEqual(width - 11);
    expect(await launcher.evaluate((element) => getComputedStyle(element).position)).toBe('relative');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('home-live.png'), fullPage: true });

    await launcher.click();
    const dialog = page.getByRole('dialog', { name: 'Игровой вечер' });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath('live-evening.png') });
    await dialog.getByRole('button', { name: '×' }).click();

    for (const destination of ['События', 'Игры', 'Рейтинг', 'Клуб']) {
      await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: destination, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${destination.toLowerCase()}.png`) });
    }

    await page.getByTestId('player-quick-wallet').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('wallet.png') });

    await page.getByTestId('player-quick-profile').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('profile.png') });
  });
}
