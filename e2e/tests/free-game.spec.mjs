import { expect, test } from '@playwright/test';

// «Игра без вечера» (owner, 2026-11-18): any 8–10 people, the full engine, virtual deal, nothing saved.
test.describe('Игра без вечера', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const seats of [10, 9]) {
    test(`${seats} players: names → roster → virtual deal → the game starts, nothing goes to the server`, async ({ page }) => {
      test.setTimeout(180_000);
      const writes = [];
      page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/api/') && !request.url().includes('/api/presence') && !request.url().includes('/api/ui-events')) writes.push(`${request.method()} ${request.url()}`); });
      await page.addInitScript(() => sessionStorage.setItem('role_deal_card_seconds', '1'));
      await page.goto('/e2e/live-game.html?mode=free');
      await page.getByTestId('free-game-judge').fill('Чагин');
      await page.getByRole('radio', { name: String(seats) }).click();
      const names = ['Аня', 'Боря', 'Вика', 'Гена', 'Даша', 'Егор', 'Жора', 'Зоя', 'Илья', 'Катя'];
      for (let seat = 1; seat <= seats; seat += 1) await page.getByTestId(`free-game-seat-${seat}`).fill(names[seat - 1]);
      await page.getByTestId('free-game-start').click();

      await page.getByRole('button', { name: 'Подтвердить состав' }).click();
      await expect(page.getByTestId('club-game-table-preview')).toContainText('Аня');
      await expect(page.getByTestId('club-game-table-preview')).toContainText(`${seats}/${seats}`);
      await page.getByTestId('club-game-start-role-deal').click();
      const deal = page.getByTestId('virtual-role-deal');
      await deal.getByRole('button', { name: 'Начать раздачу' }).click();
      await deal.getByTestId('virtual-deal-go').click();
      await expect(deal.getByTestId('virtual-deal-turn')).toContainText('Аня');
      for (let remaining = seats; remaining > 0; remaining -= 1) {
        await deal.getByRole('button', { name: /^Карта №/ }).first().click();
        const next = deal.getByTestId('virtual-deal-next-player');
        await expect(next).toBeEnabled({ timeout: 9000 });
        await next.click();
      }
      // The last card goes straight into the game.
      await expect(deal).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Включите музыку/ })).toBeVisible();
      expect(writes.filter((url) => !url.includes('/api/games/-2147483000/'))).toEqual([]);
    });
  }

  test('the names stay on the device for the next game', async ({ page }) => {
    await page.goto('/e2e/live-game.html?mode=free');
    await page.getByTestId('free-game-seat-1').fill('Аня');
    await page.getByTestId('free-game-start').click();
    await page.reload();
    await expect(page.getByTestId('free-game-seat-1')).toHaveValue('Аня');
  });

  test('a game closed by accident (the app killed mid-game) is continued from the same place', async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => sessionStorage.setItem('role_deal_card_seconds', '1'));
    await page.goto('/e2e/live-game.html?mode=free');
    const names = ['Аня', 'Боря', 'Вика', 'Гена', 'Даша', 'Егор', 'Жора', 'Зоя', 'Илья', 'Катя'];
    for (let seat = 1; seat <= 10; seat += 1) await page.getByTestId(`free-game-seat-${seat}`).fill(names[seat - 1]);
    await page.getByTestId('free-game-start').click();
    await page.getByRole('button', { name: 'Подтвердить состав' }).click();
    await page.getByTestId('club-game-start-role-deal').click();
    const deal = page.getByTestId('virtual-role-deal');
    await deal.getByRole('button', { name: 'Начать раздачу' }).click();
    await deal.getByTestId('virtual-deal-go').click();
    for (let remaining = 10; remaining > 0; remaining -= 1) {
      await deal.getByRole('button', { name: /^Карта №/ }).first().click();
      const next = deal.getByTestId('virtual-deal-next-player');
      await expect(next).toBeEnabled({ timeout: 9000 });
      await next.click();
    }
    await expect(page.getByRole('button', { name: /Включите музыку/ })).toBeVisible();
    // The engine writes the game to the device every 75 ms: wait until the night is saved.
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session:club:-2147483000') || '{}').phase || null), { timeout: 10000 }).not.toBe(null);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session:club:-2147483000') || '{}').phase)).not.toBe('setup');
    const rolesBefore = await page.evaluate(() => localStorage.getItem('mafia_live_session:club:-2147483000'));

    // The app is killed: a fresh page load, the sandbox is recovered on start and the game is parked.
    await page.reload();
    const parked = page.getByTestId('free-game-parked');
    await expect(parked).toContainText('Аня');
    await page.getByTestId('free-game-resume').click();
    const restore = page.getByRole('button', { name: 'Восстановить' });
    // The engine offers «Восстановить» once it has read the saved game (a moment later on a slow machine).
    await restore.waitFor({ timeout: 8000 }).then(() => restore.click()).catch(() => undefined);
    // Back in the same game: past the deal, at the night, with the same roles.
    await expect(page.getByRole('button', { name: 'Подтвердить состав' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Включите музыку/ })).toBeVisible({ timeout: 10000 });
    const rolesAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session:club:-2147483000') || '{}').activePlayers?.map((p) => `${p.nickname}:${p.role}`));
    expect(rolesAfter).toEqual(JSON.parse(rolesBefore).activePlayers.map((p) => `${p.nickname}:${p.role}`));
  });
});

