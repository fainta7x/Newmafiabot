import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { TokenInsufficientFundsError, mutateTokenBalance } from './tokenLedgerService.ts';

/**
 * Paying a pre-game purchase with tokens (owner, 2026-11-11: «выбор при покупке: рубли или жетоны»). A role (150 ₽) or a song (50 ₽)
 * ordered for a game is paid either as an amount added to the evening debt or in tokens at the price set in the shop
 * (`buy_role`, `order_music`). A token payment debits the player's tokens, is written as a purchase of the shop and covers the
 * ruble amount of that order on the evening debt (`covers_rub`). When the organizer cancels the order the tokens are returned.
 */
export type GameOrderKind = 'role' | 'music';
const SHOP_ITEM: Record<GameOrderKind, string> = { role: 'buy_role', music: 'order_music' };
const LABEL: Record<GameOrderKind, string> = { role: 'Роль на игру', music: 'Заказ музыки' };

const ensured = new WeakSet<object>();
async function ensureColumns(db: DatabaseWrapper) {
  if (ensured.has(db as object)) return;
  const columns = new Set((await db.all<{ name: string }>('PRAGMA table_info(shop_purchases)')).map((column) => column.name));
  for (const [name, type] of [['evening_id', 'TEXT'], ['covers_rub', 'INTEGER NOT NULL DEFAULT 0'], ['order_kind', 'TEXT'], ['order_id', 'TEXT']] as const) {
    if (!columns.has(name)) await db.exec(`ALTER TABLE shop_purchases ADD COLUMN ${name} ${type}`);
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_shop_purchases_order ON shop_purchases(order_id)');
  ensured.add(db as object);
}

/** Token prices of the two orders from the shop; null when the organizer switched token payment off. */
export async function loadGameOrderTokenPrices(db: DatabaseWrapper): Promise<Record<GameOrderKind, number | null>> {
  const rows = await db.all<{ id: string; price: number; active: number }>("SELECT id, price, active FROM shop_items WHERE id IN ('buy_role', 'order_music')").catch(() => []);
  const price = (kind: GameOrderKind) => {
    const row = rows.find((item) => item.id === SHOP_ITEM[kind]);
    return row && Number(row.active) === 1 && Number.isInteger(Number(row.price)) && Number(row.price) > 0 ? Number(row.price) : null;
  };
  return { role: price('role'), music: price('music') };
}

export async function payGameOrderWithTokens(db: DatabaseWrapper, input: { kind: GameOrderKind; orderId: string; playerId: string; eveningId: string; rubEquivalent: number }) {
  await ensureColumns(db);
  const tokens = (await loadGameOrderTokenPrices(db))[input.kind];
  if (!tokens) throw Object.assign(new Error('Оплата жетонами для этой покупки недоступна'), { statusCode: 409 });
  const purchaseId = `shop_${randomUUID()}`;
  let entry;
  try {
    entry = await mutateTokenBalance(db, {
    playerId: input.playerId, delta: -tokens, reasonType: 'game_order_tokens', description: `${LABEL[input.kind]}: оплата жетонами`,
    sourceType: 'game_order', sourceId: input.orderId, idempotencyKey: `game-order:${input.orderId}`, debitPolicy: 'prevent_negative',
    actorType: 'player', actorId: input.playerId, metadata: { kind: input.kind, order_id: input.orderId, evening_id: input.eveningId, tokens },
    });
  } catch (error) {
    if (error instanceof TokenInsufficientFundsError) throw Object.assign(new Error('Не хватает жетонов'), { statusCode: 409 });
    throw error;
  }
  await db.run(
    `INSERT INTO shop_purchases (id, player_id, item_id, item_name_snapshot, item_type_snapshot, price_snapshot, status, request_id, token_ledger_entry_id, purchased_at, redeemed_at, notes, evening_id, covers_rub, order_kind, order_id)
     VALUES (?, ?, ?, ?, ?, ?, 'redeemed', ?, ?, ?, ?, 'Оплата заказа перед игрой', ?, ?, ?, ?)`,
    [purchaseId, input.playerId, SHOP_ITEM[input.kind], LABEL[input.kind], input.kind, tokens, `game-order:${input.orderId}`, entry.id, entry.created_at, entry.created_at, input.eveningId, input.rubEquivalent, input.kind, input.orderId],
  );
  return { tokens, balance: entry.balance_after };
}

/** The organizer cancelled an order: tokens come back once and the order stops covering the evening debt. */
export async function refundGameOrderTokens(db: DatabaseWrapper, orderId: string) {
  await ensureColumns(db);
  const purchase = await db.get<{ id: string; player_id: string; price_snapshot: number; item_name_snapshot: string }>(
    "SELECT id, player_id, price_snapshot, item_name_snapshot FROM shop_purchases WHERE order_id = ? AND status <> 'cancelled'", [orderId]);
  if (!purchase) return false;
  await mutateTokenBalance(db, {
    playerId: purchase.player_id, delta: Number(purchase.price_snapshot), reasonType: 'game_order_refund', description: `${purchase.item_name_snapshot}: возврат жетонов`,
    sourceType: 'game_order', sourceId: orderId, idempotencyKey: `game-order-refund:${orderId}`, debitPolicy: 'prevent_negative',
    actorType: 'system', actorId: null, metadata: { order_id: orderId },
  });
  await db.run("UPDATE shop_purchases SET status = 'cancelled', notes = 'Заказ отменён, жетоны возвращены' WHERE id = ?", [purchase.id]);
  return true;
}

/** Ruble amount per player of the evening that was paid in tokens (to subtract from the debt). */
export async function tokenCoverageByPlayer(db: DatabaseWrapper, eveningId: string): Promise<Map<string, number>> {
  const columns = (await db.all<{ name: string }>('PRAGMA table_info(shop_purchases)').catch(() => [])).map((column) => column.name);
  if (!columns.includes('covers_rub')) return new Map();
  const rows = await db.all<{ player_id: string; amount: number }>(
    "SELECT player_id, COALESCE(SUM(covers_rub), 0) AS amount FROM shop_purchases WHERE evening_id = ? AND status <> 'cancelled' AND covers_rub > 0 GROUP BY player_id", [eveningId]);
  return new Map(rows.map((row) => [String(row.player_id), Number(row.amount || 0)]));
}
