import { expect, test } from '@playwright/test';

test.describe('Live Game toast safety', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps transient feedback under the app header and out of judge controls on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html?mode=recovery');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const toast = page.getByText('Прерванная игра восстановлена', { exact: true });
    const panel = page.getByTestId('live-events-panel');

    await expect(toast).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();

    const toastBox = await toast.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(panelBox).not.toBeNull();

    const toastStyle = await toast.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        top: Number.parseFloat(style.top),
        pointerEvents: style.pointerEvents,
      };
    });

    expect(toastStyle.top).toBeGreaterThanOrEqual(32);
    expect(toastStyle.top).toBeLessThanOrEqual(64);
    expect(toastStyle.pointerEvents).toBe('none');
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(panelBox.y - 8);

    const path = testInfo.outputPath('live-game-toast-clear-actions.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('live-game-toast-clear-actions.png', { path, contentType: 'image/png' });
  });
});
