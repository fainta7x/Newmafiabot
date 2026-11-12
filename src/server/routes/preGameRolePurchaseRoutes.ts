import { Router } from 'express';
import { loadGameOrderTokenPrices } from '../services/gameTokenPaymentService.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import { getDb } from '../../db/index.ts';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { getGame, listEventGames } from '../services/gameService.ts';
import {
  cancelPreGameRolePurchase,
  chooseGameForDeferredRolePurchase,
  reserveRoleBeforeDeal,
  ensurePreGameRolePurchaseSchema,
} from '../services/preGameRolePurchaseService.ts';
import type { GameRole } from '../../shared/gameRoles.ts';
import { orderGameSeatSwap,applyGameSeatSwap,cancelGameSeatSwap,ensureGameSeatSwapSchema } from '../services/gameSeatSwapOrderService.ts';
import {
  orderGameMusic, markGameMusicPlayed, cancelGameMusicOrder,
  ensureGameMusicOrderSchema,
} from '../services/gameMusicOrderService.ts';

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

/** The existing shop uses the same server-backed order as the game page.
 * Only future games where this player is already seated are suggested.
 * No reserved-role availability, purchase count or other buyers are included.
 */
playerRouter.get('/role-purchase-games', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в личный кабинет' });
  try {
    const db = req.db || await getDb();
    const events = await db.all<{ id: string; title: string }>(
      `SELECT e.id, e.title FROM game_evenings e
        JOIN evening_participants p ON p.evening_id=e.id
       WHERE p.player_id=? AND ${openEveningSql('e')}
       ORDER BY datetime(e.starts_at) ASC LIMIT 30`,
      [playerId],
    );
    const games: Array<{ gameId: number; eveningId: string; eveningTitle: string; number: number }> = [];
    for (const event of events) {
      const entries = await listEventGames(db, 'evening', event.id);
      for (const game of entries) {
        if (game.storage !== 'club' || !['CASUAL', 'NOVICE'].includes(game.format) || game.status === 'completed' ||
            game.status === 'archived' || game.status === 'cancelled' ||
            !game.seats.some((seat) => seat.playerId === playerId)) continue;
        const deal = await db.get(
          'SELECT 1 FROM game_role_deals WHERE game_key=? LIMIT 1',
          [`club:${Number(game.id)}`],
        ).catch(() => null);
        if (deal) continue;
        games.push({
          gameId: Number(game.id), eveningId: event.id,
          eveningTitle: event.title, number: game.number ?? 0,
        });
      }
    }
    res.set('Cache-Control', 'private, no-store');
    return res.json({ games });
  } catch (error: any) { return onError(res, error); }
});

/** Token prices of a role and a song and the player's balance, for the choice «рубли или жетоны». */
playerRouter.get('/game-order-token-prices', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в личный кабинет' });
  try {
    const db = req.db || await getDb();
    const tokenPrices = await loadGameOrderTokenPrices(db);
    const balance = Number((await db.get<{ tokens: number }>('SELECT tokens FROM players WHERE id = ?', [playerId]))?.tokens || 0);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ tokenPrices, balance });
  } catch (error: any) { return onError(res, error); }
});

/** Unified shop choices for music (all club-evening formats), role and seat swap.
 * Contains only published seating, never role assignments or purchase data.
 */
playerRouter.get('/game-purchase-options', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в личный кабинет' });
  try {
    const db = req.db || await getDb();
    const events = await db.all<{ id: string; title: string }>(
      `SELECT DISTINCT e.id,e.title FROM game_evenings e
        JOIN evening_participants ep ON ep.evening_id=e.id
       WHERE ep.player_id=? AND ${openEveningSql('e')}
       ORDER BY datetime(e.starts_at) LIMIT 30`,
      [playerId],
    );
    const games: Array<any> = [];
    for (const event of events) {
      const entries = await listEventGames(db, 'evening', event.id);
      for (const game of entries) {
        if (game.storage !== 'club' ||
            ['completed','archived','cancelled'].includes(game.status)) continue;
        const ownSeat = game.seats.find((seat) => seat.playerId === playerId);
        if (!ownSeat) continue;
        const deal = await db.get('SELECT 1 FROM game_role_deals WHERE game_key=?',
          [`club:${Number(game.id)}`]).catch(() => null);
        games.push({
          gameId: Number(game.id), eveningId: event.id,
          eveningTitle: event.title, number: game.number ?? Number(game.id),
          format: game.format,
          canRoleOrSwap: !deal && ['CASUAL','NOVICE'].includes(game.format),
          ownSeat: ownSeat.seat,
          seats: game.seats.map((seat) => ({ seat_number: seat.seat, player_id: seat.playerId, nickname: seat.nickname })),
        });
      }
    }
    res.set('Cache-Control','private, no-store');
    // Token prices of a role and a song (from the shop) and the player's balance, for «рубли или жетоны».
    const tokenPrices = await loadGameOrderTokenPrices(db);
    const balance = Number((await db.get<{ tokens: number }>('SELECT tokens FROM players WHERE id = ?', [playerId]))?.tokens || 0);
    return res.json({ games, tokenPrices, balance });
  } catch (error: any) { return onError(res,error); }
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
    const order = await reserveRoleBeforeDeal(db, gameId, playerId, role, req.body?.payment === 'tokens' ? 'tokens' : 'rubles');
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ orderId: order.id, accepted: true, priceRub: order.priceRub, ...(order.paidWithTokens ? { paidWithTokens: order.paidWithTokens } : {}) });
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

playerRouter.post('/seat-swap-orders', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в ЛК' });
  const gameId = Number(req.body?.gameId);
  const target = String(req.body?.targetPlayerId || '');
  if (!Number.isInteger(gameId) || gameId <= 0 || !target) return res.status(400).json({ error: 'Выберите игру и игрока' });
  try {
    const db = req.db || await getDb();
    const order = await orderGameSeatSwap(db, gameId, playerId, target);
    res.set('Cache-Control','private, no-store');
    return res.status(201).json({ orderId: order.id, priceRub: order.priceRub });
  } catch (error: any) { return onError(res,error); }
});

playerRouter.get('/seat-swap-orders', async (req,res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в ЛК' });
  try {
    const db = req.db || await getDb();
    await ensureGameSeatSwapSchema(db);
    const orders = await db.all(
      'SELECT id,game_id,target_player_id,status,amount_rub,created_at FROM game_seat_swap_orders WHERE player_id=? ORDER BY created_at DESC LIMIT 100',
      [playerId],
    );
    res.set('Cache-Control','private, no-store');
    return res.json({ orders });
  } catch (error: any) { return onError(res,error); }
});

adminRouter.get('/seat-swap-orders', async (req,res) => {
  const gameId = Number(req.query.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Укажите игру' });
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const judge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (judge && game.judgePlayerId !== judge) return res.status(403).json({ error: 'Нет прав судьи игры' });
    await ensureGameSeatSwapSchema(db);
    const orders = await db.all(
      'SELECT id,player_id,target_player_id,status,amount_rub,created_at FROM game_seat_swap_orders WHERE game_id=? ORDER BY created_at',
      [gameId],
    );
    res.set('Cache-Control','private, no-store');
    return res.json({ orders });
  } catch (error: any) { return onError(res,error); }
});

adminRouter.post('/seat-swap-orders', async (req,res) => {
  const gameId = Number(req.body?.gameId);
  const playerId = String(req.body?.playerId || '');
  const target = String(req.body?.targetPlayerId || '');
  if (!Number.isInteger(gameId) || gameId <= 0 || !playerId || !target)
    return res.status(400).json({ error: 'Укажите игру и двух игроков' });
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const judge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (judge && game.judgePlayerId !== judge) return res.status(403).json({ error: 'Нет прав судьи игры' });
    const order = await orderGameSeatSwap(db, gameId, playerId, target);
    res.set('Cache-Control','private, no-store');
    return res.status(201).json({ orderId: order.id, priceRub: order.priceRub });
  } catch (error: any) { return onError(res,error); }
});

adminRouter.post('/seat-swap-orders/:orderId/apply', async (req,res) => {
  const gameId = Number(req.body?.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Укажите игру' });
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const judge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (judge && game.judgePlayerId !== judge) return res.status(403).json({ error: 'Нет прав судьи игры' });
    return res.json(await applyGameSeatSwap(db, String(req.params.orderId), gameId));
  } catch (error: any) { return onError(res,error); }
});

adminRouter.delete('/seat-swap-orders/:orderId', async (req,res) => {
  try {
    const db = req.db || await getDb();
    return res.json(await cancelGameSeatSwap(db,String(req.params.orderId)));
  } catch (error: any) { return onError(res,error); }
});

/** All personal song requests remain private, not part of the public game view. */
playerRouter.post('/music-orders', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в ЛК' });
  const gameId = Number(req.body?.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Укажите игру' });
  try {
    const db = req.db || await getDb();
    const result = await orderGameMusic(db, gameId, playerId, req.body?.track, false, req.body?.payment === 'tokens' ? 'tokens' : 'rubles');
    res.set('Cache-Control', 'private, no-store');
    return res.status(201).json({ orderId: result.id, priceRub: result.priceRub, ...(result.paidWithTokens ? { paidWithTokens: result.paidWithTokens } : {}) });
  } catch (error: any) { return onError(res, error); }
});

playerRouter.get('/music-orders', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход в ЛК' });
  try {
    const db = req.db || await getDb();
    await ensureGameMusicOrderSchema(db);
    const orders = await db.all(
      'SELECT id,game_id,track_reference,status,amount_rub,created_at FROM game_music_orders WHERE player_id=? ORDER BY created_at DESC LIMIT 100',
      [playerId],
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ orders });
  } catch (error: any) { return onError(res, error); }
});

adminRouter.post('/music-orders', async (req, res) => {
  const gameId = Number(req.body?.gameId);
  const playerId = String(req.body?.playerId || '');
  if (!Number.isInteger(gameId) || gameId <= 0 || !playerId) return res.status(400).json({ error: 'Укажите игру и игрока' });
  try {
    const db = req.db || await getDb();
    const judge = (req as AuthenticatedRequest).delegatedPlayerId;
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    if (judge && game.judgePlayerId !== judge) return res.status(403).json({ error: 'Нет прав судьи игры' });
    const result = await orderGameMusic(db, gameId, playerId, req.body?.track, true);
    res.set('Cache-Control', 'private, no-store');
    return res.status(201).json({ orderId: result.id, priceRub: result.priceRub });
  } catch (error: any) { return onError(res, error); }
});

adminRouter.get('/music-orders', async (req, res) => {
  const gameId = Number(req.query.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Укажите игру' });
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const judge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (judge && game.judgePlayerId !== judge) return res.status(403).json({ error: 'Нет прав судьи игры' });
    await ensureGameMusicOrderSchema(db);
    const orders = await db.all(
      'SELECT id,player_id,track_reference,status,amount_rub,created_at FROM game_music_orders WHERE game_id=? ORDER BY created_at',
      [gameId],
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ orders });
  } catch (error: any) { return onError(res, error); }
});

adminRouter.post('/music-orders/:orderId/played', async (req, res) => {
  const gameId = Number(req.body?.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Укажите игру' });
  try {
    const db = req.db || await getDb();
    const game = await getGame(db, `club:${gameId}`);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const judge = (req as AuthenticatedRequest).delegatedPlayerId;
    if (judge && game.judgePlayerId !== judge) return res.status(403).json({ error: 'Нет прав судьи игры' });
    return res.json(await markGameMusicPlayed(db, String(req.params.orderId), gameId));
  } catch (error: any) { return onError(res, error); }
});

adminRouter.delete('/music-orders/:orderId', async (req, res) => {
  try {
    const db = req.db || await getDb();
    return res.json(await cancelGameMusicOrder(db, String(req.params.orderId)));
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
