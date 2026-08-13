import { Router } from 'express';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import { loadEveningSlotPlan, replacePlayerSlotSelection, updateEveningSlotSettings } from '../services/eveningSlotPlanningService.ts';

export const eveningSlotRoutes = Router();

const sendError = (res: any, error: any, fallback: string) =>
  res.status(Number(error?.statusCode || error?.status || 500)).json({ error: error?.message || fallback });

const requirePlayer = async (req: any, res: any) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  const player = await req.db.get<any>('SELECT id, game_level FROM players WHERE id = ? LIMIT 1', [String(playerId)]);
  if (!player) {
    res.status(404).json({ error: 'Игрок не найден' });
    return null;
  }
  return player;
};

eveningSlotRoutes.get('/:eveningId/slots', requireOrganizerAuth, async (req, res) => {
  try {
    const plan = await loadEveningSlotPlan((req as any).db, req.params.eveningId);
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить слоты вечера');
  }
});

eveningSlotRoutes.put('/:eveningId/slots', requireOrganizerAuth, async (req, res) => {
  try {
    const plannedSlots = Number(req.body?.planned_slots);
    const pricePerGame = Number(req.body?.price_per_game);
    const slotDurationMinutes = Number(req.body?.slot_duration_minutes ?? 60);
    const startsAt = String(req.body?.starts_at || '').trim();

    if (!Number.isInteger(plannedSlots) || plannedSlots < 1 || plannedSlots > 12) {
      return res.status(400).json({ error: 'Количество игр должно быть от 1 до 12' });
    }
    if (!Number.isFinite(pricePerGame) || pricePerGame < 0) {
      return res.status(400).json({ error: 'Некорректная цена за игру' });
    }
    if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes < 15 || slotDurationMinutes > 180) {
      return res.status(400).json({ error: 'Длительность игры должна быть от 15 до 180 минут' });
    }
    if (startsAt && !Number.isFinite(new Date(startsAt).getTime())) {
      return res.status(400).json({ error: 'Некорректное время первой игры' });
    }

    const plan = await updateEveningSlotSettings((req as any).db, req.params.eveningId, {
      planned_slots: plannedSlots,
      price_per_game: pricePerGame,
      slot_duration_minutes: slotDurationMinutes,
      ...(startsAt ? { starts_at: startsAt } : {}),
    });
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось сохранить настройки игровых слотов');
  }
});

eveningSlotRoutes.get('/:eveningId/slots/me', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const plan = await loadEveningSlotPlan((req as any).db, req.params.eveningId, String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, plan.event.format)) {
      return res.status(403).json({ error: 'Этот формат вечера пока недоступен для вашего уровня' });
    }
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить игровые слоты');
  }
});

eveningSlotRoutes.put('/:eveningId/slots/me', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    if (!Array.isArray(req.body?.slot_ids)) {
      return res.status(400).json({ error: 'Передайте список slot_ids' });
    }
    const current = await loadEveningSlotPlan((req as any).db, req.params.eveningId, String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, current.event.format)) {
      return res.status(403).json({ error: 'Этот формат вечера пока недоступен для вашего уровня' });
    }
    const plan = await replacePlayerSlotSelection(
      (req as any).db,
      req.params.eveningId,
      String(player.id),
      req.body.slot_ids,
    );
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось сохранить выбор игр');
  }
});
