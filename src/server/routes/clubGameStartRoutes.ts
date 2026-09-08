import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { startClubGameLifecycle } from '../services/clubGameStartService.ts';
import { BettingClosedError, BettingNotFoundError, BettingValidationError } from '../services/bettingPoolService.ts';

const router = Router();

router.post('/:gameId/start', requireOrganizerAuth, async (req, res) => {
  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
  try {
    const result = await startClubGameLifecycle(req.db, { gameId, roles });
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error: any) {
    if (error instanceof BettingNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof BettingValidationError || error instanceof BettingClosedError) return res.status(409).json({ error: error.message });
    return res.status(400).json({ error: error?.message || 'Не удалось зафиксировать старт клубной игры' });
  }
});

export default router;
