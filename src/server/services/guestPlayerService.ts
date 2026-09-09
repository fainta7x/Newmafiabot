import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureGuestPlayerPlaceholderSchema } from '../../db/ensureGuestPlayerPlaceholderSchema.ts';
import { replaceClubGameSeatIdentity } from './clubGameSeatIdentityRepair.ts';

export const isGuestPlaceholder = (row: any) => Boolean(row?.is_guest || row?.guest_placeholder_id);

export const serializeGuestPlaceholder = (row: any) => ({
  ...row,
  id: String(row.id),
  player_id: null,
  guest_placeholder_id: String(row.id),
  nickname: String(row.display_name || '').trim() || 'Гость',
  full_name: null,
  phone: null,
  telegram_username: null,
  lifecycle_status: 'guest_placeholder',
  elo: null,
  is_guest: true,
  response_status: row.response_status || 'unanswered',
  attendance_fact: row.attendance_status === 'attended'
    ? (row.arrival_status === 'late' ? 'attended_late' : 'attended_on_time')
    : row.attendance_status === 'no_show' ? 'no_show' : 'pending',
});

export async function listGuestPlaceholdersForEvening(db: DatabaseWrapper, eveningId: string) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const rows = await db.all<any>(`
    SELECT * FROM guest_player_placeholders
     WHERE evening_id = ? AND replaced_at IS NULL
     ORDER BY created_at ASC, id ASC
  `, [eveningId]);
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
}) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [input.eveningId]);
  if (!evening) throw new Error('Игровой вечер не найден');
  if (evening.status === 'completed' || evening.settled_at) throw new Error('Завершённый вечер доступен только для чтения');
  if (input.tableId && !await db.get('SELECT id FROM evening_tables WHERE id = ? AND evening_id = ?', [input.tableId, input.eveningId])) {
    throw new Error('Игровой стол не найден на этом вечере');
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const displayName = String(input.displayName || '').trim() || 'Гость';
  const responseStatus = ['going', 'late', 'thinking', 'declined', 'unanswered'].includes(String(input.responseStatus))
    ? String(input.responseStatus)
    : 'unanswered';
  const due = Math.max(0, Number(input.amountDue ?? evening.default_price ?? 0));
  const paid = Math.max(0, Number(input.amountPaid ?? 0));
  const paymentStatus = due === 0 ? 'waived' : paid >= due && due > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  await db.run(`
    INSERT INTO guest_player_placeholders (
      id, evening_id, display_name, table_id, response_status, registration_status,
      attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes,
      registered_at, confirmed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, input.eveningId, displayName, input.tableId || null, responseStatus, responseStatus,
    paymentStatus, due, paid, input.notes || null, now,
    responseStatus === 'going' || responseStatus === 'late' ? now : null,
    now, now,
  ]);
  const row = await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [id]);
  return serializeGuestPlaceholder(row);
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
  await db.run(
    'UPDATE guest_player_placeholders SET attendance_status = ?, arrival_status = ?, checked_in_at = ?, updated_at = ? WHERE id = ?',
    [attendance, arrival, checkedIn, now, guestId],
  );
}

export async function updateGuestPlaceholder(db: DatabaseWrapper, guestId: string, patch: Record<string, any>) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const current = await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [guestId]);
  if (!current) return null;
  const fields: string[] = [];
  const values: any[] = [];
  if (patch.table_id !== undefined) { fields.push('table_id = ?'); values.push(patch.table_id || null); }
  if (patch.response_status !== undefined) {
    fields.push('response_status = ?', 'registration_status = ?');
    values.push(patch.response_status, patch.response_status);
  }
  for (const key of ['payment_status', 'amount_due', 'amount_paid', 'notes'] as const) {
    if (patch[key] !== undefined) { fields.push(`${key} = ?`); values.push(patch[key]); }
  }
  if (fields.length) {
    fields.push('updated_at = ?');
    values.push(new Date().toISOString(), guestId);
    await db.run(`UPDATE guest_player_placeholders SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  if (patch.attendance_fact) await setGuestAttendance(db, guestId, patch.attendance_fact);
  return serializeGuestPlaceholder(await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ?', [guestId]));
}

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export async function replaceGuestWithRegisteredPlayer(db: DatabaseWrapper, input: {
  gameId: number;
  seatNumber: number;
  replacementPlayerId: string;
}) {
  await ensureGuestPlayerPlaceholderSchema(db);
  const game = await db.get<any>('SELECT * FROM games WHERE id = ?', [input.gameId]);
  if (!game) throw new Error('Игра не найдена');
  if (!game.evening_id) throw new Error('Это не игра обычного вечера');
  if (game.archived_at) throw new Error('Сначала восстановите игру из архива');

  const envelope = safeJsonParse<any>(game.protocol_text, null);
  if (!envelope || envelope.kind !== 'club_evening_protocol' || envelope.version !== 1) throw new Error('У игры отсутствует структурированный клубный протокол');
  const current = (envelope.player_results || []).find((item: any) => Number(item.seat_number) === input.seatNumber);
  const guestId = String(current?.guest_placeholder_id || (current?.player_id ? '' : current?.participant_id || '')).trim();
  if (!guestId) throw new Error('На выбранном месте нет гостя');
  const guest = await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id = ? AND evening_id = ?', [guestId, String(game.evening_id)]);
  if (!guest) throw new Error('Гостевая заглушка не найдена');

  const player = await db.get<any>("SELECT id, nickname FROM players WHERE id = ? AND COALESCE(source, '') NOT IN ('quick_guest','legacy_guest_migrated') AND COALESCE(lifecycle_status, 'normal') != 'archived'", [input.replacementPlayerId]);
  if (!player) throw new Error('Выбранный зарегистрированный игрок не найден');
  if ((envelope.player_results || []).some((item: any) => Number(item.seat_number) !== input.seatNumber && String(item.player_id || '') === String(player.id))) {
    throw new Error('Этот зарегистрированный игрок уже занимает другое место в игре');
  }

  const existingAudit = await db.get<any>(`
    SELECT * FROM guest_player_replacement_audit
     WHERE game_id = ? AND seat_number = ? AND guest_placeholder_id = ? AND replacement_player_id = ?
     LIMIT 1
  `, [input.gameId, input.seatNumber, guestId, String(player.id)]);
  if (existingAudit) return { changed: false, idempotent: true, guestId, playerId: String(player.id) };

  const now = new Date().toISOString();
  let participant = await db.get<any>('SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [String(game.evening_id), String(player.id)]);
  if (!participant) {
    const id = crypto.randomUUID();
    await db.run(`
      INSERT INTO evening_participants (
        id, evening_id, player_id, table_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid,
        notes, registered_at, checked_in_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'unanswered', 'unanswered', 'attended', 'on_time', 'waived', 0, 0, ?, ?, ?, ?, ?)
    `, [id, String(game.evening_id), String(player.id), guest.table_id || null, 'Создано при явной замене гостя', now, now, now, now]);
    participant = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', [id]);
  }

  const repaired = replaceClubGameSeatIdentity(
    envelope,
    safeJsonParse<any[]>(game.slots_json, []),
    input.seatNumber,
    { participantId: String(participant.id), playerId: String(player.id), nickname: String(player.nickname) },
  );
  await db.run('UPDATE games SET protocol_text = ?, slots_json = ? WHERE id = ?', [JSON.stringify(repaired.envelope), JSON.stringify(repaired.slots), input.gameId]);
  await db.run('UPDATE guest_player_placeholders SET replaced_by_player_id = ?, replaced_at = ?, updated_at = ? WHERE id = ?', [String(player.id), now, now, guestId]);
  await db.run(`
    INSERT INTO guest_player_replacement_audit (
      id, game_id, seat_number, guest_placeholder_id, replacement_player_id, replacement_participant_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), input.gameId, input.seatNumber, guestId, String(player.id), String(participant.id), now]);

  return {
    changed: true,
    idempotent: false,
    guestId,
    playerId: String(player.id),
    participantId: String(participant.id),
    oldPlayerId: repaired.oldPlayerId || null,
    envelope: repaired.envelope,
    slots: repaired.slots,
  };
}
