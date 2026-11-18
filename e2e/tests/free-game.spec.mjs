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
});
