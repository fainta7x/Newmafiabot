import { test, expect } from '@playwright/test';

for (const width of [390, 700, 1024, 1440]) {
  test(`CRM and profile workspaces at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/organizer-crm.html');
    await expect(page.getByTestId('crm-today-header')).toBeVisible();
    const main = await page.locator('.crm-premium > main').boundingBox();
    if (width >= 1024) expect(main.width).toBeGreaterThan(900);
    if (width === 700) {
      const nav = await page.locator('.organizer-bottom-nav').boundingBox();
      const padding = await page.locator('.crm-premium > main').evaluate(node => parseFloat(getComputedStyle(node).paddingBottom));
      expect(padding).toBeGreaterThanOrEqual(nav.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`crm-${width}.png`), fullPage: true });
    if (width >= 1024) {
      await page.getByRole('button', { name: 'Ещё', exact: true }).click();
      await expect(page.locator('.crm-more-menu')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`crm-more-${width}.png`), fullPage: true });
      for (const [url, ready] of [['/e2e/crm-players.html', '[data-testid="crm-active-player-list"]'], ['/e2e/crm-evening-roster.html', '.crm-premium main'], ['/e2e/crm-analytics.html', '[data-testid="crm-analytics"]']]) {
        await page.goto(url);
        await expect(page.locator(ready)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${url.split('/').pop().replace('.html', '')}-${width}.png`), fullPage: true });
      }
    }
    if (width >= 1024) {
      await page.goto('/e2e/player-cabinet.html');
      await page.getByTestId('player-nav-progress').click();
      await expect(page.getByTestId('profile-key-stats')).toBeVisible();
      expect((await page.locator('.profile-content').boundingBox()).width).toBeGreaterThan(900);
      await page.screenshot({ path: testInfo.outputPath(`profile-in-cabinet-${width}.png`), fullPage: true });
    }
    await page.goto('/e2e/player-profile.html');
    const profile = page.getByTestId('canonical-premium-profile');
    await expect(profile.getByTestId('profile-key-stats')).toBeVisible();
    const content = await profile.locator('main').boundingBox();
    if (width >= 1024) expect(content.width).toBeGreaterThan(900);
    await page.screenshot({ path: testInfo.outputPath(`profile-overview-${width}.png`), fullPage: true });
    for (const label of ['Игры', 'Роли', 'Elo', 'Награды', 'История клуба', 'Связи']) {
      await profile.getByRole('button', { name: label, exact: true }).click();
      await expect(profile.getByText('Загрузка…', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (label === 'Игры' || label === 'Роли') {
        const list = profile.locator(label === 'Игры' ? '.profile-game-list' : '.profile-role-list');
        const cols = await list.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
        if (width >= 1024) expect(cols).toBe(2);
      }
      await page.screenshot({ path: testInfo.outputPath(`profile-${label}-${width}.png`), fullPage: true });
    }
  });
}
