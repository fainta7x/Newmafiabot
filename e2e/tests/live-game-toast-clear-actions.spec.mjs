import { expect, test } from '@playwright/test';

test.describe('Live Game toast safety', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('reuses the Events secondary line without covering judge actions on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html?mode=recovery');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

    const panel = page.getByTestId('live-events-panel');
    const feedback = page.getByTestId('live-events-feedback');
    const toast = page.getByTestId('live-game-inline-toast');
    const undo = page.getByTestId('live-events-undo');
    const title = panel.getByText('События', { exact: true });

    await expect(panel).toBeVisible();
    await expect(feedback).toBeVisible();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Прерванная игра восстановлена');
    await expect(undo).toBeVisible();
    await expect(title).toBeVisible();

    const toastBox = await toast.boundingBox();
    const feedbackBox = await feedback.boundingBox();
    const undoBox = await undo.boundingBox();
    const titleBox = await title.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(feedbackBox).not.toBeNull();
    expect(undoBox).not.toBeNull();
    expect(titleBox).not.toBeNull();

    expect(toastBox.x).toBeGreaterThanOrEqual(feedbackBox.x - 1);
    expect(toastBox.y).toBeGreaterThanOrEqual(feedbackBox.y - 1);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(feedbackBox.x + feedbackBox.width + 1);
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(feedbackBox.y + feedbackBox.height + 1);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(toastBox.y + 2);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(undoBox.x - 4);
    expect(await toast.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');

    const path = testInfo.outputPath('live-game-toast-clear-actions.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('live-game-toast-clear-actions.png', { path, contentType: 'image/png' });
  });
});
