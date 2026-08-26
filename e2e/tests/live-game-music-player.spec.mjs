import { expect, test } from '@playwright/test';

const ROLE_SEQUENCE = [
  'Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный',
  'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный',
];

test.describe('Live game music player', () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(60_000);

  test('keeps the active music player compact and allows expanding it', async ({ page }, testInfo) => {
    await page.route('**/api/player/judge-music', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          limit: 10,
          max_track_bytes: 15 * 1024 * 1024,
          tracks: [{
            id: 'e2e-music-track',
            title: 'Ночной тестовый трек',
            mime_type: 'audio/mpeg',
            byte_size: 4,
            sort_order: 0,
            audio_url: 'data:audio/mpeg;base64,SUQz',
          }],
        }),
      });
    });

    await page.goto('/e2e/live-game.html');
    await expect(page.getByText('Раздача ролей', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
    await page.getByText('Подготовьте 10 карт').locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Начать раздачу', exact: true }).click();

    for (const role of ROLE_SEQUENCE) {
      await page.getByRole('button', { name: new RegExp(role) }).click();
    }
    await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
    await page.getByRole('button', { name: /Включить музыку ночи/ }).click();

    const player = page.getByTestId('judge-music-player');
    const toggle = page.getByTestId('judge-music-player-toggle');
    await expect(player).toBeVisible();
    await expect(player).toContainText('Ночной тестовый трек');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const viewport = page.viewportSize();
    const collapsedBox = await player.boundingBox();
    expect(viewport).not.toBeNull();
    expect(collapsedBox).not.toBeNull();
    expect(collapsedBox.x).toBeGreaterThanOrEqual(-1);
    expect(collapsedBox.x + collapsedBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(collapsedBox.height).toBeLessThanOrEqual(76);
    await page.screenshot({ path: testInfo.outputPath('music-player-collapsed.png'), fullPage: false });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(player.getByRole('button', { name: 'Сменить трек', exact: true })).toBeVisible();
    const expandedBox = await player.boundingBox();
    expect(expandedBox).not.toBeNull();
    expect(expandedBox.height).toBeGreaterThan(collapsedBox.height);
    await page.screenshot({ path: testInfo.outputPath('music-player-expanded.png'), fullPage: false });
  });
});
