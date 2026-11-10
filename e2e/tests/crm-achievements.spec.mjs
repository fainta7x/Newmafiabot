import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

const achievements = [
  ['first_game', '🎭', 'Первая игра', 'games', 1], ['ten_games', '🌟', 'Новичок', 'games', 10], ['first_win', '🏆', 'Первая победа', 'wins', 1],
  ['elo_1600', '⭐', 'Серебряный рейтинг', 'rating', 1600], ['sheriff_win', '🕵️', 'Защитник города', 'roles', 1], ['first_judge', '⚖️', 'Первое свидание с правосудием', 'judge', 1],
].map(([id, icon, name, category, threshold], order) => ({ id, icon, name, description: 'За что даётся', category, metric: 'games', threshold, role: null, rarity: 'common', order, active: true }));

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`CRM «Достижения» at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/admin-data/summary', (route) => route.fulfill({ json: { achievements, shop_items: [], changes: [] } }));
    await page.route(/\/api\/players(\?.*)?$/, (route) => route.fulfill({ json: [{ id: 'p1', nickname: 'Чагин' }, { id: 'p2', nickname: 'Алоэ' }] }));
    await page.route('**/api/players/*/profile-integrity', (route) => route.fulfill({ json: { awards: [{ id: 'a1', title: '1 место', tournament_name: 'Тула Cup', place_result: '1', source_type: 'automatic', verification_status: 'verified' }], suggestions: [] } }));
    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-achievements').click();
    await expect(page.getByTestId('crm-achievements')).toBeVisible();
    await expect(page.getByText('first_game')).toHaveCount(0);
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.getByLabel('Игрок', { exact: true }).selectOption('p1');
    await expect(page.getByTestId('crm-player-awards')).toContainText('получена автоматически из турнира');
    await page.getByText('За игры').click();
    await expect(page.locator('summary', { hasText: 'Первая игра' })).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`achievements-${width}.png`), fullPage: true });
  });
}
