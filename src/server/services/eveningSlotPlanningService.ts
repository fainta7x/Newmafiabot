import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureEveningSlotsSchema } from '../../db/ensureEveningSlotsSchema.ts';
import { setParticipantResponse } from './eveningParticipantState.ts';

export const SLOT_PRICE = 100;
export const TABLE_MIN_PLAYERS = 11;
export const TABLE_MIN_READY_SLOTS = 4;

const plusMinutes = (value: string, minutes: number) => new Date(new Date(value).getTime() + minutes * 60000).toISOString();
const plannedCount = (evening: any) => {
  const a = new Date(evening.starts_at).getTime();
  const b = evening.ends_at ? new Date(evening.ends_at).getTime() : 0;
  const hours = b > a ? Math.round((b - a) / 3600000) : 0;
  return hours >= 1 && hours <= 12 ? hours : 6;
};

const normalizeStartsAt = (value: unknown, fallback: string) => {
  const raw = String(value ?? fallback).trim();
  const time = new Date(raw).getTime();
  if (!raw || !Number.isFinite(time)) {
    throw Object.assign(new Error('Некорректное время первой игры'), { statusCode: 400 });
  }
  return raw;
};

export async function ensureSlotsForEvening(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningSlotsSchema(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const now = new Date().toISOString();
  let settings = await db.get<any>('SELECT * FROM evening_slot_settings WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (!settings) {
    await db.run('INSERT INTO evening_slot_settings (evening_id, planned_slots, slot_duration_minutes, price_per_game, ready_slots_required, ready_players_per_slot, created_at, updated_at) VALUES (?, ?, 60, 100, 4, 11, ?, ?)', [eveningId, plannedCount(evening), now, now]);
    settings = await db.get<any>('SELECT * FROM evening_slot_settings WHERE evening_id = ? LIMIT 1', [eveningId]);
  }
  let slots = await db.all<any>('SELECT * FROM evening_game_slots WHERE evening_id = ? ORDER BY slot_number', [eveningId]);
  if (!slots.length) {
    const duration = Number(settings.slot_duration_minutes || 60);
    for (let i = 0; i < Number(settings.planned_slots || 6); i += 1) {
      await db.run('INSERT OR IGNORE INTO evening_game_slots (id, evening_id, slot_number, starts_at, ends_at, price_rub, target_players, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), eveningId, i + 1, plusMinutes(evening.starts_at, i * duration), plusMinutes(evening.starts_at, (i + 1) * duration), Number(settings.price_per_game || 100), Number(settings.ready_players_per_slot || 11), 'open', now, now]);
    }
    slots = await db.all<any>('SELECT * FROM evening_game_slots WHERE evening_id = ? ORDER BY slot_number', [eveningId]);
    const legacy = await db.all<any>("SELECT id FROM evening_participants WHERE evening_id = ? AND response_status IN ('going','late')", [eveningId]);
    for (const participant of legacy) for (const slot of slots) await db.run('INSERT OR IGNORE INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), slot.id, participant.id, now, now]);
  }
  return { evening, settings, slots };
}

export async function updateEveningSlotSettings(
  db: DatabaseWrapper,
  eveningId: string,
  input: {
    planned_slots?: unknown;
    price_per_game?: unknown;
    slot_duration_minutes?: unknown;
    starts_at?: unknown;
  },
) {
  const { evening, settings } = await ensureSlotsForEvening(db, eveningId);
  if (evening.status === 'completed' || evening.settled_at) throw Object.assign(new Error('Завершённый вечер менять нельзя'), { statusCode: 409 });

  const nextCount = Math.max(1, Math.min(12, Math.round(Number(input.planned_slots ?? settings.planned_slots ?? 6))));
  const nextPrice = Math.max(0, Math.round(Number(input.price_per_game ?? settings.price_per_game ?? SLOT_PRICE)));
  const nextDuration = Math.max(15, Math.min(180, Math.round(Number(input.slot_duration_minutes ?? settings.slot_duration_minutes ?? 60))));
  const nextStartsAt = normalizeStartsAt(input.starts_at, evening.starts_at);
  if (!Number.isFinite(nextCount) || !Number.isFinite(nextPrice) || !Number.isFinite(nextDuration)) {
    throw Object.assign(new Error('Некорректные настройки игровых слотов'), { statusCode: 400 });
  }

  const currentSlots = await db.all<any>('SELECT id, slot_number FROM evening_game_slots WHERE evening_id = ? ORDER BY slot_number', [eveningId]);
  const removed = currentSlots.filter((slot) => Number(slot.slot_number) > nextCount);
  for (const slot of removed) {
    const registrations = await db.get<any>('SELECT COUNT(*) AS count FROM evening_slot_registrations WHERE slot_id = ?', [slot.id]);
    if (Number(registrations?.count || 0) > 0) {
      throw Object.assign(new Error(`Нельзя убрать игру ${slot.slot_number}: на неё уже есть запись`), { statusCode: 409 });
    }
  }

  const now = new Date().toISOString();
  const targetPlayers = Number(settings.ready_players_per_slot || TABLE_MIN_PLAYERS);
  await db.transaction(async (tx: any) => {
    for (const slot of removed) await tx.run('DELETE FROM evening_game_slots WHERE id = ?', [slot.id]);

    const keptSlots = currentSlots.filter((slot) => Number(slot.slot_number) <= nextCount);
    for (const slot of keptSlots) {
      const index = Number(slot.slot_number) - 1;
      await tx.run(
        'UPDATE evening_game_slots SET starts_at = ?, ends_at = ?, price_rub = ?, target_players = ?, updated_at = ? WHERE id = ?',
        [plusMinutes(nextStartsAt, index * nextDuration), plusMinutes(nextStartsAt, (index + 1) * nextDuration), nextPrice, targetPlayers, now, slot.id],
      );
    }

    for (let i = currentSlots.length; i < nextCount; i += 1) {
      await tx.run(
        'INSERT OR IGNORE INTO evening_game_slots (id, evening_id, slot_number, starts_at, ends_at, price_rub, target_players, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), eveningId, i + 1, plusMinutes(nextStartsAt, i * nextDuration), plusMinutes(nextStartsAt, (i + 1) * nextDuration), nextPrice, targetPlayers, 'open', now, now],
      );
    }

    await tx.run(
      'UPDATE evening_slot_settings SET planned_slots = ?, slot_duration_minutes = ?, price_per_game = ?, updated_at = ? WHERE evening_id = ?',
      [nextCount, nextDuration, nextPrice, now, eveningId],
    );
    await tx.run(
      'UPDATE game_evenings SET starts_at = ?, ends_at = ?, default_price = ?, updated_at = ? WHERE id = ?',
      [nextStartsAt, plusMinutes(nextStartsAt, nextCount * nextDuration), nextPrice, now, eveningId],
    );
  });
  return loadEveningSlotPlan(db, eveningId);
}

export async function loadEveningSlotPlan(db: DatabaseWrapper, eveningId: string, playerId?: string | null) {
  const { evening, settings } = await ensureSlotsForEvening(db, eveningId);
  const own = playerId ? await db.get<any>('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [eveningId, playerId]) : null;
  const rows = await db.all<any>('SELECT s.id, s.slot_number, s.starts_at, s.ends_at, s.price_rub, s.target_players, s.status, COUNT(r.id) AS registered_count FROM evening_game_slots s LEFT JOIN evening_slot_registrations r ON r.slot_id = s.id WHERE s.evening_id = ? GROUP BY s.id, s.slot_number, s.starts_at, s.ends_at, s.price_rub, s.target_players, s.status ORDER BY s.slot_number', [eveningId]);
  const slots: any[] = [];
  for (const row of rows) {
    const people = await db.all<any>('SELECT p.id, p.nickname FROM evening_slot_registrations r JOIN evening_participants ep ON ep.id = r.participant_id JOIN players p ON p.id = ep.player_id WHERE r.slot_id = ? ORDER BY p.nickname COLLATE NOCASE', [row.id]);
    const selected = own ? Boolean(await db.get<any>('SELECT 1 AS ok FROM evening_slot_registrations WHERE slot_id = ? AND participant_id = ? LIMIT 1', [row.id, own.id])) : false;
    slots.push({ id: row.id, slot_number: Number(row.slot_number), starts_at: row.starts_at, ends_at: row.ends_at, price: Number(row.price_rub || 100), target_players: Number(row.target_players || 11), registered_count: Number(row.registered_count || 0), selected, participants: people });
  }
  const requiredPlayers = Number(settings.ready_players_per_slot || 11);
  const requiredSlots = Number(settings.ready_slots_required || 4);
  const ready = slots.filter(s => s.registered_count >= requiredPlayers).length;
  const selected = slots.filter(s => s.selected);
  return {
    event: {
      id: evening.id,
      title: evening.title,
      starts_at: evening.starts_at,
      ends_at: evening.ends_at,
      timezone: evening.timezone,
      venue: evening.venue,
      format: evening.format || 'CASUAL',
      status: evening.status,
      event_type: 'evening',
      price_per_game: Number(settings.price_per_game || 100),
      slot_duration_minutes: Number(settings.slot_duration_minutes || 60),
      slot_count: slots.length,
      assembled_slots: ready,
      required_slots: requiredSlots,
      required_players_per_slot: requiredPlayers,
      assembled: ready >= requiredSlots,
    },
    slots,
    selection: { slot_ids: selected.map(s => s.id), games: selected.length, total: selected.reduce((sum, s) => sum + s.price, 0) },
  };
}

export async function replacePlayerSlotSelection(db: DatabaseWrapper, eveningId: string, playerId: string, raw: unknown) {
  const { evening } = await ensureSlotsForEvening(db, eveningId);
  if (!['published','active'].includes(String(evening.status || '')) || evening.settled_at) throw Object.assign(new Error('Запись на это событие закрыта'), { statusCode: 409 });
  const available = await db.all<any>("SELECT id, price_rub FROM evening_game_slots WHERE evening_id = ? AND status = 'open'", [eveningId]);
  const byId = new Map(available.map(s => [String(s.id), s]));
  const ids = Array.isArray(raw) ? Array.from(new Set(raw.map(v => String(v || '').trim()).filter(Boolean))) : [];
  if (ids.some(id => !byId.has(id))) throw Object.assign(new Error('В выборе есть недоступная игра'), { statusCode: 400 });
  const total = ids.reduce((sum, id) => sum + Number(byId.get(id)?.price_rub || 0), 0);
  const now = new Date().toISOString();
  await db.transaction(async (tx: any) => {
    let participant = await tx.get<any>('SELECT id, attendance_status, amount_paid FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [eveningId, playerId]);
    if (participant && String(participant.attendance_status || 'pending') !== 'pending') throw Object.assign(new Error('Явка уже отмечена. Изменить запись может только организатор.'), { statusCode: 409 });
    if (!participant) {
      const id = randomUUID();
      await tx.run("INSERT INTO evening_participants (id, evening_id, player_id, response_status, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at) VALUES (?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)", [id, eveningId, playerId, total ? 'unpaid' : 'waived', total, now, now, now]);
      participant = { id, amount_paid: 0 };
    }
    await tx.run('DELETE FROM evening_slot_registrations WHERE participant_id = ? AND slot_id IN (SELECT id FROM evening_game_slots WHERE evening_id = ?)', [participant.id, eveningId]);
    for (const slotId of ids) await tx.run('INSERT INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), slotId, participant.id, now, now]);
    const paid = Number(participant.amount_paid || 0);
    await tx.run('UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?', [total, total === 0 ? 'waived' : paid >= total ? 'paid' : 'unpaid', now, participant.id]);
    await setParticipantResponse(tx as DatabaseWrapper, String(participant.id), ids.length ? 'going' : 'declined');
  });
  return loadEveningSlotPlan(db, eveningId, playerId);
}
