import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { notifyBettingSpectators } from '../services/bettingNotificationService.ts';
import {
  BettingClosedError,
  BettingNotFoundError,
  BettingValidationError,
  openBetPoolForGame,
  reconcileAllBettingPools,
} from '../services/bettingPoolService.ts';

const router = Router();

router.post('/betting/reconcile', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    const changed = await reconcileAllBettingPools(db);
    res.json({ success: true, changed });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось пересчитать ставки' });
  }
});

router.post('/:gameId/betting/open', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const db = (req as any).db as DatabaseWrapper;
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
