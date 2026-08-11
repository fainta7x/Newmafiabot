import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import {
  BettingClosedError,
  BettingDuplicateError,
  BettingIneligibleError,
  BettingNotFoundError,
  BettingValidationError,
  getPlayerBettingDashboard,
  placePoolBet,
  type BetTeam,
} from '../services/bettingPoolService.ts';
import {
  TokenInsufficientFundsError,
  TokenPlayerNotFoundError,
} from '../services/tokenLedgerService.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const sendError = (res: any, error: any) => {
  if (error instanceof BettingNotFoundError || error instanceof TokenPlayerNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof BettingClosedError || error instanceof BettingDuplicateError || error instanceof BettingIneligibleError || error instanceof TokenInsufficientFundsError) return res.status(409).json({ error: error.message });
  if (error instanceof BettingValidationError) return res.status(400).json({ error: error.message });
  return res.status(500).json({ error: error?.message || 'Не удалось выполнить операцию со ставкой' });
};

router.get('/bets', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db as DatabaseWrapper;
    return res.json(await getPlayerBettingDashboard(db, playerId));
  } catch (error: any) {
    return sendError(res, error);
  }
});

router.post('/bets/place', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const gameId = Number(req.body?.game_id);
    const team = String(req.body?.team || '') as BetTeam;
    const amount = Number(req.body?.amount);
    const requestId = String(req.body?.request_id || '').trim();
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректная игра' });

    const db = (req as any).db as DatabaseWrapper;
    const result = await placePoolBet(db, { gameId, playerId, team, amount, requestId });
    return res.status(result.idempotent ? 200 : 201).json({ success: true, ...result });
  } catch (error: any) {
    return sendError(res, error);
  }
});

export default router;
