import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
  test(`synthetic winning match finishes without API save or blocked button at ${width}px`, async ({ page }) => {
    test.setTimeout(55_000);
    const protocolRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/evening-protocol') && request.method() === 'PUT') {
        protocolRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/e2e/live-game.html?mode=training-finish');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await expect(page.getByTestId('live-winner-confirmation')).toBeVisible();
    await page.getByTestId('live-winner-confirm').click();
    await expect(page.getByTestId('e2e-live-game-result')).toHaveText('E2E LIVE GAME COMPLETED');
    expect(protocolRequests).toHaveLength(0);
    // The synthetic sandbox must restore rather than leave a real game corrupted.
    expect(await page.evaluate(() => localStorage.getItem('mafia_test_game_sandbox_active'))).toBeNull();
  });
}
