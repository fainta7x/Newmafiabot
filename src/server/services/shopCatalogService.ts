import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * The token shop (owner, 2026-11-11: «товар, который ничего не выдаёт, продавать нельзя»). A product is sold only if buying it
 * delivers something:
 *  - `free_evening` is redeemed by the player himself when paying an evening (`playerPaymentRoutes.ts`);
 *  - `manual` is handed out by the organizer, who ticks «Выдано» in the purchase list.
 * Any other type («role», «music», legacy «custom» …) has no delivery behind it and is neither shown to players nor sold.
 */
export const SHOP_ITEM_TYPES = {
  free_evening: { label: 'Бесплатный вечер', delivery: 'Игрок сам тратит его при оплате вечера' },
  manual: { label: 'Выдаётся вручную', delivery: 'Организатор выдаёт товар и отмечает «Выдано»' },
} as const;
export type ShopItemType = keyof typeof SHOP_ITEM_TYPES;

/** `custom` was the editor's default before the types had a list: it always meant a thing handed out by hand. */
export const normalizeShopItemType = (value: unknown): string => {
  const type = String(value ?? '').trim();
  return type === 'custom' ? 'manual' : type;
};
export const isSellableShopType = (value: unknown): value is ShopItemType => Object.prototype.hasOwnProperty.call(SHOP_ITEM_TYPES, normalizeShopItemType(value));
export const SELLABLE_TYPES_SQL = `('free_evening', 'manual', 'custom')`;

export async function loadShopOverview(db: DatabaseWrapper) {
  const items = await db.all<any>(`
    SELECT i.*, (SELECT COUNT(*) FROM shop_purchases p WHERE p.item_id = i.id) AS sold_count,
           (SELECT COUNT(*) FROM shop_purchases p WHERE p.item_id = i.id AND p.status = 'purchased') AS waiting_count
      FROM shop_items i ORDER BY i.active DESC, i.sort_order ASC, i.id ASC`);
  return {
    types: Object.entries(SHOP_ITEM_TYPES).map(([value, meta]) => ({ value, ...meta })),
    items: items.map((item) => ({
      ...item, price: Number(item.price || 0), active: Number(item.active || 0), sort_order: Number(item.sort_order || 0),
      sold_count: Number(item.sold_count || 0), waiting_count: Number(item.waiting_count || 0),
      sellable: isSellableShopType(item.item_type), item_type: normalizeShopItemType(item.item_type),
    })),
  };
}

export async function listShopPurchases(db: DatabaseWrapper, filter: { status?: string; playerId?: string } = {}) {
  const where: string[] = []; const params: unknown[] = [];
  if (filter.status === 'purchased' || filter.status === 'redeemed') { where.push('p.status = ?'); params.push(filter.status); }
  if (filter.playerId) { where.push('p.player_id = ?'); params.push(filter.playerId); }
  return db.all<any>(`
    SELECT p.id, p.player_id, pl.nickname, p.item_id, p.item_name_snapshot, p.item_type_snapshot, p.price_snapshot, p.status, p.purchased_at, p.redeemed_at, p.notes
      FROM shop_purchases p LEFT JOIN players pl ON pl.id = p.player_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.purchased_at DESC, p.id DESC LIMIT 200`, params);
}

/** The organizer handed the product over. Only a manual product that is still waiting can be ticked. */
export async function markShopPurchaseIssued(db: DatabaseWrapper, id: string) {
  const purchase = await db.get<any>('SELECT id, status, item_type_snapshot FROM shop_purchases WHERE id = ?', [id]);
  if (!purchase) throw Object.assign(new Error('Покупка не найдена'), { statusCode: 404 });
  if (normalizeShopItemType(purchase.item_type_snapshot) !== 'manual') throw Object.assign(new Error('Этот товар выдаётся сам, отмечать нечего'), { statusCode: 409 });
  if (purchase.status !== 'purchased') throw Object.assign(new Error('Покупка уже отмечена'), { statusCode: 409 });
  await db.run("UPDATE shop_purchases SET status = 'redeemed', redeemed_at = ?, notes = 'Выдано организатором' WHERE id = ?", [new Date().toISOString(), id]);
}
