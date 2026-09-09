import { Router, type Response } from 'express';
import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { resolveJudgeAssignment, JudgeAssignmentError } from '../services/judgeAssignmentService.ts';
import {
  TOURNAMENT_PLAYER_CAPACITY,
  cancelTournamentRegistration,
  loadTournamentEvening,
  notifyTournamentAudience,
  organizerAddTournamentPlayer,
  promoteTournamentReserve,
  registerTournamentPlayer,
  reorderTournamentReserve,
  reportTournamentPayment,
  reviewTournamentPayment,
  validatePrizeConfiguration,
  type TournamentPaymentState,
} from '../services/tournamentEveningService.ts';

const router = Router();
const intRub = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const playerIdOr401 = (req: AuthenticatedRequest, res: Response) => {
  const id = getPlayerSessionId(req);
  if (!id) res.status(401).json({ error: 'Требуется авторизация игрока' });
  return id;
};
const errorStatus = (code: string) => ({
  TOURNAMENT_NOT_FOUND: 404,
  NOT_TOURNAMENT_EVENING: 409,
  REGISTRATION_CLOSED: 409,
  JUDGE_CANNOT_REGISTER: 409,
  NOT_ELIGIBLE: 403,
  NOT_REGISTERED: 409,
  NOT_IN_RESERVE: 409,
  TOURNAMENT_FULL: 409,
  ROSTER_LOCKED: 409,
  ROSTER_ALREADY_SEATED: 409,
  ROSTER_NOT_READY: 409,
  ROSTER_MISMATCH: 409,
  INVALID_PAYMENT_STATE: 400,
  INVALID_RESERVE_ORDER: 400,
  REASON_REQUIRED: 400,
}[code] || 400);
const organizerReason = (req: AuthenticatedRequest) => String(req.body?.reason || '').trim();

router.post('/evenings', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const venue = String(body.venue || '').trim();
  const date = new Date(body.date);
  const entryFee = intRub(body.entry_fee_rub);
  const capacity = body.player_capacity == null ? TOURNAMENT_PLAYER_CAPACITY : Number(body.player_capacity);
  const prize = validatePrizeConfiguration(body.prize_fund_rub, body.prize_allocations || []);
  if (!title || !venue || Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Название, дата/время и место обязательны' });
  if (capacity !== TOURNAMENT_PLAYER_CAPACITY) return res.status(400).json({ error: 'Текущий турнирный формат рассчитан ровно на 10 игроков' });
  if (entryFee == null) return res.status(400).json({ error: 'Взнос должен быть неотрицательным целым числом рублей' });
  if (!prize.ok) return res.status(400).json({ error: prize.error });
  if (!body.judge_player_id) return res.status(400).json({ error: 'Нужно выбрать канонического судью из CRM' });
  try {
    const judge = await resolveJudgeAssignment(db, { judge_player_id: String(body.judge_player_id), required_level: 'judge' });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(`INSERT INTO tournaments
      (id,title,date,venue,stage,status,chief_judge_name,notes,game_count,created_at,updated_at,judge_player_id,player_capacity,entry_fee_rub,prize_fund_rub,prize_allocations_json,registration_token,tournament_evening_flow)
      VALUES (?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,1)`, [
      id, title, date.toISOString(), venue, 'TOURNAMENT', judge.judge_name,
      body.notes == null ? null : String(body.notes).trim() || null,
      Number.isInteger(Number(body.game_count)) && Number(body.game_count) > 0 ? Number(body.game_count) : 10,
      now, now, judge.judge_player_id, TOURNAMENT_PLAYER_CAPACITY, entryFee, prize.prizeFund,
      JSON.stringify(prize.allocations), crypto.randomBytes(18).toString('base64url'),
    ]);
    await db.run(`INSERT INTO tournament_evening_audit (id,tournament_id,action,actor_type,payload_json,created_at)
      VALUES (?,?, 'create_evening','organizer',?,?)`, [crypto.randomUUID(), id, JSON.stringify({ entry_fee_rub: entryFee, prize_fund_rub: prize.prizeFund, allocated_rub: prize.allocated }), now]);
    return res.status(201).json({ ...(await loadTournamentEvening(db, id)), prize_allocation_mismatch: prize.mismatch });
  } catch (error: any) {
    if (error instanceof JudgeAssignmentError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: error?.message || 'Не удалось создать турнирный вечер' });
  }
});

router.put('/evenings/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const id = String(req.params.id);
  const current = await db.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [id]);
  if (!current || Number(current.tournament_evening_flow || 0) !== 1) return res.status(404).json({ error: 'Турнир не найден' });
  if (current.status !== 'draft') return res.status(409).json({ error: 'После запуска турнирные настройки заблокированы' });
  const body = req.body || {};
  const title = body.title == null ? current.title : String(body.title).trim();
  const venue = body.venue == null ? current.venue : String(body.venue).trim();
  const date = body.date == null ? new Date(current.date) : new Date(body.date);
  const entryFee = body.entry_fee_rub == null ? Number(current.entry_fee_rub) : intRub(body.entry_fee_rub);
  const allocations = body.prize_allocations == null ? JSON.parse(current.prize_allocations_json || '[]') : body.prize_allocations;
  const prize = validatePrizeConfiguration(body.prize_fund_rub == null ? current.prize_fund_rub : body.prize_fund_rub, allocations);
  if (!title || !venue || Number.isNaN(date.getTime()) || entryFee == null || !prize.ok) return res.status(400).json({ error: prize.ok ? 'Проверьте название, дату, место и взнос' : prize.error });
  try {
    const judge = body.judge_player_id == null
      ? { judge_player_id: current.judge_player_id, judge_name: current.chief_judge_name }
      : await resolveJudgeAssignment(db, { judge_player_id: String(body.judge_player_id), required_level: 'judge' });
    if (!judge.judge_player_id) return res.status(400).json({ error: 'Нужно выбрать канонического судью из CRM' });
    const judgeRegistration = await db.get<any>("SELECT id FROM tournament_registrations WHERE tournament_id=? AND player_id=? AND status IN ('confirmed','reserve') LIMIT 1", [id, judge.judge_player_id]);
    if (judgeRegistration) return res.status(409).json({ error: 'Выбранный судья уже зарегистрирован игроком. Сначала снимите его с регистрации.' });
    const now = new Date().toISOString();
    await db.run(`UPDATE tournaments SET title=?,date=?,venue=?,chief_judge_name=?,judge_player_id=?,entry_fee_rub=?,prize_fund_rub=?,prize_allocations_json=?,notes=?,updated_at=? WHERE id=?`, [
      title,date.toISOString(),venue,judge.judge_name,judge.judge_player_id,entryFee,prize.prizeFund,JSON.stringify(prize.allocations),
      body.notes === undefined ? current.notes : String(body.notes || '').trim() || null,now,id,
    ]);
    return res.json({ ...(await loadTournamentEvening(db, id)), prize_allocation_mismatch: prize.mismatch });
  } catch (error: any) {
    return res.status(error instanceof JudgeAssignmentError ? 400 : 500).json({ error: error?.message || 'Не удалось обновить турнир' });
  }
});

router.post('/evenings/:id/publish', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const id = String(req.params.id);
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [id]);
  if (!tournament || Number(tournament.tournament_evening_flow || 0) !== 1) return res.status(404).json({ error: 'Турнир не найден' });
  if (tournament.status !== 'draft') return res.status(409).json({ error: 'Публикация доступна только до запуска' });
  const prize = validatePrizeConfiguration(tournament.prize_fund_rub, JSON.parse(tournament.prize_allocations_json || '[]'));
  if (!prize.ok || prize.mismatch) return res.status(409).json({ error: 'Сумма распределения призов не совпадает с общим призовым фондом', prize_fund_rub: prize.ok ? prize.prizeFund : null, allocated_rub: prize.ok ? prize.allocated : null });
  if (!tournament.judge_player_id || !tournament.venue) return res.status(409).json({ error: 'Перед публикацией укажите судью и место' });
  const firstPublish = !tournament.published_at;
  const now = new Date().toISOString();
  await db.run('UPDATE tournaments SET published_at=COALESCE(published_at,?),registration_closed_at=NULL,updated_at=? WHERE id=?', [now,now,id]);
  await db.run(`INSERT INTO tournament_evening_audit (id,tournament_id,action,actor_type,created_at) VALUES (?,?,'publish','organizer',?)`, [crypto.randomUUID(),id,now]);
  if (firstPublish) {
    try {
      await notifyTournamentAudience(db, id);
    } catch (error) {
      console.warn('[tournament-evening] audience notification failed', error);
    }
  }
  return res.json(await loadTournamentEvening(db, id));
});

router.post('/evenings/:id/registration/close', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const id = String(req.params.id); const now = new Date().toISOString();
  const result = await db.run("UPDATE tournaments SET registration_closed_at=COALESCE(registration_closed_at,?),updated_at=? WHERE id=? AND tournament_evening_flow=1 AND published_at IS NOT NULL AND status='draft'", [now,now,id]);
  if (!result.changes) return res.status(409).json({ error: 'Регистрацию нельзя закрыть из текущего состояния' });
  return res.json(await loadTournamentEvening(db, id));
});

router.post('/evenings/:id/registration/open', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper; const id = String(req.params.id); const now = new Date().toISOString();
  const result = await db.run("UPDATE tournaments SET registration_closed_at=NULL,updated_at=? WHERE id=? AND tournament_evening_flow=1 AND published_at IS NOT NULL AND status='draft'", [now,id]);
  if (!result.changes) return res.status(409).json({ error: 'Регистрацию нельзя открыть из текущего состояния' });
  return res.json(await loadTournamentEvening(db, id));
});

router.get('/evenings/:id', async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper; const id = String(req.params.id);
  const playerId = getPlayerSessionId(req);
  const detail = await loadTournamentEvening(db, id, playerId);
  if (!detail) return res.status(404).json({ error: 'Турнир не найден' });
  if (!detail.published_at && req.userRole !== 'ORGANIZER') return res.status(404).json({ error: 'Турнир не найден' });
  if (req.userRole !== 'ORGANIZER') {
    return res.json({
      id: detail.id,title: detail.title,date: detail.date,venue: detail.venue,status: detail.status,lifecycle: detail.lifecycle,format:'TOURNAMENT',
      judge: detail.judge_nickname || detail.chief_judge_name,player_capacity: detail.player_capacity,confirmed_count: detail.confirmed_count,remaining_places: detail.remaining_places,
      entry_fee_rub: detail.entry_fee_rub,prize_fund_rub: detail.prize_fund_rub,prize_allocations: detail.prize_allocations,notes: detail.notes,me: detail.me,
    });
  }
  return res.json(detail);
});

router.get('/registration/:token', async (req: AuthenticatedRequest, res: Response) => {
  const db = req.db as DatabaseWrapper;
  const tournament = await db.get<any>('SELECT id FROM tournaments WHERE registration_token=? AND tournament_evening_flow=1 AND published_at IS NOT NULL LIMIT 1', [String(req.params.token)]);
  if (!tournament) return res.status(404).json({ error: 'Ссылка регистрации недействительна' });
  const detail = await loadTournamentEvening(db, String(tournament.id), getPlayerSessionId(req));
  return res.json({ ...detail, registrations: undefined, confirmed: undefined, reserves: undefined, payment_totals: undefined });
});

router.post('/evenings/:id/register', async (req: AuthenticatedRequest, res: Response) => {
  const playerId = playerIdOr401(req,res); if (!playerId) return;
  try { return res.json(await registerTournamentPlayer(req.db as DatabaseWrapper, String(req.params.id), playerId)); }
  catch (error: any) { return res.status(errorStatus(error?.message)).json({ error: error?.message }); }
});

router.post('/evenings/:id/cancel-registration', async (req: AuthenticatedRequest, res: Response) => {
  const playerId = playerIdOr401(req,res); if (!playerId) return;
  try { return res.json(await cancelTournamentRegistration(req.db as DatabaseWrapper, String(req.params.id), playerId)); }
  catch (error: any) { return res.status(errorStatus(error?.message)).json({ error: error?.message }); }
});

router.post('/evenings/:id/payment/report', async (req: AuthenticatedRequest, res: Response) => {
  const playerId = playerIdOr401(req,res); if (!playerId) return;
  try { return res.json(await reportTournamentPayment(req.db as DatabaseWrapper, String(req.params.id), playerId, req.body?.note)); }
  catch (error: any) { return res.status(errorStatus(error?.message)).json({ error: error?.message }); }
});

router.post('/evenings/:id/players/:playerId/add', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reason = organizerReason(req);
  if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  try {
    await organizerAddTournamentPlayer(req.db as DatabaseWrapper, String(req.params.id), String(req.params.playerId), reason);
    return res.json(await loadTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)));
  } catch (error: any) {
    return res.status(errorStatus(error?.message)).json({ error: error?.message });
  }
});

router.post('/evenings/:id/players/:playerId/remove', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reason = organizerReason(req);
  if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  try {
    await cancelTournamentRegistration(req.db as DatabaseWrapper, String(req.params.id), String(req.params.playerId), 'organizer', null, reason);
    return res.json(await loadTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)));
  } catch (error: any) {
    return res.status(errorStatus(error?.message)).json({ error: error?.message });
  }
});

router.post('/evenings/:id/players/:playerId/promote', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reason = organizerReason(req);
  if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  try {
    await promoteTournamentReserve(req.db as DatabaseWrapper, String(req.params.id), String(req.params.playerId), reason);
    return res.json(await loadTournamentEvening(req.db as DatabaseWrapper, String(req.params.id)));
  } catch (error: any) {
    return res.status(errorStatus(error?.message)).json({ error: error?.message });
  }
});

router.put('/evenings/:id/reserve-order', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reason = organizerReason(req);
  const registrationIds = Array.isArray(req.body?.registration_ids) ? req.body.registration_ids.map(String) : [];
  if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  try {
    return res.json(await reorderTournamentReserve(req.db as DatabaseWrapper, String(req.params.id), registrationIds, reason));
  } catch (error: any) {
    return res.status(errorStatus(error?.message)).json({ error: error?.message });
  }
});

router.post('/evenings/:id/players/:playerId/payment', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try { return res.json(await reviewTournamentPayment(req.db as DatabaseWrapper, String(req.params.id), String(req.params.playerId), String(req.body?.state || '') as TournamentPaymentState, null, req.body?.note)); }
  catch (error: any) { return res.status(errorStatus(error?.message)).json({ error: error?.message }); }
});

router.get('/evenings/:id/audit', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const rows = await (req.db as DatabaseWrapper).all<any>('SELECT * FROM tournament_evening_audit WHERE tournament_id=? ORDER BY created_at ASC,id ASC', [String(req.params.id)]);
  return res.json(rows);
});

export default router;