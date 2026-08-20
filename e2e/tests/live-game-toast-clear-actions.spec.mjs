import { expect, test } from '@playwright/test';

test.describe('Live Game toast safety', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps transient feedback in its own lane beside journal actions on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html?mode=recovery');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const toast = page.getByText('Прерванная игра восстановлена', { exact: true });
    const panel = page.getByTestId('live-events-panel');
    const undo = page.getByTestId('live-events-undo');
    const eventsTitle = panel.getByText('События', { exact: true });
    const latest = page.getByTestId('live-events-latest');

    await expect(toast).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();
    await expect(undo).toBeVisible();
    await expect(eventsTitle).toBeVisible();
    await expect(latest).toBeVisible();

    const toastBox = await toast.boundingBox();
    const undoBox = await undo.boundingBox();
    const titleBox = await eventsTitle.boundingBox();
    const latestBox = await latest.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(undoBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(latestBox).not.toBeNull();
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(undoBox.x - 4);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(toastBox.y - 2);
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(latestBox.y - 2);
    expect(await toast.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');

    const path = testInfo.outputPath('live-game-toast-clear-actions.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('live-game-toast-clear-actions.png', { path, contentType: 'image/png' });
  });
});
