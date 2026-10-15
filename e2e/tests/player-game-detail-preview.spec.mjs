import { test, expect } from '@playwright/test';

// The page of one finished game: result first, the viewer's own game, what mattered, rosters by team, then the story.
for (const width of [360, 390]) test(`game page reads top to bottom at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/e2e/player-game-detail.html');
  await expect(page.getByTestId('game-hero')).toContainText('Победа красных');
  await expect(page.getByTestId('game-mine')).toContainText('Мой результат');
  await expect(page.getByText('Главное в игре')).toBeVisible();
  await expect(page.getByText('Составы и баллы')).toBeVisible();
  await expect(page.getByText('Ход игры')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Every row is a touch target; opening one shows where the points came from.
  const heights = await page.locator('summary:visible').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.length).toBe(11);
  expect(heights.every((height) => height >= 44)).toBe(true);
  const seating = page.getByTestId('game-table-scene');
  await expect(seating).not.toBeVisible();
  await page.getByText('Места за столом', { exact: true }).click();
  await expect(seating).toBeVisible();
  await expect(seating.getByRole('button')).toHaveCount(10);
  for (const button of await seating.getByRole('button').all()) {
    const box = await button.boundingBox();
    const frame = await seating.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(frame.x);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
  }
  await page.getByTestId('game-player-3').locator('summary').click();
  await expect(page.getByTestId('game-player-3')).toContainText('Из чего баллы');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The whole page in one picture for the reviewer: grow the viewport to the content.
  const full = await page.evaluate(() => Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 40);
  await page.setViewportSize({ width, height: Math.min(full, 6000) });
  await page.screenshot({ path: testInfo.outputPath(`game-page-${width}.png`) });
});
