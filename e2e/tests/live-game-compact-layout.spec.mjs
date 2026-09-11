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
  expect(centerBox.height).toBeLessThan(286);
  expect(centerBox.width).toBeLessThan(360);

  const firstSeat = page.locator('.live-seat-card').first();
  const seatBox = await firstSeat.boundingBox();
  expect(seatBox).not.toBeNull();
  expect(seatBox.height).toBeLessThan(84);

  await page.screenshot({ path: info.outputPath('live-game-compact-restored-360x800.png'), fullPage: false });
});
