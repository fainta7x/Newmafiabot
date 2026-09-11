import { expect, test } from '@playwright/test';

test('Live Game keeps compact proven mobile table geometry', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/e2e/live-game.html?mode=audit');
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

  const shell = page.locator('.evening-live-engine-shell');
  await expect(shell).toBeVisible();

  const center = page.locator('.live-judge-hud');
  await expect(center).toBeVisible();
  const centerBox = await center.boundingBox();
  expect(centerBox).not.toBeNull();
  expect(centerBox.width).toBeLessThan(340);

  await expect(page.locator('.live-seat-card[data-seat="1"]')).toBeVisible();
  await expect(page.locator('.live-seat-card[data-seat="10"]')).toBeVisible();

  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    giantPriorityLayer: Boolean(document.querySelector('.live-game-mobile-center-priority')),
  }));
  expect(geometry.doc).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.giantPriorityLayer).toBe(false);

  await page.screenshot({ path: info.outputPath('live-game-compact-restored-360x800.png'), fullPage: false });
});
