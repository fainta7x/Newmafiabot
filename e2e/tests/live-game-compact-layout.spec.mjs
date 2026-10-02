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

for (const viewport of [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1366, height: 768, name: '1366x768' },
]) {
  test(`Live Game desktop mirrors mobile board at ${viewport.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/e2e/live-game.html?mode=audit');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const center = page.locator('.live-judge-hud');
    await expect(center).toBeVisible();
    await expect(page.locator('.live-seat-card[data-seat="1"]')).toBeVisible();
    await expect(page.locator('.live-seat-card[data-seat="10"]')).toBeVisible();

    const positions = await page.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      };
      return {
        s9: box('.live-seat-card[data-seat="9"]'),
        s10: box('.live-seat-card[data-seat="10"]'),
        s1: box('.live-seat-card[data-seat="1"]'),
        s2: box('.live-seat-card[data-seat="2"]'),
        s8: box('.live-seat-card[data-seat="8"]'),
        hud: box('.live-judge-hud'),
        s3: box('.live-seat-card[data-seat="3"]'),
        docWidth: document.documentElement.scrollWidth,
      };
    });

    expect(positions.docWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(positions.s9.y).toBeCloseTo(positions.s10.y, 0);
    expect(positions.s10.y).toBeCloseTo(positions.s1.y, 0);
    expect(positions.s1.y).toBeCloseTo(positions.s2.y, 0);
    expect(positions.s8.y).toBeCloseTo(positions.hud.y, 0);
    expect(positions.hud.y).toBeCloseTo(positions.s3.y, 0);
    expect(positions.hud.width).toBeGreaterThan(positions.s8.width * 1.8);

    await page.screenshot({ path: info.outputPath(`live-game-desktop-${viewport.name}.png`), fullPage: false });
  });
}
