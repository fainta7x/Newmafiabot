import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { getGame } from '../services/gameService.ts';
import {
  cancelPreGameRolePurchase,
  chooseGameForDeferredRolePurchase,
  reserveRoleBeforeDeal,
  ensurePreGameRolePurchaseSchema,
} from '../services/preGameRolePurchaseService.ts';
import type { GameRole } from '../../shared/gameRoles.ts';

const playerRouter = Router();
const adminRouter = Router();
adminRouter.use(requireOrganizerAuth);

const roleValue = (value: unknown): GameRole | null =>
  ['citizen', 'sheriff', 'mafia', 'don'].includes(String(value))
    ? String(value) as GameRole : null;

const onError = (res: any, error: any) =>
  res.status(Number(error?.statusCode || 500)).json({
    error: error?.statusCode ? error.message : 'Не удалось оформить покупку',
  });

/** The browser gets NO capacity, current reservation count or conflicting buyer. */
playerRouter.post('/role-purchases', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в личный кабинет' });
  const gameId = Number(req.body?.gameId);
  const role = roleValue(req.body?.role);
  if (!Number.isInteger(gameId) || gameId <= 0 || !role) return res.status(400).json({ error: 'Выберите игру и роль' });
  try {
    const db = req.db || await getDb();
    const order = await reserveRoleBeforeDeal(db, gameId, playerId, role);
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ orderId: order.id, accepted: true, priceRub: order.priceRub });
  } catch (error: any) { return onError(res, error); }
});

playerRouter.post('/role-purchases/:orderId/select-game', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в личный кабинет' });
  const gameId = Number(req.body?.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Выберите игру' });
  try {
    const db = req.db || await getDb();
    const result = await chooseGameForDeferredRolePurchase(db, String(req.params.orderId), playerId, gameId);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error: any) { return onError(res, error); }
});

/** Only the buyer can inspect the role in their own paid orders. */
playerRouter.get('/role-purchases', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в личный кабинет' });
  try {
    const db = req.db || await getDb();
    await ensurePreGameRolePurchaseSchema(db);
    const rows = await db.all(
      `SELECT id, game_id, evening_id, role, status, amount_rub, created_at
         FROM game_role_reservations WHERE player_id=? ORDER BY created_at DESC LIMIT 100`,
      [playerId],
    );
    // A deferred order must not reveal that the requested role was already
    // purchased by someone else while this game is still in progress.
    const orders = await Promise.all((rows as Array<any>).map(async (row) => {
      if (row.status !== 'deferred') return row;
      const game = await getGame(db, `club:${row.game_id}`);
      return game?.status === 'completed' || game?.status === 'cancelled'
        ? row
        : { ...row, status: 'processing' };
    }));
    res.set('Cache-Control', 'no-store');
    return res.json({ orders });
  } catch (error: any) { return onError(res, error); }
});

/** Explicit admin lookup: never shipped as a push notification.
 * This management route requires authenticated organizer privileges.
 */
adminRouter.get('/role-purchases', async (req, res) => {
  const gameId = Number(req.query.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'Укажите игру' });
  }
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const actingJudge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (actingJudge && game.judgePlayerId !== actingJudge) {
      return res.status(403).json({ error: 'Нет прав судьи этой игры' });
    }
    await ensurePreGameRolePurchaseSchema(db);
    const orders = await db.all(
      `SELECT id, player_id, role, status, amount_rub, created_at
         FROM game_role_reservations WHERE game_id=?
         ORDER BY created_at ASC`,
      [gameId],
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ gameId, orders });
  } catch (error: any) { return onError(res, error); }
});

/** The organizer may always cancel, including while sitting at the table. */
adminRouter.delete('/role-purchases/:orderId', async (req, res) => {
  try {
    const db = req.db || await getDb();
    return res.json(await cancelPreGameRolePurchase(db, String(req.params.orderId)));
  } catch (error: any) { return onError(res, error); }
});

/** Organizer-initiated purchase (e.g. the player's gesture at the table).
 * Access to the organizer session is authenticated by requireOrganizerAuth.
 * Judge-only delegated permissions must be validated before granting access.
 */
adminRouter.post('/role-purchases', async (req, res) => {
  const gameId = Number(req.body?.gameId);
  const role = roleValue(req.body?.role);
  const playerId = String(req.body?.playerId || '');
  if (!Number.isInteger(gameId) || gameId <= 0 || !role || !playerId) {
    return res.status(400).json({ error: 'Укажите игру, игрока и роль' });
  }
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    // The organizer role is necessary for this route; this check also
    // protects delegated judge access when organizer middleware delegates it.
    const actingJudge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (actingJudge && game.judgePlayerId !== actingJudge) {
      return res.status(403).json({ error: 'Нет прав судьи этой игры' });
    }
    const order = await reserveRoleBeforeDeal(db, gameId, playerId, role);
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ orderId: order.id, accepted: true, priceRub: order.priceRub });
  } catch (error: any) { return onError(res, error); }
});

export { playerRouter as playerRolePurchaseRoutes, adminRouter as adminRolePurchaseRoutes };
