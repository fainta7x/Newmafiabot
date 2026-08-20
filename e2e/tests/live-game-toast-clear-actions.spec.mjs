import { expect, test } from '@playwright/test';

test.describe('Live Game toast safety', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('reuses the Events secondary line without covering judge actions on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html?mode=recovery');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const toast = page.getByText('Прерванная игра восстановлена', { exact: true });
    const panel = page.getByTestId('live-events-panel');
    const undo = page.getByTestId('live-events-undo');
    const title = panel.getByText('События', { exact: true });
    const latest = page.getByTestId('live-events-latest');

    await expect(toast).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();
    await expect(undo).toBeVisible();
    await expect(title).toBeVisible();
    await expect(latest).toHaveCSS('visibility', 'hidden');

    const toastBox = await toast.boundingBox();
    const panelBox = await panel.boundingBox();
    const undoBox = await undo.boundingBox();
    const titleBox = await title.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(undoBox).not.toBeNull();
    expect(titleBox).not.toBeNull();

    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(toastBox.y - 2);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(undoBox.x - 4);
    expect(toastBox.y).toBeGreaterThanOrEqual(panelBox.y + 18);
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height - 4);
    expect(await toast.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');

    const path = testInfo.outputPath('live-game-toast-clear-actions.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('live-game-toast-clear-actions.png', { path, contentType: 'image/png' });
  });
});
