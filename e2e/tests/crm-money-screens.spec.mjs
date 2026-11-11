import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

const prices = { casual_game: 100, casual_cap: 400, sometimes_cap: 500, stopped_game: 200, stopped_cap: 800, novice_game: 200, novice_cap: null, rating_entry: 500 };
const commerceEmpty = { online_payment: { available: false, provider: null, setup_required: true }, token_packages: [], campaigns: [], recent_intents: [], totals: [] };
const pool = (id, n, status, extra = {}) => ({ id, game_id: n, game_number: n, game_date: '2026-10-30T20:00:00+03:00', status, opens_at: '', closes_at: '', red_pool: 0, black_pool: 50, red_coefficient: 10, black_coefficient: 1, house_rate_bps: 0, max_coefficient: 10, reserve_amount: 0, settled_winner: null, settled_at: null, total_staked: 50, total_paid_out: 0, bet_count: 1, role_snapshot: [], bets: [], ...extra });
const betting = { summary: { pools: 3, open: 0, unsettled: 1, settled: 1, refunded: 1, reserve_total: 5 }, pools: [pool('a', 27, 'refunded'), pool('b', 23, 'closed', { bet_count: 3, total_staked: 300 }), pool('c', 21, 'settled', { bet_count: 2, settled_winner: 'red' })] };

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`CRM money screens at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/evening-prices', (route) => route.fulfill({ json: prices }));
    await page.route('**/api/commerce/overview', (route) => route.fulfill({ json: commerceEmpty }));
    await page.route('**/api/games/betting/admin/overview', (route) => route.fulfill({ json: betting }));

    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-cat-money').click();
    await page.getByTestId('crm-more-prices').click();
    await expect(page.getByText('Клубный вечер', { exact: true })).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`prices-${width}.png`), fullPage: true });

    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-cat-money').click();
    await page.getByTestId('crm-more-commerce').click();
    await expect(page.getByTestId('commerce-status')).toContainText('Онлайн-оплата выключена');
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`commerce-${width}.png`), fullPage: true });

    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-cat-game').click();
    await page.getByTestId('crm-more-betting').click();
    await expect(page.getByText('1 ставка · банк 50')).toBeVisible();
    await expect(page.getByText('3 ставки · банк 300')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`betting-${width}.png`), fullPage: true });
  });
}
