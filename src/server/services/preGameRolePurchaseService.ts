import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { decideRoleReservation, type RoleReservation } from '../../lib/rolePurchaseReservation.ts';
import type { GameRole } from '../../shared/gameRoles.ts';
import { getGame } from './gameService.ts';
import { reconcileRegularEveningPayments, reconcileOtherFormatExtensions } from './eveningPaymentPricingService.ts';

export const PRE_GAME_ROLE_PRICE_RUB = 150;

type OrderRow = {
  id: string; game_id: number; evening_id: string; player_id: string;
  role: GameRole; status: RoleReservation['status']; created_at: string;
};

const failure = (message: string, statusCode = 409): never => {
  throw Object.assign(new Error(message), { statusCode });
};

/** The same order entity is shared by direct player checkout and judge's in-person checkout. */
export async function ensurePreGameRolePurchaseSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS game_role_reservations (
    id TEXT PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('citizen','sheriff','mafia','don')),
    status TEXT NOT NULL CHECK (status IN ('reserved','deferred','cancelled','fulfilled')),
    amount_rub INTEGER NOT NULL DEFAULT 150,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_role_reservations_game ON game_role_reservations(game_id, status);
  CREATE INDEX IF NOT EXISTS idx_game_role_reservations_evening ON game_role_reservations(evening_id, status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_game_role_one_active_per_player
    ON game_role_reservations(game_id, player_id)
    WHERE status IN ('reserved','fulfilled');`);
}

const asDomain = (row: OrderRow): RoleReservation => ({
  id: row.id, gameId: row.game_id, eveningId: row.evening_id,
  playerId: row.player_id, role: row.role, status: row.status, createdAt: row.created_at,
});

async function syncEvening(db: DatabaseWrapper, eveningId: string) {
  await reconcileRegularEveningPayments(db, eveningId);
  await reconcileOtherFormatExtensions(db, eveningId);
}

/**
 * Atomic purchase: validates the real game composition and its deal state,
 * writes the reservation, then reconciles the evening amount_due inside the
 * SAME DB transaction. No role/other buyer details are returned.
 *
 * This service is not exposed by an HTTP route until actor authentication
 * and the buyer's game membership are enforced at that boundary.
 */
export async function reserveRoleBeforeDeal(
  db: DatabaseWrapper,
  gameId: number,
  playerId: string,
  role: GameRole,
): Promise<{ id: string; status: 'reserved' | 'deferred'; priceRub: number }> {
  await ensurePreGameRolePurchaseSchema(db);
  return db.transaction(async (tx) => {
    const game = await getGame(tx, `club:${gameId}`);
    if (!game || game.storage !== 'club' || !game.eventId) failure('Игра не найдена', 404);
    // The live engine may mark a prepared game as 'running' before the
    // first role is dealt. The precise cutoff is the persisted deal itself.
    if (['completed', 'cancelled', 'archived'].includes(game.status) || !['published', 'active'].includes(String(game.eventStatus))) failure('Покупки для этой игры закрыты');
    if (!game.seats.some((seat) => seat.playerId === playerId)) failure('Игрок не участвует в этой игре', 403);

    // A deal row exists as soon as dealing starts, even before the first card.
    const deal = await tx.get('SELECT 1 FROM game_virtual_role_deals WHERE game_id = ? LIMIT 1', [gameId])
      .catch(() => null); // An older DB may not yet have the virtual-deal table.
    const existingRows = await tx.all<OrderRow>(
      'SELECT id, game_id, evening_id, player_id, role, status, created_at FROM game_role_reservations WHERE game_id = ?',
      [gameId],
    );
    const decision = decideRoleReservation({
      gameId,
      tableSize: game.seats.length,
      format: game.format,
      playerId,
      role,
      reservations: existingRows.map(asDomain),
      dealStarted: Boolean(deal),
    });

    // Duplicate pending requests also must not accrue an additional charge.
    if (existingRows.some((item) => item.player_id === playerId && item.status === 'deferred')) {
      failure('У игрока уже есть незавершённая покупка роли для этой игры');
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    await tx.run(
      `INSERT INTO game_role_reservations
       (id,game_id,evening_id,player_id,role,status,amount_rub,created_at,updated_at)
       VALUES (?,?,?,?,?,?,150,?,?)`,
      [id, gameId, game.eventId, playerId, role, decision.status, now, now],
    );
    await syncEvening(tx, game.eventId);
    return { id, status: decision.status, priceRub: PRE_GAME_ROLE_PRICE_RUB };
  });
}

/**
 * Organizer-only write endpoint must verify administrator authorization.
 * An active card reservation is freed immediately; the evening charge is
 * reversed by the same reconciliation that created it.
 */
export async function cancelPreGameRolePurchase(db: DatabaseWrapper, orderId: string) {
  await ensurePreGameRolePurchaseSchema(db);
  return db.transaction(async (tx) => {
    const row = await tx.get<OrderRow>(
      'SELECT id, game_id, evening_id, player_id, role, status, created_at FROM game_role_reservations WHERE id = ?',
      [orderId],
    );
    if (!row) failure('Заказ не найден', 404);
    if (row.status === 'fulfilled') failure('Нельзя отменить уже исполненный заказ');
    if (row.status === 'cancelled') return { cancelled: true };
    await tx.run(
      "UPDATE game_role_reservations SET status='cancelled', updated_at=? WHERE id=?",
      [new Date().toISOString(), orderId],
    );
    await syncEvening(tx, row.evening_id);
    return { cancelled: true };
  });
}

/**
 * Called from the existing evening-closeout transaction when that integration
 * is wired. Settling an evening always revokes unfulfilled paid reservations.
 */
export async function cancelOutstandingRolePurchasesForEvening(db: DatabaseWrapper, eveningId: string) {
  await ensurePreGameRolePurchaseSchema(db);
  return db.transaction(async (tx) => {
    const change = await tx.run(
      `UPDATE game_role_reservations SET status='cancelled', updated_at=?
        WHERE evening_id=? AND status IN ('reserved','deferred')`,
      [new Date().toISOString(), eveningId],
    );
    if (change.changes) await syncEvening(tx, eveningId);
    return { cancelled: Number(change.changes) };
  });
}

/**
 * Once the game for a deferred order has finished, the buyer chooses another
 * concrete game of the SAME evening. The original payment survives transfer;
 * it is never added a second time.
 */
export async function chooseGameForDeferredRolePurchase(
  db: DatabaseWrapper,
  orderId: string,
  buyerPlayerId: string,
  nextGameId: number,
): Promise<{ id: string; accepted: true }> {
  await ensurePreGameRolePurchaseSchema(db);
  return db.transaction(async (tx) => {
    const row = await tx.get<OrderRow>(
      'SELECT id, game_id, evening_id, player_id, role, status, created_at FROM game_role_reservations WHERE id=?',
      [orderId],
    );
    if (!row || row.player_id !== buyerPlayerId) failure('Заказ не найден', 404);
    if (row.status !== 'deferred') failure('Этот заказ не ожидает переноса');
    const original = await getGame(tx, `club:${row.game_id}`);
    if (!original || original.status !== 'completed') failure('Выбрать следующую игру можно после завершения текущей');
    if (row.game_id === nextGameId) failure('Выберите другую игру');
    const game = await getGame(tx, `club:${nextGameId}`);
    if (!game || game.eventId !== row.evening_id || game.storage !== 'club') failure('Игра не относится к этому вечеру');
    if (game.status !== 'planned') failure('На выбранную игру покупки закрыты');
    if (!game.seats.some((seat) => seat.playerId === buyerPlayerId)) failure('Игрок не участвует в выбранной игре', 403);
    const deal = await tx.get(
      'SELECT 1 FROM game_virtual_role_deals WHERE game_id=? LIMIT 1', [nextGameId],
    ).catch(() => null);
    const orders = await tx.all<OrderRow>(
      'SELECT id, game_id, evening_id, player_id, role, status, created_at FROM game_role_reservations WHERE game_id=?',
      [nextGameId],
    );
    const decision = decideRoleReservation({
      gameId: nextGameId, tableSize: game.seats.length, format: game.format,
      playerId: buyerPlayerId, role: row.role, dealStarted: Boolean(deal),
      reservations: orders.map(asDomain),
    });
    if (orders.some((order) => order.player_id === buyerPlayerId && order.status === 'deferred')) {
      failure('На эту игру уже оформлен заказ');
    }
    await tx.run(
      'UPDATE game_role_reservations SET game_id=?, status=?, updated_at=? WHERE id=?',
      [nextGameId, decision.status, new Date().toISOString(), orderId],
    );
    // The existing order remains payable once, irrespective of new outcome.
    return { id: orderId, accepted: true };
  });
}
