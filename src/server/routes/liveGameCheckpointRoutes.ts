import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { loadLiveGameCheckpoint, normalizeCheckpoint, parseLiveGameKind, saveLiveGameCheckpoint } from '../services/liveGameCheckpointService.ts';

/** «Продолжить игру»: the server copy of a running game's engine session, for any game (`/api/live-checkpoints/club/7`, `/tournament/<id>`). */
const router = Router();

const target = (params: Record<string, string>) => {
  const kind = parseLiveGameKind(params.kind);
  const id = String(params.id || '').trim();
  if (!kind || !id || (kind === 'club' && !(Number.isInteger(Number(id)) && Number(id) > 0))) return null;
  return { kind, id };
};

router.put('/:kind/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const game = target(req.params as any);
    if (!game) return res.status(400).json({ error: 'Игра не найдена' });
    const checkpoint = normalizeCheckpoint(req.body);
    if (!checkpoint) return res.status(400).json({ error: 'Некорректное сохранение игры' });
    const result = await saveLiveGameCheckpoint(req.db || (await getDb()), game.kind, game.id, checkpoint);
    if (result === 'missing') return res.status(404).json({ error: 'Игра не найдена' });
    if (result === 'finished') return res.status(409).json({ error: 'Игра уже завершена' });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить игру на сервере' });
  }
});

router.get('/:kind/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const game = target(req.params as any);
    if (!game) return res.status(400).json({ error: 'Игра не найдена' });
    res.setHeader('Cache-Control', 'no-store');
    const checkpoint = await loadLiveGameCheckpoint(req.db || (await getDb()), game.kind, game.id);
    if (!checkpoint) return res.status(404).json({ error: 'Сохранения игры на сервере нет' });
    return res.json(checkpoint);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить игру с сервера' });
  }
});

export default router;
