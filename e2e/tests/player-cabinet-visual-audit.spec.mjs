import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
  test(`player cabinet stays aligned at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 713 });
    await page.goto('/e2e/player-cabinet.html?scenario=live');

    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    const launcher = page.getByTestId('player-live-launcher');
    await expect(page.getByTestId('product-mode-switch-player')).toContainText('CRM');
    await expect(launcher).toBeVisible();
    await expect(page.getByTestId('player-home-learning')).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Главная', exact: true })).toHaveAttribute('aria-current', 'page');
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

    // The menu of four (owner, 2026-10-06): Главная, Вечера, Сообщество, Прогресс.
    for (const destination of ['Вечера', 'Сообщество', 'Прогресс']) {
      const button = nav.getByRole('button', { name: destination, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
      for (const other of ['Главная', 'Вечера', 'Сообщество', 'Прогресс'].filter((item) => item !== destination)) {
        await expect(nav.getByRole('button', { name: other, exact: true })).not.toHaveAttribute('aria-current', 'page');
      }
      await expect(launcher).toContainText('Текущий вечер');
      expect((await launcher.boundingBox()).height).toBeLessThanOrEqual(42);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${destination.toLowerCase()}.png`) });
    }

    await nav.getByRole('button', { name: 'Вечера', exact: true }).click();
    await expect(page.getByLabel('Разделы вечеров').getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Формат:/ })).toBeVisible();
    await expect(page.locator('main').getByText('Ближайшее')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('events-priority.png'), fullPage: true });

    await page.getByLabel('Разделы вечеров').getByRole('button', { name: 'Мои игры', exact: true }).click();
    await expect(nav.getByRole('button', { name: 'Вечера', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('games-simplified.png'), fullPage: true });

    await page.getByTestId('player-quick-wallet').click();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    await expect(page.getByTestId('player-quick-wallet')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('wallet.png') });

    await page.getByTestId('player-quick-settings').click();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    await expect(page.getByTestId('player-quick-settings')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('player-settings')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('settings.png') });

    await nav.getByRole('button', { name: 'Сообщество', exact: true }).click();
    await expect(page.getByLabel('Разделы сообщества').getByRole('button')).toHaveCount(4);
    await expect(page.getByTestId('player-club-poker')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('community.png'), fullPage: true });

    // «Активность» shows one part at a time: Форма · Матчи · Сезон · Архив.
    await page.getByLabel('Разделы сообщества').getByRole('button', { name: 'Активность' }).click();
    const activityNav = page.getByLabel('Разделы активности');
    await expect(activityNav.getByRole('button')).toHaveCount(4);
    await expect(page.getByText('Форма игроков')).toBeVisible();
    await expect(page.getByText('Итоги сезона')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('community-activity.png'), fullPage: true });
    await activityNav.getByRole('button', { name: 'Сезон' }).click();
    await expect(page.getByRole('button', { name: 'Показать всех · 10' })).toBeVisible();
    await expect(page.getByText('Форма игроков')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('community-season.png'), fullPage: true });
    await activityNav.getByRole('button', { name: 'Архив' }).click();
    await expect(page.getByText('Прошлые сезоны')).toBeVisible();
    await page.screenshot({ path: info.outputPath('community-activity.png'), fullPage: true });
  });
}


// Whole-page density, rather than an individual-card screenshot. All rows use genuine mounted components.
for (const width of [360, 390]) test(`compact cabinet groups retain context at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 713 });
  await page.goto('/e2e/player-cabinet.html?scenario=compact');
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('button', { name: 'Вечера', exact: true }).click();
  await page.getByLabel('Разделы вечеров').getByRole('button', { name: 'Мои игры', exact: true }).click();
  const games = page.getByTestId('player-my-games');
  await expect(games.getByRole('button')).toHaveCount(4);
  for (const button of await games.getByRole('button').all()) {
    const height = (await button.boundingBox()).height;
    expect(height).toBeGreaterThanOrEqual(44);
    expect(height).toBeLessThan(150);
  }
  await expect(games).toContainText('Шериф');
  await expect(games).toContainText('Место №2');
  await page.screenshot({ path: info.outputPath(`compact-games-${width}.png`), fullPage: true });

  await page.getByLabel('Разделы вечеров').getByRole('button', { name: 'Прошедшие', exact: true }).click();
  const recap = page.getByTestId('evening-result-art');
  await expect(recap).toContainText('Мой результат');
  await expect(recap).toContainText('+22');
  expect((await recap.boundingBox()).height).toBeLessThan(450);
  await page.screenshot({ path: info.outputPath(`compact-recap-${width}.png`), fullPage: true });

  await nav.getByRole('button', { name: 'Сообщество', exact: true }).click();
  await page.getByLabel('Разделы сообщества').getByRole('button', { name: 'Связи', exact: true }).click();
  const duo = page.getByTestId('club-duo-p1-p2');
  await expect(duo).toContainText('12 игр вместе');
  await expect(duo.getByRole('button')).toHaveCount(2);
  expect((await duo.boundingBox()).height).toBeLessThan(180);
  for (const button of await duo.getByRole('button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath(`compact-connections-${width}.png`), fullPage: true });

  await nav.getByRole('button', { name: 'Прогресс', exact: true }).click();
  const stats = page.getByTestId('profile-club-summary');
  await expect(stats.getByTestId('profile-key-stats')).toContainText('1542');
  await expect(stats.getByTestId('profile-more-stats')).toHaveJSProperty('open', true);
  await page.screenshot({ path: info.outputPath(`compact-progress-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
