import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureGuestPlayerPlaceholderSchema } from '../../db/ensureGuestPlayerPlaceholderSchema.ts';
import { replaceClubGameSeatIdentity } from './clubGameSeatIdentityRepair.ts';

export const MAX_GUEST_PLUS = 10;
export const normalizeGuestPlus = (value: unknown) => Math.min(MAX_GUEST_PLUS, Math.max(0, Math.trunc(Number(value) || 0)));

export const GUEST_CONTACT_KINDS = ['vk', 'telegram', 'phone'] as const;
/** Contact of a guest: the kind and a trimmed value, or nothing when either is missing. */
export const normalizeGuestContact = (kind: unknown, value: unknown): { kind: string | null; value: string | null } => {
  const text = String(value ?? '').trim().slice(0, 120);
  const normalizedKind = String(kind ?? '').trim().toLowerCase();
  if (!text || !(GUEST_CONTACT_KINDS as readonly string[]).includes(normalizedKind)) return { kind: null, value: null };
  return { kind: normalizedKind, value: text };
};

export const isGuestPlaceholder = (row: any) => Boolean(row?.is_guest || row?.guest_placeholder_id);

export const serializeGuestPlaceholder = (row: any) => ({
  ...row,
  id: String(row.id),
  player_id: null,
  guest_placeholder_id: String(row.id),
  nickname: String(row.display_name || '').trim() || 'Гость',
  full_name: null,
  phone: row.contact_kind === 'phone' ? (row.contact_value || null) : null,
  telegram_username: null,
  contact_kind: row.contact_kind || null,
  contact_value: row.contact_value || null,
  plus_count: normalizeGuestPlus(row.plus_count),
  companion_of: row.companion_of ? String(row.companion_of) : null,
  lifecycle_status: 'guest_placeholder',
  elo: null,
  is_guest: true,
  response_status: row.response_status || 'unanswered',
  attendance_fact: row.attendance_status === 'attended'
    ? (row.arrival_status === 'late' ? 'attended_late' : 'attended_on_time')
    : row.attendance_status === 'no_show' ? 'no_show' : 'pending',
});

/**
 * «+N» of a guest are people too (owner, 2026-10-13): each one is a roster row of its own («Иван +1») linked to the
 * guest by `companion_of`. This makes the rows match the guest's `plus_count`: missing ones are created with the guest's
 * answer, table and price; extra ones are removed unless the person already arrived or sits in a game.
 */
export async function syncGuestCompanions(db: DatabaseWrapper, hostId: string) {
  const host = await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [hostId]);
  if (!host || host.companion_of) return;
  const want = normalizeGuestPlus(host.plus_count);
  const companions = await db.all<any>('SELECT * FROM guest_player_placeholders WHERE companion_of = ? AND replaced_at IS NULL ORDER BY created_at ASC, id ASC', [hostId]);
  const now = new Date().toISOString();
  const hostName = String(host.display_name || '').trim() || 'Гость';
  const due = Math.max(0, Number(host.amount_due || 0));
  const kept = [...companions];
  while (kept.length < want) {
    const taken = new Set(kept.map((item) => String(item.display_name)));
    let number = kept.length + 1;
    while (taken.has(`${hostName} +${number}`)) number += 1;
    const id = crypto.randomUUID();
    const response = ['going', 'late', 'thinking', 'declined', 'unanswered'].includes(String(host.response_status)) ? String(host.response_status) : 'unanswered';
    await db.run(`
      INSERT INTO guest_player_placeholders (
        id, evening_id, display_name, table_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes,
        registered_at, confirmed_at, created_at, updated_at, plus_count, companion_of
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, NULL, ?, ?, ?, ?, 0, ?)
    `, [id, host.evening_id, `${hostName} +${number}`, host.table_id || null, response, response, due === 0 ? 'waived' : 'unpaid', due, now, response === 'going' || response === 'late' ? now : null, now, now, hostId]);
    kept.push({ id, display_name: `${hostName} +${number}`, attendance_status: 'pending' });
  }
  while (kept.length > want) {
    const last = kept[kept.length - 1];
    const playing = await db.get<any>('SELECT 1 FROM games WHERE evening_id = ? AND (slots_json LIKE ? OR protocol_text LIKE ?) LIMIT 1', [host.evening_id, `%${last.id}%`, `%${last.id}%`]);
    if (String(last.attendance_status || 'pending') !== 'pending' || playing) break;
    await db.run('DELETE FROM guest_player_placeholders WHERE id = ?', [last.id]);
    kept.pop();
  }
  if (kept.length !== normalizeGuestPlus(host.plus_count)) await db.run('UPDATE guest_player_placeholders SET plus_count = ?, updated_at = ? WHERE id = ?', [kept.length, now, hostId]);
}

export async function listGuestPlaceholdersForEvening(db: DatabaseWrapper, eveningId: string) {
  await ensureGuestPlayerPlaceholderSchema(db);
  // Guests saved before «+N» became rows get their rows here, once.
  const lacking = await db.all<any>(`
    SELECT h.id FROM guest_player_placeholders h
     WHERE h.evening_id = ? AND h.replaced_at IS NULL AND h.companion_of IS NULL AND h.plus_count > 0
       AND h.plus_count > (SELECT COUNT(*) FROM guest_player_placeholders c WHERE c.companion_of = h.id AND c.replaced_at IS NULL)
  `, [eveningId]);
  for (const row of lacking) await syncGuestCompanions(db, String(row.id));
  const rows = await db.all<any>('SELECT * FROM guest_player_placeholders WHERE evening_id = ? AND replaced_at IS NULL ORDER BY created_at ASC, id ASC', [eveningId]);
  return rows.map(serializeGuestPlaceholder);
}

export async function createGuestPlaceholder(db: DatabaseWrapper, input: {
  eveningId: string;
  displayName?: string | null;
  tableId?: string | null;
  responseStatus?: string | null;
  amountDue?: number | null;
  amountPaid?: number | null;
  notes?: string | null;
  contactKind?: string | null;
  contactValue?: string | null;
  plusCount?: number | null;
}) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [input.eveningId]);
  if (!evening) throw new Error('Игровой вечер не найден');
  if (evening.status === 'completed' || evening.settled_at) throw new Error('Завершённый вечер доступен только для чтения');
  if (input.tableId && !await db.get('SELECT id FROM evening_tables WHERE id = ? AND evening_id = ?', [input.tableId, input.eveningId])) throw new Error('Игровой стол не найден на этом вечере');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const cleanContact = normalizeGuestContact(input.contactKind, input.contactValue);
  const displayName = String(input.displayName || '').trim() || 'Гость';
  const responseStatus = ['going', 'late', 'thinking', 'declined', 'unanswered'].includes(String(input.responseStatus)) ? String(input.responseStatus) : 'unanswered';
  const due = Math.max(0, Number(input.amountDue ?? evening.default_price ?? 0));
  const paid = Math.max(0, Number(input.amountPaid ?? 0));
  const paymentStatus = due === 0 ? 'waived' : paid >= due && due > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  await db.run(`
    INSERT INTO guest_player_placeholders (
      id, evening_id, display_name, table_id, response_status, registration_status,
      attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes,
      registered_at, confirmed_at, created_at, updated_at, contact_kind, contact_value, plus_count
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id,input.eveningId,displayName,input.tableId || null,responseStatus,responseStatus,paymentStatus,due,paid,input.notes || null,now,responseStatus === 'going' || responseStatus === 'late' ? now : null,now,now,cleanContact.kind,cleanContact.value,normalizeGuestPlus(input.plusCount)]);
  await syncGuestCompanions(db, id);
  return serializeGuestPlaceholder(await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [id]));
}

export async function setGuestAttendance(db: DatabaseWrapper, guestId: string, fact: 'pending' | 'attended_on_time' | 'attended_late' | 'no_show') {
  await ensureGuestPlayerPlaceholderSchema(db);
  const now = new Date().toISOString();
  const values: Record<typeof fact, [string, string, string | null]> = {
    pending: ['pending', 'unknown', null],
    attended_on_time: ['attended', 'on_time', now],
    attended_late: ['attended', 'late', now],
    no_show: ['no_show', 'unknown', null],
  };
  const [attendance, arrival, checkedIn] = values[fact];
  await db.run('UPDATE guest_player_placeholders SET attendance_status = ?, arrival_status = ?, checked_in_at = ?, updated_at = ? WHERE id = ?', [attendance, arrival, checkedIn, now, guestId]);
}

export async function updateGuestPlaceholder(db: DatabaseWrapper, guestId: string, patch: Record<string, any>) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const current = await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [guestId]);
  if (!current) return null;
  const fields: string[] = [];
  const values: any[] = [];
  if (patch.table_id !== undefined) { fields.push('table_id = ?'); values.push(patch.table_id || null); }
  if (patch.response_status !== undefined) { fields.push('response_status = ?', 'registration_status = ?'); values.push(patch.response_status, patch.response_status); }
  for (const key of ['payment_status', 'amount_due', 'amount_paid', 'notes'] as const) {
    if (patch[key] !== undefined) { fields.push(`${key} = ?`); values.push(patch[key]); }
  }
  if (fields.length) {
    fields.push('updated_at = ?'); values.push(new Date().toISOString(), guestId);
    await db.run(`UPDATE guest_player_placeholders SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  if (patch.nickname !== undefined && String(patch.nickname).trim()) {
    await db.run('UPDATE guest_player_placeholders SET display_name = ?, updated_at = ? WHERE id = ?', [String(patch.nickname).trim().slice(0, 80), new Date().toISOString(), guestId]);
  }
  if (!current.companion_of) {
    if (patch.plus_count !== undefined) {
      await db.run('UPDATE guest_player_placeholders SET plus_count = ?, updated_at = ? WHERE id = ?', [normalizeGuestPlus(patch.plus_count), new Date().toISOString(), guestId]);
    }
    // The people who come with the guest follow the guest's answer and table, unless they are already at the club.
    if (patch.response_status !== undefined || patch.table_id !== undefined) {
      await db.run(`UPDATE guest_player_placeholders SET ${patch.response_status !== undefined ? 'response_status = ?, registration_status = ?,' : ''} ${patch.table_id !== undefined ? 'table_id = ?,' : ''} updated_at = ?
                     WHERE companion_of = ? AND attendance_status = 'pending'`,
        [...(patch.response_status !== undefined ? [patch.response_status, patch.response_status] : []), ...(patch.table_id !== undefined ? [patch.table_id || null] : []), new Date().toISOString(), guestId]);
    }
    await syncGuestCompanions(db, guestId);
  }
  if (patch.contact_kind !== undefined || patch.contact_value !== undefined) {
    const contact = normalizeGuestContact(patch.contact_kind, patch.contact_value);
    await db.run('UPDATE guest_player_placeholders SET contact_kind = ?, contact_value = ?, updated_at = ? WHERE id = ?', [contact.kind, contact.value, new Date().toISOString(), guestId]);
  }
  if (patch.attendance_fact) await setGuestAttendance(db, guestId, patch.attendance_fact);
  return serializeGuestPlaceholder(await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [guestId]));
}

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const mergeNotes = (...values: unknown[]) => {
  const notes = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  return notes.length ? notes.join('\n') : null;
};

const mergedPaymentStatus = (amountDue: number, amountPaid: number) => {
  if (amountDue <= 0) return amountPaid > 0 ? 'paid' : 'waived';
  if (amountPaid >= amountDue) return 'paid';
  if (amountPaid > 0) return 'partial';
  return 'unpaid';
};

async function mergeGuestEveningFactsIntoParticipant(tx: DatabaseWrapper, participant: any, guest: any, now: string) {
  const amountDue = Math.max(0, Number(participant.amount_due || 0), Number(guest.amount_due || 0));
  const amountPaid = Math.max(0, Number(participant.amount_paid || 0), Number(guest.amount_paid || 0));
  const responseStatus = String(participant.response_status || 'unanswered') === 'unanswered'
    ? String(guest.response_status || 'unanswered')
    : String(participant.response_status || 'unanswered');
  const registrationStatus = String(participant.registration_status || 'unanswered') === 'unanswered'
    ? String(guest.registration_status || guest.response_status || 'unanswered')
    : String(participant.registration_status || 'unanswered');
  const attendanceStatus = String(participant.attendance_status || 'pending') === 'pending'
    ? String(guest.attendance_status || 'pending')
    : String(participant.attendance_status || 'pending');
  const arrivalStatus = String(participant.arrival_status || 'unknown') === 'unknown'
    ? String(guest.arrival_status || 'unknown')
    : String(participant.arrival_status || 'unknown');

  await tx.run(`
    UPDATE evening_participants
       SET table_id = COALESCE(table_id, ?),
           response_status = ?, registration_status = ?,
           attendance_status = ?, arrival_status = ?,
           payment_status = ?, amount_due = ?, amount_paid = ?,
           notes = ?, registered_at = COALESCE(registered_at, ?),
           confirmed_at = COALESCE(confirmed_at, ?), checked_in_at = COALESCE(checked_in_at, ?),
           updated_at = ?
     WHERE id = ?
  `, [
    guest.table_id || null,
    responseStatus,
    registrationStatus,
    attendanceStatus,
    arrivalStatus,
    mergedPaymentStatus(amountDue, amountPaid),
    amountDue,
    amountPaid,
    mergeNotes(participant.notes, guest.notes, 'Гостевая запись заменена зарегистрированным игроком'),
    guest.registered_at || guest.created_at || now,
    guest.confirmed_at || null,
    guest.checked_in_at || null,
    now,
    String(participant.id),
  ]);
  return tx.get<any>('SELECT * FROM evening_participants WHERE id = ?', [String(participant.id)]);
}

export async function replaceGuestWithRegisteredPlayer(db: DatabaseWrapper, input: {
  gameId: number;
  seatNumber: number;
  replacementPlayerId: string;
}) {
  await ensureGuestPlayerPlaceholderSchema(db);
  return db.transaction(async (tx) => {
    const game = await tx.get<any>('SELECT * FROM games WHERE id = ?', [input.gameId]);
    if (!game) throw new Error('Игра не найдена');
    if (!game.evening_id) throw new Error('Это не игра обычного вечера');
    if (game.archived_at) throw new Error('Сначала восстановите игру из архива');
    const envelope = safeJsonParse<any>(game.protocol_text, null);
    if (!envelope || envelope.kind !== 'club_evening_protocol' || envelope.version !== 1) throw new Error('У игры отсутствует структурированный клубный протокол');

    const player = await tx.get<any>("SELECT id, nickname FROM players WHERE id = ? AND COALESCE(source, '') != 'legacy_guest_migrated' AND COALESCE(lifecycle_status, 'normal') NOT IN ('archived', 'merged')", [input.replacementPlayerId]);
    if (!player) throw new Error('Выбранный зарегистрированный игрок не найден');
    if (String(game.judge_player_id || '') === String(player.id)) throw new Error('Судья этой игры не может сидеть за столом');

    const current = (envelope.player_results || []).find((item: any) => Number(item.seat_number) === input.seatNumber);
    if (!current) throw new Error('Выбранное место не найдено');

    const priorAudit = await tx.get<any>(`
      SELECT * FROM guest_player_replacement_audit
       WHERE game_id = ? AND seat_number = ? AND replacement_player_id = ?
       ORDER BY created_at DESC LIMIT 1
    `, [input.gameId, input.seatNumber, String(player.id)]);
    if (priorAudit && String(current.player_id || '') === String(player.id)) {
      return { changed:false,idempotent:true,guestId:String(priorAudit.guest_placeholder_id),playerId:String(player.id),participantId:String(priorAudit.replacement_participant_id),envelope,slots:safeJsonParse<any[]>(game.slots_json, []) };
    }

    const guestId = String(current?.guest_placeholder_id || (current?.player_id ? '' : current?.participant_id || '')).trim();
    if (!guestId) {
      // A registered player sat on the wrong seat (owner, 2026-10-03): swap them for another player of this evening.
      if (String(current.player_id || '') === String(player.id)) {
        return { changed:false,idempotent:true,guestId:'',playerId:String(player.id),participantId:String(current.participant_id || ''),envelope,slots:safeJsonParse<any[]>(game.slots_json, []) };
      }
      const participant = await tx.get<any>('SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [String(game.evening_id), String(player.id)]);
      if (!participant) throw new Error('Этот игрок не записан на вечер — сначала добавьте его в состав вечера');
      const repaired = replaceClubGameSeatIdentity(
        envelope,
        safeJsonParse<any[]>(game.slots_json, []),
        input.seatNumber,
        { participantId:String(participant.id),playerId:String(player.id),nickname:String(player.nickname) },
      );
      await tx.run('UPDATE games SET protocol_text = ?, slots_json = ? WHERE id = ?', [JSON.stringify(repaired.envelope),JSON.stringify(repaired.slots),input.gameId]);
      return { changed:true,idempotent:false,guestId:'',playerId:String(player.id),participantId:String(participant.id),oldPlayerId:repaired.oldPlayerId || null,envelope:repaired.envelope,slots:repaired.slots };
    }
    const guest = await tx.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ? AND evening_id = ?', [guestId, String(game.evening_id)]);
    if (!guest) throw new Error('Гостевая заглушка не найдена');
    if ((envelope.player_results || []).some((item: any) => Number(item.seat_number) !== input.seatNumber && String(item.player_id || '') === String(player.id))) throw new Error('Этот зарегистрированный игрок уже занимает другое место в игре');

    const existingAudit = await tx.get<any>(`
      SELECT * FROM guest_player_replacement_audit
       WHERE game_id = ? AND seat_number = ? AND guest_placeholder_id = ? AND replacement_player_id = ? LIMIT 1
    `, [input.gameId, input.seatNumber, guestId, String(player.id)]);
    if (existingAudit) return { changed:false,idempotent:true,guestId,playerId:String(player.id),participantId:String(existingAudit.replacement_participant_id),envelope,slots:safeJsonParse<any[]>(game.slots_json, []) };

    const now = new Date().toISOString();
    let participant = await tx.get<any>('SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [String(game.evening_id), String(player.id)]);
    if (!participant) {
      const id = crypto.randomUUID();
      await tx.run(`
        INSERT INTO evening_participants (
          id, evening_id, player_id, table_id, response_status, registration_status,
          attendance_status, arrival_status, payment_status, amount_due, amount_paid,
          notes, registered_at, checked_in_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', 'waived', 0, 0, ?, ?, NULL, ?, ?)
      `, [id,String(game.evening_id),String(player.id),guest.table_id || null,'Создано при явной замене гостя',now,now,now]);
      participant = await tx.get<any>('SELECT * FROM evening_participants WHERE id = ?', [id]);
    }
    participant = await mergeGuestEveningFactsIntoParticipant(tx, participant, guest, now);

    const repaired = replaceClubGameSeatIdentity(
      envelope,
      safeJsonParse<any[]>(game.slots_json, []),
      input.seatNumber,
      { participantId:String(participant.id),playerId:String(player.id),nickname:String(player.nickname) },
    );
    await tx.run('UPDATE games SET protocol_text = ?, slots_json = ? WHERE id = ?', [JSON.stringify(repaired.envelope),JSON.stringify(repaired.slots),input.gameId]);
    await tx.run('UPDATE guest_player_placeholders SET replaced_by_player_id = ?, replaced_at = ?, updated_at = ? WHERE id = ?', [String(player.id),now,now,guestId]);
    await tx.run(`
      INSERT INTO guest_player_replacement_audit (
        id, game_id, seat_number, guest_placeholder_id, replacement_player_id, replacement_participant_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [crypto.randomUUID(),input.gameId,input.seatNumber,guestId,String(player.id),String(participant.id),now]);
    return { changed:true,idempotent:false,guestId,playerId:String(player.id),participantId:String(participant.id),oldPlayerId:repaired.oldPlayerId || null,envelope:repaired.envelope,slots:repaired.slots };
  });
}

/**
 * Owner, 2026-10-03: a seat may be handed to a guest without a profile ("Точка +1").
 * A new guest placeholder of the game's evening takes the seat; role, fouls, voting and result stay with the seat.
 */
export async function replaceSeatWithGuest(db: DatabaseWrapper, input: {
  gameId: number;
  seatNumber: number;
  nickname: string;
}) {
  const nickname = String(input.nickname || '').trim();
  if (!nickname) throw new Error('Укажите имя или ник гостя');
  await ensureGuestPlayerPlaceholderSchema(db);
  return db.transaction(async (tx) => {
    const game = await tx.get<any>('SELECT * FROM games WHERE id = ?', [input.gameId]);
    if (!game) throw new Error('Игра не найдена');
    if (!game.evening_id) throw new Error('Это не игра обычного вечера');
    if (game.archived_at) throw new Error('Сначала восстановите игру из архива');
    const envelope = safeJsonParse<any>(game.protocol_text, null);
    if (!envelope || envelope.kind !== 'club_evening_protocol' || envelope.version !== 1) throw new Error('У игры отсутствует структурированный клубный протокол');
    const current = (envelope.player_results || []).find((item: any) => Number(item.seat_number) === input.seatNumber);
    if (!current) throw new Error('Выбранное место не найдено');
    const guest = await createGuestPlaceholder(tx, { eveningId: String(game.evening_id), displayName: nickname, responseStatus: 'going' });
    await setGuestAttendance(tx, guest.id, 'attended_on_time');
    const repaired = replaceClubGameSeatIdentity(
      envelope,
      safeJsonParse<any[]>(game.slots_json, []),
      input.seatNumber,
      { participantId: guest.id, playerId: '', nickname: guest.nickname, guestPlaceholderId: guest.id },
    );
    await tx.run('UPDATE games SET protocol_text = ?, slots_json = ? WHERE id = ?', [JSON.stringify(repaired.envelope), JSON.stringify(repaired.slots), input.gameId]);
    return { changed: true, idempotent: false, guestId: guest.id, playerId: '', participantId: guest.id, oldPlayerId: repaired.oldPlayerId || null, envelope: repaired.envelope, slots: repaired.slots };
  });
}
