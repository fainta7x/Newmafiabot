import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getGame } from './gameService.ts';
import { reconcileOtherFormatExtensions, reconcileRegularEveningPayments } from './eveningPaymentPricingService.ts';

export const GAME_SEAT_SWAP_PRICE_RUB = 50;
type Swap = {
  id: string; game_id: number; evening_id: string; player_id: string; target_player_id: string;
  status: 'ordered' | 'applied' | 'cancelled';
};
const fail = (message: string, statusCode = 409): never => {
  throw Object.assign(new Error(message), { statusCode });
};

export async function ensureGameSeatSwapSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS game_seat_swap_orders (
    id TEXT PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    target_player_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ordered','applied','cancelled')),
    amount_rub INTEGER NOT NULL DEFAULT 50,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_seat_swap_orders_evening ON game_seat_swap_orders(evening_id,status);
  CREATE INDEX IF NOT EXISTS idx_game_seat_swap_orders_game ON game_seat_swap_orders(game_id,status);`);
}
async function bill(db: DatabaseWrapper, eveningId: string) {
  await reconcileRegularEveningPayments(db, eveningId);
  await reconcileOtherFormatExtensions(db, eveningId);
}

async function availableGame(db: DatabaseWrapper, gameId: number, formatRequired = true) {
  const game = await getGame(db, `club:${gameId}`);
  if (!game || game.storage !== 'club' || !game.eventId) fail('Игра не найдена', 404);
  if (formatRequired && !['CASUAL','NOVICE'].includes(game.format)) fail('Обмен местами недоступен в этом формате');
  if (!['published','active'].includes(String(game.eventStatus)) ||
      ['completed','cancelled','archived'].includes(game.status)) fail('Игра уже закрыта');
  return game;
}

export async function orderGameSeatSwap(
  db: DatabaseWrapper, gameId: number, playerId: string, targetPlayerId: string,
) {
  await ensureGameSeatSwapSchema(db);
  return db.transaction(async (tx) => {
    const game = await availableGame(tx, gameId);
    if (!targetPlayerId || targetPlayerId === playerId) fail('Выберите другого игрока', 400);
    if (!game.seats.some((seat) => seat.playerId === playerId) ||
        !game.seats.some((seat) => seat.playerId === targetPlayerId)) fail('Оба игрока должны сидеть за этим столом', 403);
    const deal = await tx.get('SELECT 1 FROM game_virtual_role_deals WHERE game_id=?', [gameId]).catch(() => null);
    if (deal) fail('После начала раздачи менять места нельзя');
    const existing = await tx.get(
      "SELECT 1 FROM game_seat_swap_orders WHERE game_id=? AND status='ordered' AND (player_id IN (?,?) OR target_player_id IN (?,?)) LIMIT 1",
      [gameId, playerId, targetPlayerId, playerId, targetPlayerId],
    );
    if (existing) fail('Для выбранных мест уже есть незавершённый заказ');
    const id = randomUUID(); const now = new Date().toISOString();
    await tx.run(
      `INSERT INTO game_seat_swap_orders
        (id,game_id,evening_id,player_id,target_player_id,status,amount_rub,created_at,updated_at)
        VALUES (?,?,?,?,?,'ordered',50,?,?)`,
      [id, gameId, game.eventId, playerId, targetPlayerId, now, now],
    );
    await bill(tx, game.eventId);
    return { id, priceRub: GAME_SEAT_SWAP_PRICE_RUB };
  });
}

/** Judge executes the exchange inside the authoritative game protocol. */
export async function applyGameSeatSwap(db: DatabaseWrapper, orderId: string, gameId: number) {
  await ensureGameSeatSwapSchema(db);
  return db.transaction(async (tx) => {
    const order = await tx.get<Swap>('SELECT * FROM game_seat_swap_orders WHERE id=? AND game_id=?', [orderId,gameId]);
    if (!order) fail('Заказ не найден', 404);
    if (order.status === 'cancelled') fail('Заказ отменён');
    if (order.status === 'applied') return { applied: true };
    const game = await availableGame(tx, gameId);
    const deal = await tx.get('SELECT 1 FROM game_virtual_role_deals WHERE game_id=?', [gameId]).catch(() => null);
    if (deal) fail('Нельзя менять места после начала раздачи');
    const row = await tx.get<{ protocol_text: string; evening_table_id: string | null }>(
      'SELECT protocol_text,evening_table_id FROM games WHERE id=?', [gameId],
    );
    if (!row) fail('Протокол не найден');
    let payload: any = null;
    try { payload = JSON.parse(row.protocol_text); } catch { fail('Некорректный протокол'); }
    if (payload?.kind !== 'club_evening_protocol' || payload?.protocol?.status === 'completed' ||
        !Array.isArray(payload?.player_results)) fail('Протокол недоступен для обмена');
    const a = payload.player_results.find((entry: any) => String(entry.player_id || '') === order.player_id);
    const b = payload.player_results.find((entry: any) => String(entry.player_id || '') === order.target_player_id);
    if (!a || !b || a === b) fail('Состав игры изменился');
    const seatA = Number(a.seat_number); const seatB = Number(b.seat_number);
    if (!Number.isInteger(seatA) || !Number.isInteger(seatB)) fail('Некорректные места');
    if (a.role || b.role || payload.player_results.some((entry: any) => entry.role)) fail('Роли уже назначены');

    // No repeated seat per table during the evening for either buyer or peer.
    const previous = await tx.all<{ protocol_text: string }>(
      `SELECT protocol_text FROM games
         WHERE evening_id=? AND evening_table_id IS ? AND id<>? AND archived_at IS NULL`,
      [game.eventId, row.evening_table_id, gameId],
    );
    for (const prior of previous) {
      let parsed: any = null;
      try { parsed = JSON.parse(prior.protocol_text); } catch { continue; }
      if (parsed?.protocol?.status !== 'completed' || !Array.isArray(parsed.player_results)) continue;
      if (parsed.player_results.some((entry: any) =>
        (entry.player_id === order.player_id && Number(entry.seat_number) === seatB) ||
        (entry.player_id === order.target_player_id && Number(entry.seat_number) === seatA))) {
        fail('Игрок уже занимал это место за этим столом в течение вечера');
      }
    }
    a.seat_number = seatB;
    b.seat_number = seatA;
    // Numeric seat order is the only thing exchanged. Players retain their
    // personal IDs and any already paid future role reservation.
    await tx.run('UPDATE games SET protocol_text=? WHERE id=?', [JSON.stringify(payload), gameId]);
    await tx.run(
      "UPDATE game_seat_swap_orders SET status='applied',updated_at=? WHERE id=?",
      [new Date().toISOString(), orderId],
    );
    return { applied: true, firstSeat: seatB, secondSeat: seatA };
  });
}

export async function cancelGameSeatSwap(db: DatabaseWrapper, orderId: string) {
  await ensureGameSeatSwapSchema(db);
  return db.transaction(async (tx) => {
    const order = await tx.get<Swap>('SELECT * FROM game_seat_swap_orders WHERE id=?', [orderId]);
    if (!order) fail('Заказ не найден', 404);
    if (order.status === 'applied') fail('Обмен уже выполнен');
    if (order.status === 'cancelled') return { cancelled: true };
    await tx.run("UPDATE game_seat_swap_orders SET status='cancelled',updated_at=? WHERE id=?",
      [new Date().toISOString(), orderId]);
    await bill(tx, order.evening_id);
    return { cancelled: true };
  });
}

export async function cancelOutstandingGameSeatSwaps(db: DatabaseWrapper, eveningId: string) {
  await ensureGameSeatSwapSchema(db);
  return db.transaction(async (tx) => {
    const result = await tx.run(
      "UPDATE game_seat_swap_orders SET status='cancelled',updated_at=? WHERE evening_id=? AND status='ordered'",
      [new Date().toISOString(), eveningId],
    );
    if (result.changes) await bill(tx, eveningId);
    return Number(result.changes);
  });
}
