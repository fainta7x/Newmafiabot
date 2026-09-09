import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

export const TOURNAMENT_PLAYER_CAPACITY = 10;
export type TournamentPaymentState = 'unpaid' | 'pending' | 'confirmed' | 'rejected' | 'waived' | 'refunded';

const nowIso = () => new Date().toISOString();
const integerRubles = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function validatePrizeConfiguration(total: unknown, allocations: unknown) {
  const prizeFund = integerRubles(total);
  if (prizeFund == null) return { ok: false as const, error: 'Призовой фонд должен быть неотрицательным целым числом рублей' };
  if (!Array.isArray(allocations)) return { ok: false as const, error: 'Распределение призов должно быть массивом' };
  const normalized = allocations.map((item: any, index: number) => ({
    place: String(item?.place || item?.label || `${index + 1}`).trim(),
    amount_rub: integerRubles(item?.amount_rub ?? item?.amount),
  }));
  if (normalized.some((item) => !item.place || item.amount_rub == null)) {
    return { ok: false as const, error: 'Каждый приз должен иметь позицию и неотрицательную целую сумму в рублях' };
  }
  const allocated = normalized.reduce((sum, item) => sum + Number(item.amount_rub), 0);
  return { ok: true as const, prizeFund, allocations: normalized, allocated, mismatch: allocated !== prizeFund };
}

export async function loadTournamentEvening(db: DatabaseWrapper, tournamentId: string, playerId?: string | null) {
  const tournament = await db.get<any>(`
    SELECT t.*, p.nickname AS judge_nickname
      FROM tournaments t
      LEFT JOIN players p ON p.id = t.judge_player_id
     WHERE t.id = ? LIMIT 1
  `, [tournamentId]);
  if (!tournament) return null;
  const registrations = await db.all<any>(`
    SELECT r.*, p.nickname, p.game_level,
           COALESCE(pc.state, 'unpaid') AS payment_state,
           pc.player_note AS payment_note, pc.reported_at, pc.reviewed_at, pc.reviewed_by, pc.organizer_note
      FROM tournament_registrations r
      JOIN players p ON p.id = r.player_id
      LEFT JOIN tournament_payment_claims pc ON pc.tournament_id=r.tournament_id AND pc.player_id=r.player_id
     WHERE r.tournament_id=?
     ORDER BY CASE r.status WHEN 'confirmed' THEN 0 WHEN 'reserve' THEN 1 ELSE 2 END,
              CASE WHEN r.status='confirmed' THEN r.registered_at END ASC,
              CASE WHEN r.status='reserve' THEN r.queue_order END ASC,
              r.registered_at ASC, r.id ASC
  `, [tournamentId]);
  const confirmed = registrations.filter((row) => row.status === 'confirmed');
  const reserves = registrations.filter((row) => row.status === 'reserve');
  const me = playerId ? registrations.find((row) => row.player_id === playerId) || null : null;
  const entryFee = Number(tournament.entry_fee_rub || 0);
  return {
    ...tournament,
    format: 'TOURNAMENT',
    lifecycle: tournament.status === 'completed' ? 'completed'
      : tournament.status === 'active' || tournament.status === 'correction' ? 'active'
      : tournament.registration_closed_at ? 'registration_closed'
      : tournament.published_at ? 'registration_open'
      : 'draft',
    player_capacity: TOURNAMENT_PLAYER_CAPACITY,
    prize_allocations: JSON.parse(tournament.prize_allocations_json || '[]'),
    confirmed_count: confirmed.length,
    remaining_places: Math.max(0, TOURNAMENT_PLAYER_CAPACITY - confirmed.length),
    registrations,
    confirmed,
    reserves,
    me,
    payment_totals: {
      expected_rub: confirmed.length * entryFee,
      reported_rub: confirmed.filter((row) => row.payment_state === 'pending').length * entryFee,
      confirmed_rub: confirmed.filter((row) => row.payment_state === 'confirmed' || row.payment_state === 'waived').length * entryFee,
      unpaid_count: confirmed.filter((row) => !['confirmed', 'waived'].includes(row.payment_state)).length,
    },
  };
}

async function audit(db: DatabaseWrapper, tournamentId: string, action: string, actorType: string, actorId?: string | null, playerId?: string | null, reason?: string | null, payload?: unknown) {
  await db.run(`INSERT INTO tournament_evening_audit
    (id,tournament_id,player_id,action,actor_type,actor_id,reason,payload_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), tournamentId, playerId || null, action, actorType, actorId || null, reason || null, payload == null ? null : JSON.stringify(payload), nowIso()]);
}

async function syncCanonicalParticipants(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT status FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  if (!tournament || tournament.status !== 'draft') return;
  const confirmed = await db.all<any>(`
    SELECT r.player_id, p.nickname FROM tournament_registrations r JOIN players p ON p.id=r.player_id
    WHERE r.tournament_id=? AND r.status='confirmed' ORDER BY r.registered_at ASC, r.id ASC LIMIT 10
  `, [tournamentId]);
  await db.run('DELETE FROM tournament_participants WHERE tournament_id=?', [tournamentId]);
  for (let index = 0; index < confirmed.length; index += 1) {
    const row = confirmed[index];
    await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number)
      VALUES (?,?,?,?,?)`, [crypto.randomUUID(), tournamentId, row.player_id, row.nickname || `Игрок ${index + 1}`, index + 1]);
  }
}

async function renumberReserve(db: DatabaseWrapper, tournamentId: string) {
  const rows = await db.all<any>(`SELECT id FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY registered_at ASC,id ASC`, [tournamentId]);
  for (let index = 0; index < rows.length; index += 1) {
    await db.run('UPDATE tournament_registrations SET queue_order=?, updated_at=? WHERE id=?', [index + 1, nowIso(), rows[index].id]);
  }
}

export async function registerTournamentPlayer(db: DatabaseWrapper, tournamentId: string, playerId: string) {
  const result = await db.transaction(async (tx) => {
    const tournament = await tx.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (!tournament.published_at || tournament.registration_closed_at || tournament.status !== 'draft') throw new Error('REGISTRATION_CLOSED');
    if (String(tournament.judge_player_id || '') === playerId) throw new Error('JUDGE_CANNOT_REGISTER');
    const player = await tx.get<any>('SELECT id,nickname,game_level FROM players WHERE id=? LIMIT 1', [playerId]);
    if (!player || !playerLevelAllowsEveningFormat(player.game_level, 'TOURNAMENT')) throw new Error('NOT_ELIGIBLE');
    const existing = await tx.get<any>('SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1', [tournamentId, playerId]);
    if (existing && ['confirmed','reserve'].includes(existing.status)) return existing;
    const count = await tx.get<any>("SELECT COUNT(*) AS count FROM tournament_registrations WHERE tournament_id=? AND status='confirmed'", [tournamentId]);
    const status = Number(count?.count || 0) < TOURNAMENT_PLAYER_CAPACITY ? 'confirmed' : 'reserve';
    const id = existing?.id || crypto.randomUUID();
    const now = nowIso();
    if (existing) {
      await tx.run(`UPDATE tournament_registrations SET status=?,registered_at=?,cancelled_at=NULL,updated_at=?,organizer_reason=NULL WHERE id=?`, [status, now, now, id]);
    } else {
      await tx.run(`INSERT INTO tournament_registrations (id,tournament_id,player_id,status,registered_at,updated_at) VALUES (?,?,?,?,?,?)`, [id,tournamentId,playerId,status,now,now]);
    }
    await renumberReserve(tx, tournamentId);
    await syncCanonicalParticipants(tx, tournamentId);
    await audit(tx, tournamentId, 'register', 'player', playerId, playerId, null, { status });
    return await tx.get<any>('SELECT * FROM tournament_registrations WHERE id=?', [id]);
  });
  return result;
}

export async function cancelTournamentRegistration(db: DatabaseWrapper, tournamentId: string, playerId: string, actorType: 'player' | 'organizer' = 'player', actorId?: string | null, reason?: string | null) {
  let promotedPlayerId: string | null = null;
  const result = await db.transaction(async (tx) => {
    const tournament = await tx.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
    if (tournament.status !== 'draft') throw new Error('ROSTER_LOCKED');
    const registration = await tx.get<any>('SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1', [tournamentId, playerId]);
    if (!registration) return { cancelled: false, promotedPlayerId: null };
    if (registration.status === 'cancelled' || registration.status === 'declined') return { cancelled: false, promotedPlayerId: null };
    const wasConfirmed = registration.status === 'confirmed';
    const now = nowIso();
    await tx.run("UPDATE tournament_registrations SET status='cancelled',cancelled_at=?,updated_at=?,organizer_reason=? WHERE id=?", [now, now, reason || null, registration.id]);
    await audit(tx, tournamentId, 'cancel', actorType, actorId || playerId, playerId, reason || null);
    if (wasConfirmed) {
      const next = await tx.get<any>("SELECT * FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY registered_at ASC,id ASC LIMIT 1", [tournamentId]);
      if (next) {
        promotedPlayerId = String(next.player_id);
        await tx.run("UPDATE tournament_registrations SET status='confirmed',queue_order=NULL,updated_at=? WHERE id=?", [now, next.id]);
        await audit(tx, tournamentId, 'promote_from_reserve', 'system', null, promotedPlayerId, 'fifo vacancy promotion');
      }
    }
    await renumberReserve(tx, tournamentId);
    await syncCanonicalParticipants(tx, tournamentId);
    return { cancelled: true, promotedPlayerId };
  });
  if (promotedPlayerId) {
    await queuePersonalNotification(db, {
      notificationKey: `tournament:${tournamentId}:promotion:${promotedPlayerId}`,
      playerId: promotedPlayerId,
      eventType: 'tournament_reserve_promoted',
      entityId: tournamentId,
      text: 'Вы перешли из резерва в основной состав турнира.',
      actionPath: `/player?tournament=${encodeURIComponent(tournamentId)}`,
    });
  }
  return result;
}

export async function reportTournamentPayment(db: DatabaseWrapper, tournamentId: string, playerId: string, note?: string | null) {
  const tournament = await db.get<any>('SELECT id,published_at FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  if (!tournament?.published_at) throw new Error('TOURNAMENT_NOT_FOUND');
  const registration = await db.get<any>("SELECT id FROM tournament_registrations WHERE tournament_id=? AND player_id=? AND status IN ('confirmed','reserve') LIMIT 1", [tournamentId, playerId]);
  if (!registration) throw new Error('NOT_REGISTERED');
  const now = nowIso();
  await db.run(`INSERT INTO tournament_payment_claims (id,tournament_id,player_id,state,player_note,reported_at,updated_at)
    VALUES (?,?,?,'pending',?,?,?)
    ON CONFLICT(tournament_id,player_id) DO UPDATE SET state='pending',player_note=excluded.player_note,reported_at=excluded.reported_at,reviewed_at=NULL,reviewed_by=NULL,organizer_note=NULL,updated_at=excluded.updated_at`,
    [crypto.randomUUID(), tournamentId, playerId, note?.trim().slice(0, 250) || null, now, now]);
  await audit(db, tournamentId, 'payment_reported', 'player', playerId, playerId, null);
  return db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=?', [tournamentId, playerId]);
}

export async function reviewTournamentPayment(db: DatabaseWrapper, tournamentId: string, playerId: string, state: TournamentPaymentState, actorId: string | null, note?: string | null) {
  if (!['confirmed','rejected','waived','refunded','unpaid'].includes(state)) throw new Error('INVALID_PAYMENT_STATE');
  const registration = await db.get<any>('SELECT id FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1', [tournamentId, playerId]);
  if (!registration) throw new Error('NOT_REGISTERED');
  const current = await db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=? LIMIT 1', [tournamentId, playerId]);
  if (current?.state === state && String(current?.organizer_note || '') === String(note || '')) return current;
  const now = nowIso();
  await db.run(`INSERT INTO tournament_payment_claims (id,tournament_id,player_id,state,reviewed_at,reviewed_by,organizer_note,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(tournament_id,player_id) DO UPDATE SET state=excluded.state,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,organizer_note=excluded.organizer_note,updated_at=excluded.updated_at`,
    [crypto.randomUUID(), tournamentId, playerId, state, now, actorId, note?.trim().slice(0, 250) || null, now]);
  await audit(db, tournamentId, `payment_${state}`, 'organizer', actorId, playerId, note || null, { previous_state: current?.state || 'unpaid' });
  await queuePersonalNotification(db, {
    notificationKey: `tournament:${tournamentId}:payment:${playerId}:${state}:${now}`,
    playerId,
    eventType: 'tournament_payment_reviewed',
    entityId: tournamentId,
    text: state === 'confirmed' ? 'Организатор подтвердил оплату турнирного взноса.' : state === 'rejected' ? 'Организатор не подтвердил оплату. Проверьте комментарий в турнире.' : `Статус турнирного взноса изменён: ${state}.`,
    actionPath: `/player?tournament=${encodeURIComponent(tournamentId)}`,
  });
  return db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=?', [tournamentId, playerId]);
}
