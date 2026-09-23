import { Router } from 'express';
import { z } from 'zod';
import { ensureNoviceSystemSchema } from '../../db/ensureNoviceSystemSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import { ensureSlotsForEvening } from '../services/eveningSlotPlanningService.ts';
import {
  admitPlayerWithoutApplication,
  convertNoviceToClubPlayer,
  createNoviceApplication,
  getNovicePlayerState,
  listPlayersAwaitingFirstDecision,
  updateNoviceApplicationStatus,
} from '../services/noviceService.ts';
import { CLUB_STAGES, NOVICE_APPLICATION_STATUSES, NOVICE_ENTRY_ROUTES } from '../../shared/novice.ts';

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000; // Europe/Moscow has no DST since 2014.

/** A Moscow wall-clock time on the evening's Moscow date shifted by `dayShift(weekday)` days. */
export const moscowWallTime = (base: Date, dayShift: (moscowWeekday: number) => number, hour: number) => {
  const moscow = new Date(base.getTime() + MOSCOW_OFFSET_MS);
  const day = moscow.getUTCDate() + dayShift(moscow.getUTCDay());
  return new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), day, hour, 0, 0, 0) - MOSCOW_OFFSET_MS);
};

const playerRouter = Router();
const organizerRouter = Router();

const playerIdOr401 = (req: any, res: any) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) res.status(401).json({ error: 'Player authentication required.' });
  return playerId;
};

const applicationInput = z.object({
  evening_id: z.string().trim().min(1).nullable().optional(),
  entry_route: z.enum(NOVICE_ENTRY_ROUTES),
  notes: z.string().trim().max(1000).optional(),
});

playerRouter.get('/novice', async (req, res) => {
  const playerId = playerIdOr401(req, res);
  if (!playerId) return;
  await ensureNoviceSystemSchema(req.db);
  const state = await getNovicePlayerState(req.db, playerId);
  return state ? res.json(state) : res.status(404).json({ error: 'Игрок не найден' });
});

playerRouter.post('/novice/applications', async (req, res) => {
  const playerId = playerIdOr401(req, res);
  if (!playerId) return;
  const parsed = applicationInput.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Проверьте маршрут и комментарий к заявке' });
  await ensureNoviceSystemSchema(req.db);
  if (parsed.data.evening_id) {
    await ensureSlotsForEvening(req.db, parsed.data.evening_id);
    const evening = await req.db.get<any>(
      `SELECT id, format, status, starts_at FROM game_evenings WHERE id = ? LIMIT 1`,
      [parsed.data.evening_id],
    );
    if (!evening || !['published', 'active'].includes(String(evening.status)) || new Date(evening.starts_at).getTime() < Date.now() - 6 * 60 * 60 * 1000) {
      return res.status(409).json({ error: 'Этот вечер уже недоступен для заявки' });
    }
    const expectedFormat = parsed.data.entry_route === 'NOVICE' ? 'NOVICE' : 'CASUAL';
    if (String(evening.format || '').toUpperCase() !== expectedFormat) {
      return res.status(400).json({ error: 'Выбранный вечер не соответствует маршруту заявки' });
    }
  }
  const identity = await req.db.get<any>(
    `SELECT p.telegram_user_id,
            EXISTS(SELECT 1 FROM player_external_identities i WHERE i.player_id=p.id AND i.platform='vk') AS has_vk
       FROM players p WHERE p.id=? LIMIT 1`,
    [playerId],
  );
  const source = !identity?.telegram_user_id && Number(identity?.has_vk || 0) ? 'VK' : 'TELEGRAM';
  try {
    const result = await createNoviceApplication(req.db, {
      playerId, eveningId: parsed.data.evening_id, source,
      entryRoute: parsed.data.entry_route, notes: parsed.data.notes,
    });
    return res.status(result.created ? 201 : 200).json({ success: true, ...result, state: await getNovicePlayerState(req.db, playerId) });
  } catch (error: any) {
    if (Number(error?.statusCode || 0) === 409) {
      return res.status(409).json({ error: error.message, code: error.code, reservation: error.reservation });
    }
    throw error;
  }
});

organizerRouter.use(requireOrganizerAuth);

organizerRouter.get('/applications', async (req, res) => {
  await ensureNoviceSystemSchema(req.db);
  const status = String(req.query.status || '').toUpperCase();
  const where = NOVICE_APPLICATION_STATUSES.includes(status as any) ? 'WHERE na.status = ?' : '';
  const params = where ? [status] : [];
  const applications = await req.db.all<any>(
    `SELECT na.*, p.nickname, p.game_level, COALESCE(p.club_stage, 'NEW') AS club_stage,
            e.title AS evening_title, e.starts_at AS evening_starts_at,
            (SELECT COUNT(DISTINCT ep.evening_id)
               FROM evening_participants ep JOIN game_evenings ge ON ge.id = ep.evening_id
              WHERE ep.player_id = p.id AND ep.attendance_status = 'attended'
                AND UPPER(COALESCE(ge.format, '')) = 'NOVICE') AS novice_visits
       FROM novice_applications na
       LEFT JOIN players p ON p.id = na.player_id
       LEFT JOIN game_evenings e ON e.id = na.evening_id
       ${where}
      ORDER BY CASE na.status WHEN 'NEW' THEN 0 WHEN 'CONFIRMED' THEN 1 ELSE 2 END, datetime(na.created_at) DESC`,
    params,
  );
  const summary = await req.db.all<any>('SELECT status, COUNT(*) AS count FROM novice_applications GROUP BY status');
  const nextEvening = await req.db.get<any>(
    // Everyone who holds a place: players who answered «иду» plus newcomers whose
    // application for this evening is still waiting or confirmed.
    `SELECT e.id, e.title, e.starts_at, e.status,
            (SELECT COUNT(*) FROM (
               SELECT ep.player_id FROM evening_participants ep
                WHERE ep.evening_id = e.id AND ep.response_status IN ('going','late') AND ep.player_id IS NOT NULL
               UNION
               SELECT na.player_id FROM novice_applications na
                WHERE na.evening_id = e.id AND na.status IN ('NEW','CONFIRMED') AND na.player_id IS NOT NULL
            )) AS registered_count
       FROM game_evenings e
      WHERE UPPER(COALESCE(e.format,''))='NOVICE' AND e.status IN ('draft','published')
        AND datetime(e.starts_at) >= datetime('now')
      ORDER BY datetime(e.starts_at) ASC LIMIT 1`,
  );
  const startsAt = nextEvening?.starts_at ? new Date(nextEvening.starts_at) : null;
  // The club works in Moscow time: group check on the preceding Thursday at 20:00,
  // decision on the evening's day by 15:00 — whatever the server's time zone is.
  const thursdayCheckAt = startsAt ? moscowWallTime(startsAt, (weekday) => -((weekday + 3) % 7), 20) : null;
  const fridayDecisionAt = startsAt ? moscowWallTime(startsAt, () => 0, 15) : null;
  await ensureVkIntegrationSchema(req.db);
  const awaitingPlayers = await listPlayersAwaitingFirstDecision(req.db);
  return res.json({
    applications,
    awaiting_players: awaitingPlayers.map((row: any) => ({ ...row, has_vk: Boolean(Number(row.has_vk || 0)) })),
    summary: Object.fromEntries(summary.map((row: any) => [row.status, Number(row.count || 0)])),
    operations: nextEvening ? {
      next_evening: { ...nextEvening, registered_count: Number(nextEvening.registered_count || 0) },
      thursday_check_at: thursdayCheckAt?.toISOString() || null,
      friday_decision_at: fridayDecisionAt?.toISOString() || null,
      automatic_cancellation: false,
    } : null,
  });
});

const decisionInput = z.object({
  status: z.enum(NOVICE_APPLICATION_STATUSES),
  organizer_notes: z.string().trim().max(2000).optional(),
});

organizerRouter.patch('/applications/:applicationId', async (req, res) => {
  const parsed = decisionInput.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Недопустимый статус заявки' });
  await ensureNoviceSystemSchema(req.db);
  const state = await updateNoviceApplicationStatus(
    req.db, String(req.params.applicationId), parsed.data.status, parsed.data.organizer_notes,
  );
  return res.json({ success: true, state });
});

organizerRouter.post('/players/:playerId/convert', async (req, res) => {
  await ensureNoviceSystemSchema(req.db);
  const player = await req.db.get<any>('SELECT id FROM players WHERE id = ? LIMIT 1', [String(req.params.playerId)]);
  if (!player) return res.status(404).json({ error: 'Игрок не найден' });
  await convertNoviceToClubPlayer(req.db, String(req.params.playerId));
  return res.json({ success: true, state: await getNovicePlayerState(req.db, String(req.params.playerId)) });
});

organizerRouter.post('/players/:playerId/admit', async (req, res) => {
  const entryRoute = String(req.body?.entry_route || '').toUpperCase();
  if (!NOVICE_ENTRY_ROUTES.includes(entryRoute as any)) return res.status(400).json({ error: 'Укажите: новичок или опытный игрок' });
  await ensureNoviceSystemSchema(req.db);
  const player = await req.db.get<any>(`SELECT id, COALESCE(club_stage, 'NEW') AS club_stage FROM players WHERE id = ? LIMIT 1`, [String(req.params.playerId)]);
  if (!player) return res.status(404).json({ error: 'Игрок не найден' });
  if (player.club_stage !== 'NEW') return res.status(409).json({ error: 'Уровень этого игрока уже определён' });
  try {
    const state = await admitPlayerWithoutApplication(req.db, String(player.id), entryRoute as 'NOVICE' | 'EXPERIENCED');
    return res.json({ success: true, state });
  } catch (error: any) {
    if (error?.code === 'application_exists') return res.status(409).json({ error: error.message, code: error.code });
    throw error;
  }
});

organizerRouter.patch('/players/:playerId/stage', async (req, res) => {
  const stage = String(req.body?.club_stage || '').toUpperCase();
  if (!CLUB_STAGES.includes(stage as any)) return res.status(400).json({ error: 'Недопустимый этап клуба' });
  await ensureNoviceSystemSchema(req.db);
  await req.db.run('UPDATE players SET club_stage = ? WHERE id = ?', [stage, String(req.params.playerId)]);
  return res.json({ success: true, state: await getNovicePlayerState(req.db, String(req.params.playerId)) });
});

export { organizerRouter as noviceOrganizerRoutes, playerRouter as novicePlayerRoutes };
