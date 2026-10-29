import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureSlotsForEvening } from './eveningSlotPlanningService.ts';
import { seatingWarnings, type EveningSeat } from '../../lib/eveningSeating.ts';

const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };

export async function ensureEveningSeatingSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_seat_plans (
      id TEXT PRIMARY KEY,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL REFERENCES evening_game_slots(id) ON DELETE CASCADE,
      table_id TEXT NOT NULL REFERENCES evening_tables(id) ON DELETE CASCADE,
      seat_number INTEGER NOT NULL CHECK(seat_number BETWEEN 1 AND 10),
      player_id TEXT NOT NULL REFERENCES players(id),
      locked INTEGER NOT NULL DEFAULT 1,
      started INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(evening_id, slot_id, table_id, seat_number),
      UNIQUE(evening_id, slot_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_evening_seat_plans_player
      ON evening_seat_plans(evening_id, player_id);
  `);
}

/** Return the same plan to a player and CRM; player reads are filtered server-side. */
export async function loadEveningSeatBookings(db: DatabaseWrapper, eveningId: string, playerId?: string) {
  await ensureEveningSeatingSchema(db);
  return db.all<any>(`
    SELECT b.id, b.slot_id, s.slot_number AS game, b.table_id AS tableId,
           b.seat_number AS seat, b.player_id AS playerId,
           p.nickname, b.locked, b.started
      FROM evening_seat_plans b
      JOIN evening_game_slots s ON s.id = b.slot_id
      JOIN players p ON p.id = b.player_id
     WHERE b.evening_id = ? ${playerId ? 'AND b.player_id = ?' : ''}
     ORDER BY s.slot_number, b.table_id, b.seat_number
  `, playerId ? [eveningId, playerId] : [eveningId]);
}

export async function saveEveningSeatBooking(
  db: DatabaseWrapper,
  eveningId: string,
  playerId: string,
  input: { slotId: string; tableId: string; seat: number; override?: boolean },
  organizer = false,
) {
  await ensureSlotsForEvening(db, eveningId);
  await ensureEveningSeatingSchema(db);
  if (!Number.isInteger(input.seat) || input.seat < 1 || input.seat > 10) fail('Место должно быть от 1 до 10', 400);
  if (!input.slotId || !input.tableId) fail('Выберите игру и стол', 400);
  if (!organizer && input.override) fail('Обход ограничений доступен только организатору', 403);
  try {
    return await db.transaction(async (tx) => {
    const evening = await tx.get<any>('SELECT id, status, settled_at FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) fail('Вечер не найден', 404);
    if (evening.status === 'completed' || evening.settled_at) fail('Вечер завершён');
    const slot = await tx.get<any>('SELECT id, slot_number, status FROM evening_game_slots WHERE id = ? AND evening_id = ?', [input.slotId, eveningId]);
    if (!slot || slot.status !== 'open') fail('Игра недоступна', 409);
    const table = await tx.get<any>('SELECT id, capacity FROM evening_tables WHERE id = ? AND evening_id = ?', [input.tableId, eveningId]);
    if (!table) fail('Стол не принадлежит этому вечеру', 400);
    if (input.seat > Math.min(10, Number(table.capacity || 10))) fail('Место выходит за вместимость стола', 400);
    const participant = await tx.get<any>('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?', [eveningId, playerId]);
    if (!participant) fail('Сначала запишитесь на игру', 409);
    const selected = await tx.get<any>('SELECT 1 AS selected FROM evening_slot_registrations WHERE slot_id = ? AND participant_id = ?', [input.slotId, participant.id]);
    if (!organizer && !selected) fail('Сначала запишитесь на эту игру', 409);
    const prior = await tx.get<any>('SELECT id, started FROM evening_seat_plans WHERE evening_id = ? AND slot_id = ? AND player_id = ?', [eveningId, input.slotId, playerId]);
    if (prior?.started) fail('Место начавшейся игры менять нельзя');
    const rows = await tx.all<any>(`SELECT b.slot_id, s.slot_number AS game, b.table_id AS tableId, b.seat_number AS seat,
         b.player_id AS playerId, b.started
       FROM evening_seat_plans b JOIN evening_game_slots s ON s.id=b.slot_id
      WHERE b.evening_id = ?`, [eveningId]);
    const assignments: EveningSeat[] = rows.filter((r: any) => !(r.slot_id === input.slotId && r.playerId === playerId))
      .map((r: any) => ({ game: Number(r.game), tableId: String(r.tableId), seat: Number(r.seat), playerId: String(r.playerId), started: Boolean(r.started) }));
    const candidate = { game: Number(slot.slot_number), tableId: input.tableId, seat: input.seat, playerId };
    const warnings = seatingWarnings(candidate, assignments, selected || organizer ? [candidate.game] : []);
    // An occupied seat must never be overwritten: organizer must move its occupant first.
    if (warnings.some(w => w.code === 'occupied')) fail('Место уже занято');
    if (warnings.length && !(organizer && input.override)) {
      return { saved: false, warnings, requires_override: organizer };
    }
    const now = new Date().toISOString();
    if (prior) {
      await tx.run('UPDATE evening_seat_plans SET table_id=?, seat_number=?, locked=1, updated_at=? WHERE id=?',
        [input.tableId, input.seat, now, prior.id]);
    } else {
      await tx.run(`INSERT INTO evening_seat_plans
        (id,evening_id,slot_id,table_id,seat_number,player_id,locked,started,created_at,updated_at)
        VALUES (?,?,?,?,?,?,1,0,?,?)`,
        [randomUUID(),eveningId,input.slotId,input.tableId,input.seat,playerId,now,now]);
    }
    return { saved: true, warnings };
    });
  } catch (error: any) {
    // Concurrent bookings must be a normal 409 conflict, not an opaque 500.
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE|SQLITE_CONSTRAINT_PRIMARYKEY/i.test(String(error?.message || ''))) {
      fail('Место уже занято или игрок уже назначен на эту игру');
    }
    throw error;
  }
}

export async function cancelEveningSeatBooking(db: DatabaseWrapper, eveningId: string, slotId: string, playerId: string) {
  await ensureEveningSeatingSchema(db);
  const row = await db.get<any>('SELECT id, started FROM evening_seat_plans WHERE evening_id=? AND slot_id=? AND player_id=?',
    [eveningId,slotId,playerId]);
  if (!row) return { removed: false };
  if (row.started) fail('Начавшуюся игру менять нельзя');
  await db.run('DELETE FROM evening_seat_plans WHERE id=? AND started=0', [row.id]);
  return { removed: true };
}
