import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`CRM «Жетоны» at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.route(/\/api\/players(\?.*)?$/, (route) => route.fulfill({ json: [{ id: 'p1', nickname: 'Чагин', tokens: 22320 }, { id: 'p2', nickname: 'Алоэ', tokens: 1500 }, { id: 'p3', nickname: 'Богдан', tokens: 0 }] }));
    await page.route('**/api/players/*/tokens?**', (route) => route.fulfill({ json: { player_id: 'p1', balance: 22320, ledger: { items: [{ id: 'l1', amount: 200, balance_after: 22320, description: 'Слово дня 2026-11-08: победа', reason_type: 'daily_word', created_at: '2026-11-08T10:00:00Z' }], total: 1, limit: 5, offset: 0 } } }));
    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-tokens').click();
    await expect(page.getByTestId('crm-tokens')).toContainText('23 820');
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.getByLabel('Поиск игрока').fill('чаг');
    await expect(page.getByRole('button', { name: /Алоэ/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Чагин/ }).click();
    await expect(page.getByTestId('crm-tokens-player')).toContainText('Слово дня 2026-11-08');
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`tokens-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '← Все игроки' }).click();
    await expect(page.getByTestId('crm-tokens')).toBeVisible();
  });
}
