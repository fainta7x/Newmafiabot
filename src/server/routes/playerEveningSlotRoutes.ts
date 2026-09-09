import { Router, type Request, type Response } from 'express';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { getPlayerSessionId } from '../auth.ts';
import { loadEveningSlotPlan, replacePlayerSlotSelection } from '../services/eveningSlotPlanningService.ts';

const router = Router();

const sendError = (res: Response, error: any, fallback: string) =>
  res.status(Number(error?.statusCode || error?.status || 500)).json({ error: error?.message || fallback });

const requirePlayer = async (req: Request, res: Response) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }

  const player = await req.db.get<any>(
    'SELECT id, game_level FROM players WHERE id = ? LIMIT 1',
    [String(playerId)],
  );
  if (!player) {
    res.status(404).json({ error: 'Игрок не найден' });
    return null;
  }
  return player;
};

// PlayerEventSlotDetail uses this public player-session API. Keep it separate from
// organizer slot-management routes so the generic organizer endpoint cannot shadow it.
router.get('/evenings/:eveningId/slots', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;

    const plan = await loadEveningSlotPlan(req.db, String(req.params.eveningId), String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, plan.event.format)) {
      return res.status(403).json({ error: 'Этот формат вечера пока недоступен для вашего уровня' });
    }
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить игровые слоты');
  }
});

router.put('/evenings/:eveningId/slots', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    if (!Array.isArray(req.body?.slot_ids)) {
      return res.status(400).json({ error: 'Передайте список slot_ids' });
    }

    const current = await loadEveningSlotPlan(req.db, String(req.params.eveningId), String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, current.event.format)) {
      return res.status(403).json({ error: 'Этот формат вечера пока недоступен для вашего уровня' });
    }

    const plan = await replacePlayerSlotSelection(
      req.db,
      String(req.params.eveningId),
      String(player.id),
      req.body.slot_ids,
    );
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось сохранить выбор игр');
  }
});

export default router;
