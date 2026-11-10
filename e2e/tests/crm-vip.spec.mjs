import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`CRM «VIP» at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    let rules = [{ id: 'r1', playerId: 'p1', kind: 'role', role: 'citizen', otherPlayerId: null, percent: 100, enabled: true }, { id: 'r2', playerId: 'p1', kind: 'same_color', role: null, otherPlayerId: 'p2', percent: 70, enabled: true }];
    await page.route(/\/api\/players(\?.*)?$/, (route) => route.fulfill({ json: [{ id: 'p1', nickname: 'Чагин' }, { id: 'p2', nickname: 'Алоэ' }, { id: 'p3', nickname: 'Богдан' }] }));
    await page.route('**/api/admin/vip-probability-rules**', (route) => {
      const url = route.request().url();
      if (url.endsWith('/game-quotas')) return route.fulfill({ json: { quotas: [{ playerId: 'p1', wholeEvening: true, maxSuccessfulGames: null }] } });
      if (route.request().method() === 'PUT') { const body = route.request().postDataJSON(); rules = rules.map((rule) => (url.endsWith(rule.id) ? { ...rule, ...body } : rule)); return route.fulfill({ json: {} }); }
      return route.fulfill({ json: { rules } });
    });
    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-vip').click();
    await expect(page.getByTestId('crm-vip')).toBeVisible();
    await expect(page.getByText('Мирный · 100% · одноцвет с Алоэ · 70%')).toBeVisible();
    await expect(page.getByText('На весь вечер')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`vip-list-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /Чагин/ }).click();
    await expect(page.getByTestId('crm-player-vip')).toBeVisible();
    await expect(page.getByText('Шанс · всегда')).toBeVisible();
    await expect(page.getByText('Шанс · чаще обычного')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`vip-player-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '← Все игроки' }).click();
    await expect(page.getByTestId('crm-vip')).toBeVisible();
  });
}
