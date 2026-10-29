import { loadEveningSeatBookings, saveEveningSeatBooking, cancelEveningSeatBooking } from '../services/eveningSeatBookingService.ts';
import { Router, type Request, type Response } from 'express';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import { loadEveningSlotPlan } from '../services/eveningSlotPlanningService.ts';
import { replacePlayerSlotSelection, updateEveningSlotSettings } from '../services/eveningSlotWritesService.ts';
import { replaceOrganizerPlayerSlotSelection } from '../services/organizerEveningSlotSelectionService.ts';
import { loadLatestEveningRescheduleNotice, retryEveningRescheduleNotice } from '../services/eveningRescheduleService.ts';

export const eveningSlotRoutes = Router();

const sendError = (res: any, error: any, fallback: string) =>
  res.status(Number(error?.statusCode || error?.status || 500)).json({ error: error?.message || fallback });

const requirePlayer = async (req: Request, res: Response) => {
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

eveningSlotRoutes.get('/:eveningId/reschedule-notice', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json({ notice: await loadLatestEveningRescheduleNotice(req.db, String(req.params.eveningId)) });
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить уведомления о переносе');
  }
});

eveningSlotRoutes.post('/:eveningId/reschedule-notice/retry', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json(await retryEveningRescheduleNotice(req.db, String(req.params.eveningId)));
  } catch (error: any) {
    return sendError(res, error, 'Не удалось повторить уведомления о переносе');
  }
});

eveningSlotRoutes.get('/:eveningId/slots', requireOrganizerAuth, async (req, res) => {
  try {
    const plan = await loadEveningSlotPlan(req.db, String(req.params.eveningId));
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить игры вечера');
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

    const plan = await updateEveningSlotSettings(req.db, String(req.params.eveningId), {
      planned_slots: plannedSlots,
      price_per_game: pricePerGame,
      slot_duration_minutes: slotDurationMinutes,
      ...(startsAt ? { starts_at: startsAt } : {}),
    });
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось сохранить настройки игр вечера');
  }
});

eveningSlotRoutes.get('/:eveningId/slots/player/:playerId', requireOrganizerAuth, async (req, res) => {
  try {
    const plan = await loadEveningSlotPlan(
      req.db,
      String(req.params.eveningId),
      String(req.params.playerId),
    );
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить игры игрока');
  }
});

eveningSlotRoutes.put('/:eveningId/slots/player/:playerId', requireOrganizerAuth, async (req, res) => {
  try {
    if (!Array.isArray(req.body?.slot_ids)) {
      return res.status(400).json({ error: 'Передайте список slot_ids' });
    }
    const plan = await replaceOrganizerPlayerSlotSelection(
      req.db,
      String(req.params.eveningId),
      String(req.params.playerId),
      req.body.slot_ids,
    );
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось сохранить игры игрока');
  }
});

eveningSlotRoutes.get('/:eveningId/slots/me', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const plan = await loadEveningSlotPlan(req.db, String(req.params.eveningId), String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, plan.event.format)) {
      return res.status(403).json({ error: 'Этот формат вечера пока недоступен для вашего уровня' });
    }
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось загрузить игры вечера');
  }
});

eveningSlotRoutes.put('/:eveningId/slots/me', async (req, res) => {
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
      { source: 'player_slots_route' },
    );
    return res.json(plan);
  } catch (error: any) {
    return sendError(res, error, 'Не удалось сохранить выбор игр');
  }
});


/** A booking is distinct from choosing a game; no actual game is created here. */
eveningSlotRoutes.get('/:eveningId/seating/me', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    return res.json({ seats: await loadEveningSeatBookings(req.db, String(req.params.eveningId), String(player.id)) });
  } catch (error: any) { return sendError(res, error, 'Не удалось загрузить бронь'); }
});

eveningSlotRoutes.put('/:eveningId/seating/me', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const plan = await loadEveningSlotPlan(req.db, String(req.params.eveningId), String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, plan.event.format)) {
      return res.status(403).json({ error: 'Этот формат вечера недоступен для вашего уровня' });
    }
    const result = await saveEveningSeatBooking(req.db, String(req.params.eveningId), String(player.id), {
      slotId: String(req.body?.slot_id || ''), tableId: String(req.body?.table_id || ''),
      seat: Number(req.body?.seat_number),
    });
    return res.status(result.saved ? 200 : 409).json(result);
  } catch (error: any) { return sendError(res, error, 'Не удалось забронировать место'); }
});

eveningSlotRoutes.delete('/:eveningId/seating/me/:slotId', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    return res.json(await cancelEveningSeatBooking(req.db, String(req.params.eveningId), String(req.params.slotId), String(player.id)));
  } catch (error: any) { return sendError(res, error, 'Не удалось отменить бронь'); }
});

eveningSlotRoutes.get('/:eveningId/seating', requireOrganizerAuth, async (req, res) => {
  try { return res.json({ seats: await loadEveningSeatBookings(req.db, String(req.params.eveningId)) }); }
  catch (error: any) { return sendError(res, error, 'Не удалось загрузить рассадку'); }
});

eveningSlotRoutes.put('/:eveningId/seating/player/:playerId', requireOrganizerAuth, async (req, res) => {
  try {
    const result = await saveEveningSeatBooking(req.db, String(req.params.eveningId), String(req.params.playerId), {
      slotId: String(req.body?.slot_id || ''), tableId: String(req.body?.table_id || ''),
      seat: Number(req.body?.seat_number), override: req.body?.override === true,
    }, true);
    return res.status(result.saved ? 200 : 409).json(result);
  } catch (error: any) { return sendError(res, error, 'Не удалось изменить рассадку'); }
});

eveningSlotRoutes.delete('/:eveningId/seating/player/:playerId/:slotId', requireOrganizerAuth, async (req, res) => {
  try { return res.json(await cancelEveningSeatBooking(req.db, String(req.params.eveningId), String(req.params.slotId), String(req.params.playerId))); }
  catch (error: any) { return sendError(res, error, 'Не удалось отменить назначение'); }
});


eveningSlotRoutes.get('/:eveningId/seating/options', async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const plan = await loadEveningSlotPlan(req.db, String(req.params.eveningId), String(player.id));
    if (!playerLevelAllowsEveningFormat(player.game_level, plan.event.format)) return res.status(403).json({ error: 'Формат недоступен' });
    const tables = await req.db.all<any>('SELECT id, name, capacity FROM evening_tables WHERE evening_id = ? ORDER BY sort_order, name', [String(req.params.eveningId)]);
    const seats = await loadEveningSeatBookings(req.db, String(req.params.eveningId));
    return res.json({
      tables: tables.map((t: any) => ({ id: String(t.id), name: String(t.name), capacity: Math.min(10, Number(t.capacity || 10)) })),
      occupied: seats.map((x: any) => ({ slot_id: x.slot_id, table_id: x.tableId, seat_number: x.seat, own: x.playerId === String(player.id) })),
    });
  } catch (error: any) { return sendError(res, error, 'Не удалось загрузить доступные места'); }
});
