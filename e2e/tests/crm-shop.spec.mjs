import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

const items = [
  { id: 'junk', name: 'Старый товар', description: 'Тип без выдачи.', price: 100, icon: '❔', item_type: 'legacy', active: 1, sold_count: 0, waiting_count: 0, sellable: false, standalone: false },
  { id: 'free_evening', name: 'Бесплатный вечер', description: 'Один игровой вечер без оплаты.', price: 30000, icon: '🎟️', item_type: 'free_evening', active: 1, sold_count: 2, waiting_count: 1, sellable: true, standalone: true },
  { id: 'mug', name: 'Кружка клуба', description: 'Фирменная кружка 2LA Noire.', price: 20000, icon: '☕', item_type: 'manual', active: 1, sold_count: 1, waiting_count: 1, sellable: true, standalone: true },
  { id: 'buy_role', name: 'Купить роль на игру', description: 'Выбрать роль перед началом игры.', price: 10000, icon: '🎭', item_type: 'role', active: 1, sold_count: 0, waiting_count: 0, sellable: true, standalone: false },
];
const types = [{ value: 'free_evening', label: 'Бесплатный вечер', delivery: 'Игрок сам тратит его при оплате вечера' }, { value: 'manual', label: 'Выдаётся вручную', delivery: 'Организатор выдаёт товар и отмечает «Выдано»' }, { value: 'role', label: 'Роль на игру (жетоны)', delivery: 'Цена в жетонах за роль' }, { value: 'music', label: 'Музыка на игру (жетоны)', delivery: 'Цена в жетонах за песню' }];
const purchases = [
  { id: 'a', player_id: 'p1', nickname: 'Чагин', item_name_snapshot: 'Кружка клуба', item_type_snapshot: 'manual', price_snapshot: 20000, status: 'purchased', purchased_at: '2026-11-10T10:00:00Z', redeemed_at: null },
  { id: 'b', player_id: 'p2', nickname: 'Алоэ', item_name_snapshot: 'Бесплатный вечер', item_type_snapshot: 'free_evening', price_snapshot: 30000, status: 'redeemed', purchased_at: '2026-11-09T10:00:00Z', redeemed_at: '2026-11-10T09:00:00Z' },
];

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`CRM «Магазин» at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.route('**/api/admin-data/shop', (route) => route.fulfill({ json: { items, types } }));
    await page.route('**/api/admin-data/shop/purchases', (route) => route.fulfill({ json: { purchases } }));
    await page.goto('/e2e/crm-more.html');
    await page.getByTestId('crm-more-cat-game').click();
    await page.getByTestId('crm-more-shop').click();
    await expect(page.getByTestId('crm-shop')).toContainText('Кружка клуба');
    await expect(page.getByTestId('crm-shop')).toContainText('Не продаётся: этот товар ничего не выдаёт');
    await expect(page.getByTestId('crm-shop')).toContainText('Цена оплаты жетонами в «Покупках перед игрой»');
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.getByTestId('crm-shop-item-mug').click();
    await expect(page.getByRole('combobox')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`shop-edit-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Покупки/ }).click();
    await expect(page.getByRole('button', { name: 'Выдано' })).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`shop-${width}.png`), fullPage: true });
  });
}
