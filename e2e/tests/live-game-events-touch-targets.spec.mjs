import { expect, test } from '@playwright/test';

const expectTouchTarget = async (locator) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
};

test.describe('Live Game Events mobile controls', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps routine journal actions finger-sized without horizontal overflow', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html?mode=recovery');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const panel = page.getByTestId('live-events-panel');
    const undo = page.getByTestId('live-events-undo');
    const copy = page.getByTestId('live-copy-protocol');
    const journal = page.getByTestId('live-events-toggle');

    await expect(panel).toBeVisible();
    await expectTouchTarget(undo);
    await expectTouchTarget(copy);
    await expectTouchTarget(journal);

    await journal.click();
    const filters = page.getByTestId('live-events-filters').getByRole('button');
    await expect(filters).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expectTouchTarget(filters.nth(index));
    }

    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);

    const path = testInfo.outputPath('live-game-events-touch-targets.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('live-game-events-touch-targets.png', { path, contentType: 'image/png' });
  });
});
