import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { notifyBettingSpectators } from '../services/bettingNotificationService.ts';
import {
  BettingClosedError,
  BettingNotFoundError,
  BettingValidationError,
  calculatePoolCoefficient,
  openBetPoolForGame,
  parseRoleSnapshot,
  reconcileAllBettingPools,
  refundBetPool,
  settleBetPool,
} from '../services/bettingPoolService.ts';

const router = Router();

const writeBettingAudit = async (db: DatabaseWrapper, input: {
  gameId: number;
  action: string;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}) => {
  try {
    await db.run(
      `INSERT INTO admin_change_log
       (id, entity_type, entity_id, action, field_name, before_json, after_json, note, actor_type, created_at)
       VALUES (?, 'betting_pool', ?, ?, NULL, ?, ?, ?, 'organizer', ?)`,
      [
        `acl_${randomUUID()}`,
        String(input.gameId),
        input.action,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.note?.trim() || null,
        new Date().toISOString(),
      ],
    );
  } catch (error) {
    console.warn('[BETS] Could not write organizer audit:', error);
  }
};

router.get('/betting/admin/overview', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await reconcileAllBettingPools(db);
    const pools = await db.all<any>(`
      SELECT bp.*
        FROM betting_pools bp
       ORDER BY bp.created_at DESC, bp.id DESC
       LIMIT 100
    `);

    const items = await Promise.all(pools.map(async (pool: any) => {
      const bets = await db.all<any>(`
        SELECT bb.id, bb.player_id, p.nickname, bb.team, bb.amount, bb.status,
               bb.payout_amount, bb.final_coefficient, bb.placed_at, bb.settled_at
          FROM betting_bets bb
          JOIN players p ON p.id = bb.player_id
         WHERE bb.pool_id = ?
         ORDER BY bb.placed_at ASC, bb.id ASC
      `, [pool.id]);
      const redPool = Number(pool.red_pool || 0);
      const blackPool = Number(pool.black_pool || 0);
      return {
        ...pool,
        red_pool: redPool,
        black_pool: blackPool,
        reserve_amount: Number(pool.reserve_amount || 0),
        house_rate_bps: Number(pool.house_rate_bps || 0),
        max_coefficient: Number(pool.max_coefficient || 10),
        red_coefficient: calculatePoolCoefficient(redPool, blackPool, pool.house_rate_bps, pool.max_coefficient),
        black_coefficient: calculatePoolCoefficient(blackPool, redPool, pool.house_rate_bps, pool.max_coefficient),
        role_snapshot: parseRoleSnapshot(pool),
        total_staked: redPool + blackPool,
        bet_count: bets.length,
        total_paid_out: bets.reduce((sum: number, bet: any) => sum + Number(bet.payout_amount || 0), 0),
        bets,
      };
    }));

    const summary = {
      pools: items.length,
      open: items.filter((item) => item.status === 'open').length,
      unsettled: items.filter((item) => item.status === 'closed').length,
      settled: items.filter((item) => item.status === 'settled').length,
      refunded: items.filter((item) => item.status === 'refunded').length,
      reserve_total: items.reduce((sum, item) => sum + Number(item.reserve_amount || 0), 0),
    };
    return res.json({ summary, pools: items });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить управление ставками' });
  }
});

router.post('/betting/reconcile', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const changed = await reconcileAllBettingPools(db);
    res.json({ success: true, changed });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось пересчитать ставки' });
  }
});

router.post('/:gameId/betting/close', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = req.db as DatabaseWrapper;
    const before = await db.get<any>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
    if (!before) return res.status(404).json({ error: 'Ставки на игру не найдены' });
    if (before.status !== 'open') return res.status(409).json({ error: 'Вручную закрыть можно только открытую линию' });
    const now = new Date().toISOString();
    await db.run("UPDATE betting_pools SET status = 'closed', closes_at = ?, updated_at = ? WHERE game_id = ? AND status = 'open'", [now, now, gameId]);
    const after = await db.get<any>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
    await writeBettingAudit(db, { gameId, action: 'manual_close', before, after, note: req.body?.note });
    return res.json({ success: true, pool: after });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось закрыть ставки' });
  }
});

router.post('/:gameId/betting/refund', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = req.db as DatabaseWrapper;
    const before = await db.get<any>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
    if (!before) return res.status(404).json({ error: 'Ставки на игру не найдены' });
    const pool = await refundBetPool(db, gameId);
    const after = await db.get<any>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
    await writeBettingAudit(db, { gameId, action: 'manual_refund', before, after, note: req.body?.note });
    return res.json({ success: true, pool });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось вернуть ставки' });
  }
});

router.post('/:gameId/betting/settle', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    const winner = String(req.body?.winner || '');
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    if (winner !== 'red' && winner !== 'black') return res.status(400).json({ error: 'Выберите победителя: красные или чёрные' });
    const db = req.db as DatabaseWrapper;
    const before = await db.get<any>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
    if (!before) return res.status(404).json({ error: 'Ставки на игру не найдены' });
    if (before.status === 'open') return res.status(409).json({ error: 'Сначала закройте приём ставок' });
    if (before.status === 'refunded') return res.status(409).json({ error: 'Возвращённый банк нельзя заново рассчитать' });
    const pool = await settleBetPool(db, gameId, winner as 'red' | 'black');
    const after = await db.get<any>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
    await writeBettingAudit(db, { gameId, action: `manual_settle_${winner}`, before, after, note: req.body?.note });
    return res.json({ success: true, pool });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось рассчитать ставки' });
  }
});

router.post('/:gameId/betting/open', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const db = req.db as DatabaseWrapper;
    const pool = await openBetPoolForGame(db, gameId, roles);
    let notification: any = { skipped: true };
    if (!pool.notified_at) {
      const protocol = Array.isArray(pool.role_snapshot) ? pool.role_snapshot : [];
      const webAppUrl = `${req.protocol}://${req.get('host')}/player`;
      notification = await notifyBettingSpectators(db, {
        gameId,
        gameNumber: pool.game_number,
        closesAt: pool.closes_at,
        judgePlayerId: pool.judge_player_id,
        roleSnapshot: protocol,
        webAppUrl,
      });
      const now = new Date().toISOString();
      await db.run('UPDATE betting_pools SET notified_at = ?, notification_count = ?, updated_at = ? WHERE id = ?', [now, Number(notification.sent || 0), now, pool.id]);
      pool.notified_at = now;
      pool.notification_count = Number(notification.sent || 0);
    }
    res.status(201).json({ success: true, pool, notification });
  } catch (error: any) {
    if (error instanceof BettingNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof BettingClosedError) return res.status(409).json({ error: error.message });
    if (error instanceof BettingValidationError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: error?.message || 'Не удалось открыть ставки' });
  }
});

export default router;
