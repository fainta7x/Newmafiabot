import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { loadLiveGameCheckpoint, normalizeCheckpoint, saveLiveGameCheckpoint } from '../services/liveGameCheckpointService.ts';

/** «Продолжить игру»: the server copy of a running club game's engine session (organizer only). */
const router = Router();

router.put('/:gameId/live-checkpoint', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Игра не найдена' });
    const checkpoint = normalizeCheckpoint(req.body);
    if (!checkpoint) return res.status(400).json({ error: 'Некорректное сохранение игры' });
    const result = await saveLiveGameCheckpoint(req.db || (await getDb()), gameId, checkpoint);
    if (result === 'missing') return res.status(404).json({ error: 'Игра не найдена' });
    if (result === 'finished') return res.status(409).json({ error: 'Игра уже завершена' });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить игру на сервере' });
  }
});

router.get('/:gameId/live-checkpoint', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Игра не найдена' });
    res.setHeader('Cache-Control', 'no-store');
    const checkpoint = await loadLiveGameCheckpoint(req.db || (await getDb()), gameId);
    if (!checkpoint) return res.status(404).json({ error: 'Сохранения игры на сервере нет' });
    return res.json(checkpoint);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить игру с сервера' });
  }
});

export default router;
