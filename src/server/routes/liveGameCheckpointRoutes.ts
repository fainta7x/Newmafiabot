import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { parseGameKey } from '../../shared/game.ts';
import { loadLiveGameCheckpoint, normalizeCheckpoint, saveLiveGameCheckpoint } from '../services/liveGameCheckpointService.ts';

/** «Продолжить игру» for any game: `/api/live-checkpoints/club:7`, `/api/live-checkpoints/tournament:<id>` (organizer only). */
const router = Router();

router.put('/:key', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const key = String(req.params.key || '');
    if (!parseGameKey(key)) return res.status(400).json({ error: 'Игра не найдена' });
    const checkpoint = normalizeCheckpoint(req.body);
    if (!checkpoint) return res.status(400).json({ error: 'Некорректное сохранение игры' });
    const result = await saveLiveGameCheckpoint(req.db || (await getDb()), key, checkpoint);
    if (result === 'missing') return res.status(404).json({ error: 'Игра не найдена' });
    if (result === 'finished') return res.status(409).json({ error: 'Игра уже завершена' });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить игру на сервере' });
  }
});

router.get('/:key', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const key = String(req.params.key || '');
    if (!parseGameKey(key)) return res.status(400).json({ error: 'Игра не найдена' });
    res.setHeader('Cache-Control', 'no-store');
    const checkpoint = await loadLiveGameCheckpoint(req.db || (await getDb()), key);
    if (!checkpoint) return res.status(404).json({ error: 'Сохранения игры на сервере нет' });
    return res.json(checkpoint);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить игру с сервера' });
  }
});

export default router;
