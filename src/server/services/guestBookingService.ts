import type { DatabaseWrapper } from '../../db/index.ts';
import { isOpenEvening, openEveningSql } from '../../lib/eveningStatus.ts';
import { venueDetails } from '../../lib/venues.ts';
import { setParticipantResponse } from './eveningParticipantState.ts';
import { ensureSlotsForEvening } from './eveningSlotPlanningService.ts';
import { replacePlayerSlotSelection } from './eveningSlotWritesService.ts';
import { ensureNewcomerFunnelSchema, leadManagementTokenHash, LeadError } from './newcomerFunnelService.ts';
import { randomBytes } from 'node:crypto';

/** Organizer-only issuance/rotation for an existing lead; the public contact form cannot do this. */
export async function issueGuestBookingToken(db: DatabaseWrapper, playerId: string) {
  await ensureNewcomerFunnelSchema(db);
  return db.transaction(async tx => {
    const lead = await tx.get(`SELECT l.player_id FROM newcomer_leads l JOIN players p ON p.id=l.player_id WHERE l.player_id=? AND l.status<>'converted' AND COALESCE(p.lifecycle_status,'') NOT IN ('archived','merged','blocked','guest_placeholder')`, [playerId]);
    if (!lead) throw new LeadError('Этому человеку уже нужен кабинет игрока или лид больше недоступен.', 409);
    const token = randomBytes(32).toString('base64url');
    await tx.run('UPDATE newcomer_leads SET management_token_hash=?, management_expires_at=? WHERE player_id=?', [leadManagementTokenHash(token), new Date(Date.now() + 90 * 86400_000).toISOString(), playerId]);
    return token;
  });
}

async function owner(db: DatabaseWrapper, token: unknown, now = new Date()) {
  await ensureNewcomerFunnelSchema(db);
  const hash = leadManagementTokenHash(token);
  const row = hash ? await db.get<{ player_id: string; evening_id: string | null; nickname: string }>(
    `SELECT l.player_id, l.evening_id, p.nickname FROM newcomer_leads l JOIN players p ON p.id=l.player_id
     WHERE l.management_token_hash=? AND l.management_expires_at>? AND l.status<>'converted'
       AND COALESCE(p.lifecycle_status,'') NOT IN ('archived','merged','blocked','guest_placeholder')`, [hash, now.toISOString()]) : null;
  if (!row) throw new LeadError('Ссылка недействительна или срок её действия закончился. Напиши организатору.', 401);
  return row;
}

export async function guestBookingTokenMatches(db: DatabaseWrapper, token: unknown, playerId: string) {
  try { return (await owner(db, token)).player_id === playerId; }
  catch (error) { if (error instanceof LeadError) return false; throw error; }
}

async function current(db: DatabaseWrapper, lead: { player_id: string; evening_id: string | null }) {
  const evening = lead.evening_id ? await db.get<{ id: string; title: string; starts_at: string; venue: string; status: string; settled_at: string | null }>('SELECT id,title,starts_at,venue,status,settled_at FROM game_evenings WHERE id=?', [lead.evening_id]) : null;
  const participant = evening ? await db.get<{ id: string; response_status: string; attendance_status: string }>('SELECT id,response_status,attendance_status FROM evening_participants WHERE evening_id=? AND player_id=?', [evening.id, lead.player_id]) : null;
  return { evening, participant, editable: !participant || participant.attendance_status === 'pending' };
}

export async function loadGuestBooking(db: DatabaseWrapper, token: unknown) {
  const lead = await owner(db, token);
  const { evening, participant, editable } = await current(db, lead);
  const games = evening && participant ? await db.all<{ number: number; starts_at: string }>(
    `SELECT s.slot_number AS number,s.starts_at FROM evening_slot_registrations r JOIN evening_game_slots s ON s.id=r.slot_id
     WHERE r.participant_id=? AND s.evening_id=? ORDER BY s.slot_number`, [participant.id, evening.id]) : [];
  return {
    name: lead.nickname,
    evening: evening ? { id: evening.id, title: evening.title, starts_at: evening.starts_at, venue: venueDetails(evening.venue), status: evening.status } : null,
    booked: Boolean(evening && isOpenEvening(evening) && participant?.response_status === 'going' && games.length),
    can_change: editable,
    can_cancel: Boolean(evening && editable),
    games,
  };
}

/** One secret authorizes one lead. All seat/answer changes use the existing player writers. */
export async function updateGuestBooking(db: DatabaseWrapper, token: unknown, input: { action?: unknown; evening_id?: unknown }) {
  if (input.action !== 'cancel' && input.action !== 'reschedule') throw new LeadError('Выбери отмену записи или другую дату.');
  await ensureNewcomerFunnelSchema(db);
  await db.transaction(async (tx) => {
    const lead = await owner(tx, token);
    const before = await current(tx, lead);
    if (!before.editable) throw new LeadError('Явка уже отмечена. Изменить запись может только организатор.', 409);
    let nextId: string | null = null;
    if (input.action === 'reschedule') {
      nextId = typeof input.evening_id === 'string' ? input.evening_id.slice(0, 80) : '';
      const next = nextId ? await tx.get(`SELECT id FROM game_evenings WHERE id=? AND UPPER(COALESCE(format,''))='NOVICE' AND ${openEveningSql()} AND datetime(starts_at)>=datetime('now','-3 hours')`, [nextId]) : null;
      if (!next) throw new LeadError('Этот вечер уже недоступен. Выбери другую дату.', 409);
      if (nextId === lead.evening_id && before.participant?.response_status === 'going' && await tx.get('SELECT 1 FROM evening_slot_registrations WHERE participant_id=? LIMIT 1', [before.participant.id])) return;
    }
    // Cancelled/closed evenings retain their history; only the lead's current request moves.
    if (before.evening && isOpenEvening(before.evening) && before.participant) {
      await replacePlayerSlotSelection(tx, before.evening.id, lead.player_id, [], { notifyOrganizer: false, source: 'welcome_booking' });
      await setParticipantResponse(tx, before.participant.id, 'declined', { byPlayer: true, source: 'welcome_booking' });
    }
    if (nextId) await tx.run("UPDATE newcomer_leads SET evening_id=?, status='active', recall_count=0, recall_evening_id=NULL WHERE player_id=?", [nextId, lead.player_id]);
    else await tx.run('UPDATE newcomer_leads SET evening_id=NULL WHERE player_id=?', [lead.player_id]);
    if (nextId) {
      await ensureSlotsForEvening(tx, nextId);
      const slots = await tx.all<{ id: string }>("SELECT id FROM evening_game_slots WHERE evening_id=? AND status='open' ORDER BY slot_number", [nextId]);
      if (!slots.length) throw new LeadError('На этот вечер запись уже закрыта. Выбери другую дату.', 409);
      await replacePlayerSlotSelection(tx, nextId, lead.player_id, slots.map(slot => slot.id), { noviceLead: true, source: 'welcome_booking' });
    }
  });
  return loadGuestBooking(db, token);
}
