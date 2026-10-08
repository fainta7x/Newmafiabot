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
    const fixture = await page.evaluate(() => {
      const scoped = localStorage.getItem('mafia_live_session:club:-2147483000');
      const shared = localStorage.getItem('mafia_live_session');
      return {
        marker: localStorage.getItem('mafia_test_game_sandbox_active'),
        scoped: scoped ? JSON.parse(scoped).phase : null,
        shared: shared ? JSON.parse(shared).phase : null,
        sharedKey: shared ? JSON.parse(shared).sessionKey : null,
        tableSize: shared ? JSON.parse(shared).activePlayers?.length : null,
      };
    });
    console.log('Synthetic winner recovery fixture:', JSON.stringify(fixture));
    await expect(page.getByRole('button', { name: 'Восстановить', exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await expect(page.getByTestId('live-winner-confirmation')).toBeVisible();
    await page.getByTestId('live-winner-confirm').click();
    await expect(page.getByTestId('e2e-live-game-result')).toHaveText('E2E LIVE GAME COMPLETED');
    expect(protocolRequests).toHaveLength(0);
    // The synthetic sandbox must restore rather than leave a real game corrupted.
    expect(await page.evaluate(() => localStorage.getItem('mafia_test_game_sandbox_active'))).toBeNull();
  });
}
