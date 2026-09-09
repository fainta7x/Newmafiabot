import crypto from 'crypto';
import { Router, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  cancelTournamentRegistration,
  loadTournamentEvening,
  notifyTournamentAudience,
  organizerAddTournamentPlayer,
  promoteTournamentReserve,
  reorderTournamentReserve,
  validatePrizeConfiguration,
} from '../services/tournamentEveningService.ts';

const router = Router();
const statusFor = (code: string) => ({
  TOURNAMENT_NOT_FOUND: 404,
  NOT_ELIGIBLE: 403,
  JUDGE_CANNOT_REGISTER: 409,
  ROSTER_LOCKED: 409,
  ROSTER_ALREADY_SEATED: 409,
  REASON_REQUIRED: 400,
  INVALID_RESERVE_ORDER: 400,
  NOT_IN_RESERVE: 409,
  TOURNAMENT_FULL: 409,
}[code] || 400);

const publishTournament = async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournamentId = String(req.params.id);
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
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

export default router;