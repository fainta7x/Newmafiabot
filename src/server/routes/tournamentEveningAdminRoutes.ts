import crypto from 'crypto';
import { Router, type NextFunction, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  cancelTournamentRegistration,
  loadTournamentEvening,
  notifyTournamentAudience,
  organizerAddTournamentPlayer,
  prepareTournamentEveningSeating,
  promoteTournamentReserve,
  reorderTournamentReserve,
  validatePrizeConfiguration,
} from '../services/tournamentEveningService.ts';

const router = Router();
const statusFor = (code: string) => ({
  TOURNAMENT_NOT_FOUND: 404,
  NOT_TOURNAMENT_EVENING: 409,
  NOT_ELIGIBLE: 403,
  JUDGE_CANNOT_REGISTER: 409,
  ROSTER_LOCKED: 409,
  ROSTER_ALREADY_SEATED: 409,
  ROSTER_NOT_READY: 409,
  ROSTER_MISMATCH: 409,
  REASON_REQUIRED: 400,
  INVALID_RESERVE_ORDER: 400,
  NOT_IN_RESERVE: 409,
  TOURNAMENT_FULL: 409,
}[code] || 400);

const isManagedTournamentEvening = async (db: DatabaseWrapper, tournamentId: string) => {
  const row = await db.get<any>('SELECT tournament_evening_flow FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  return Number(row?.tournament_evening_flow || 0) === 1;
};

const publishTournament = async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  if (!tournament || Number(tournament.tournament_evening_flow || 0) !== 1) return res.status(404).json({ error: 'Турнир не найден' });
  if (tournament.status !== 'draft') return res.status(409).json({ error: 'Публикация доступна только до запуска' });
  const prize = validatePrizeConfiguration(tournament.prize_fund_rub, JSON.parse(tournament.prize_allocations_json || '[]'));
  if (!prize.ok || prize.mismatch) return res.status(409).json({ error: 'Сумма распределения призов не совпадает с общим призовым фондом' });
  if (!tournament.judge_player_id || !tournament.venue) return res.status(409).json({ error: 'Перед публикацией укажите судью и место' });

  const firstPublish = !tournament.published_at;
  const now = new Date().toISOString();
  await db.run('UPDATE tournaments SET published_at=COALESCE(published_at,?),registration_closed_at=NULL,updated_at=? WHERE id=?', [now, now, tournamentId]);
  await db.run(`INSERT INTO tournament_evening_audit (id,tournament_id,action,actor_type,created_at)
    VALUES (?,?,'publish','organizer',?)`, [crypto.randomUUID(), tournamentId, now]);
  const audience = firstPublish ? await notifyTournamentAudience(db, tournamentId) : { eligible_players: 0, queued: 0 };
  return res.json({ ...(await loadTournamentEvening(db, tournamentId)), audience });
};

// Mounted before the legacy evening router: both supported publish URLs therefore use the
// same validation/audience logic and cannot silently skip the canonical Telegram/VK router.
router.post('/evenings/:id/publish', requireOrganizerAuth, publishTournament);
router.post('/evenings/:id/publish-and-notify', requireOrganizerAuth, publishTournament);

router.post('/evenings/:id/players', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await organizerAddTournamentPlayer(
      req.db as DatabaseWrapper,
      String(req.params.id),
      String(req.body?.player_id || ''),
      String(req.body?.reason || ''),
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(statusFor(error?.message)).json({ error: error?.message });
  }
});

const removePlayer = async (req: AuthenticatedRequest, res: Response) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Для ручного удаления укажите причину' });
  try {
    return res.json(await cancelTournamentRegistration(
      req.db as DatabaseWrapper,
      String(req.params.id),
      String(req.params.playerId),
      'organizer',
      null,
      reason,
    ));
  } catch (error: any) {
    return res.status(statusFor(error?.message)).json({ error: error?.message });
  }
};

// Intercept both old and explicit audited URLs before tournamentEveningRoutes so every
// organizer removal has a human-entered reason in tournament_evening_audit.
router.post('/evenings/:id/players/:playerId/remove', requireOrganizerAuth, removePlayer);
router.post('/evenings/:id/players/:playerId/remove-audited', requireOrganizerAuth, removePlayer);

router.post('/evenings/:id/reserve/reorder', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.registration_ids) ? req.body.registration_ids.map(String) : [];
    return res.json(await reorderTournamentReserve(req.db as DatabaseWrapper, String(req.params.id), ids, String(req.body?.reason || '')));
  } catch (error: any) {
    return res.status(statusFor(error?.message)).json({ error: error?.message });
  }
});

router.post('/evenings/:id/reserve/:playerId/promote', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json(await promoteTournamentReserve(
      req.db as DatabaseWrapper,
      String(req.params.id),
      String(req.params.playerId),
      String(req.body?.reason || ''),
    ));
  } catch (error: any) {
    return res.status(statusFor(error?.message)).json({ error: error?.message });
  }
});

// Tournament-evening rosters are registration-owned. Legacy participant replacement/profile
// correction would otherwise create a second source of truth, so managed events are blocked
// here before the canonical legacy router sees the mutation. Legacy tournaments continue.
router.put('/:id/participants', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!(await isManagedTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)))) return next();
  return res.status(409).json({ error: 'Состав этого турнира управляется регистрацией. Используйте блок «Участники · 10 мест + резерв».' });
});

router.patch('/:id/participants/:participantId/correct-player', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!(await isManagedTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)))) return next();
  return res.status(409).json({ error: 'Профиль участника нельзя менять в обход canonical tournament-evening регистрации.' });
});

const prepareSeating = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await prepareTournamentEveningSeating(req.db as DatabaseWrapper, String(req.params.id));
    return res.json({ ...result, tournament: await loadTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)) });
  } catch (error: any) {
    return res.status(statusFor(error?.message)).json({ error: error?.message });
  }
};

// Explicit tournament-evening action shown by the CRM once all 10 confirmed slots are filled.
router.post('/evenings/:id/prepare-seating', requireOrganizerAuth, prepareSeating);

// Preserve the legacy endpoint name for the canonical tournament workspace, but route managed
// events through the safe registration-aware preparer instead of destructive regeneration.
router.post('/:id/generate-seating', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!(await isManagedTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)))) return next();
  return prepareSeating(req, res);
});

export default router;