import { randomUUID } from 'node:crypto';
import { OPEN_EVENING_STATUSES } from '../../lib/eveningStatus.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getGame } from './gameService.ts';
import { isCompletedClubGame } from './completedClubGame.ts';
import { seatingWarnings, type EveningSeat } from '../../lib/eveningSeating.ts';
import { reconcileOtherFormatExtensions, reconcileRegularEveningPayments } from './eveningPaymentPricingService.ts';

export const GAME_SEAT_SWAP_PRICE_RUB = 50;
type Swap = {
  id: string; game_id: number; evening_id: string; player_id: string; target_player_id: string;
  status: 'ordered' | 'applied' | 'cancelled';
};
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}

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
  if (!OPEN_EVENING_STATUSES.some((value) => value === String(game.eventStatus)) ||
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
    await bill(tx, String(game.eventId));
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
    const row = await tx.get<{ protocol_text: string; slots_json: string; evening_table_id: string | null }>(
      'SELECT protocol_text,slots_json,evening_table_id FROM games WHERE id=?', [gameId],
    );
    if (!row) fail('Протокол не найден');
    let payload: any = null;
    try { payload = JSON.parse(row.protocol_text); } catch { fail('Некорректный протокол'); }
    if (payload?.kind !== 'club_evening_protocol' || isCompletedClubGame(payload) ||
        !Array.isArray(payload?.player_results)) fail('Протокол недоступен для обмена');
    const a = payload.player_results.find((entry: any) => String(entry.player_id || '') === order.player_id);
    const b = payload.player_results.find((entry: any) => String(entry.player_id || '') === order.target_player_id);
    if (!a || !b || a === b) fail('Состав игры изменился');
    const seatA = Number(a.seat_number); const seatB = Number(b.seat_number);
    if (!Number.isInteger(seatA) || !Number.isInteger(seatB)) fail('Некорректные места');
    if (a.role || b.role || payload.player_results.some((entry: any) => entry.role)) fail('Роли уже назначены');

    // Keep the table-specific cycle semantics, not a permanent ban on any
    // repeated position. Evaluate both moves against the evening's plan.
    const planExists = await tx.get<any>(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='evening_seat_plans'",
    );
    const plans: Array<{ id: string; slot_id: string; table_id: string; seat_number: number; player_id: string; started: number; locked: number; created_at: string; updated_at: string; game: number }> = planExists
      ? await tx.all(
        `SELECT b.*, s.slot_number AS game FROM evening_seat_plans b
          JOIN evening_game_slots s ON s.id=b.slot_id
         WHERE b.evening_id=?`, [game.eventId],
      ) : [];
    const tablePlans = plans.filter(entry => entry.table_id === row.evening_table_id);
    const matching = tablePlans.filter(entry =>
      Number(entry.started) === 1 &&
      ((entry.player_id === order.player_id && entry.seat_number === seatA)
        || (entry.player_id === order.target_player_id && entry.seat_number === seatB)));
    // Both seats must be from the SAME explicit planned slot if either has
    // been recorded; never guess from the global game number.
    const slotIds = [...new Set(matching.map(entry => entry.slot_id))];
    if (slotIds.length > 1) fail('Нельзя однозначно связать места с планом игры');
    const matchingPlan = slotIds.length === 1
      ? tablePlans.filter(entry => entry.slot_id === slotIds[0] && Number(entry.started) === 1)
      : [];
    const planA = matchingPlan.find(entry => entry.player_id === order.player_id && entry.seat_number === seatA);
    const planB = matchingPlan.find(entry => entry.player_id === order.target_player_id && entry.seat_number === seatB);
    if (slotIds.length && (!planA || !planB)) fail('Фактическая рассадка не совпадает с составом игры');
    if (planA && planB) {
      const timeline: EveningSeat[] = plans.filter(entry => entry.id !== planA.id && entry.id !== planB.id)
        .map(entry => ({ game: entry.game, tableId: entry.table_id, seat: entry.seat_number,
          playerId: entry.player_id, started: Boolean(entry.started) }));
      const gameNumber = planA.game;
      const firstMove: EveningSeat = { game: gameNumber, tableId: String(row.evening_table_id), seat: seatB, playerId: order.player_id, started: true };
      const secondMove: EveningSeat = { game: gameNumber, tableId: String(row.evening_table_id), seat: seatA, playerId: order.target_player_id, started: true };
      const warningsA = seatingWarnings(firstMove, [...timeline, secondMove], [gameNumber]);
      const warningsB = seatingWarnings(secondMove, [...timeline, firstMove], [gameNumber]);
      if ([...warningsA,...warningsB].some(warning => warning.code === 'repeat_seat')) {
        fail('Обмен нарушает цикл неповторяющихся мест за столом');
      }
      // The two seats have UNIQUE slot/table/number indexes. Delete and
      // restore both rows in the same transaction to avoid a transient clash.
      await tx.run('DELETE FROM evening_seat_plans WHERE id IN (?,?)', [planA.id,planB.id]);
      for (const [entry,seat] of [[planA,seatB],[planB,seatA]] as const) {
        await tx.run(
          `INSERT INTO evening_seat_plans
          (id,evening_id,slot_id,table_id,seat_number,player_id,locked,started,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [entry.id,game.eventId,entry.slot_id,entry.table_id,seat,entry.player_id,entry.locked,entry.started,entry.created_at,new Date().toISOString()],
        );
      }
    }
    a.seat_number = seatB;
    b.seat_number = seatA;
    // Keep the legacy slots snapshot consistent with the canonical protocol:
    // payment/attendance readers may still use slots_json for older games.
    let slots: any[] = [];
    try { slots = JSON.parse(String(row.slots_json || '[]')); } catch { slots = []; }
    if (!Array.isArray(slots)) slots = [];
    for (const slot of slots) {
      if (String(slot.player_id || '') === order.player_id) slot.slot_num = seatB;
      else if (String(slot.player_id || '') === order.target_player_id) slot.slot_num = seatA;
    }
    slots.sort((first,second) => Number(first.slot_num)-Number(second.slot_num));
    // Players and their paid role purchases remain identified by player_id.
    await tx.run('UPDATE games SET protocol_text=?,slots_json=? WHERE id=?',
      [JSON.stringify(payload), JSON.stringify(slots), gameId]);
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
