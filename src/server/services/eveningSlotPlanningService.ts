import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureEveningSlotsSchema } from '../../db/ensureEveningSlotsSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { RATING_ENTRY_FEE } from '../../lib/ratingEveningMoney.ts';
import { setParticipantResponse } from './eveningParticipantState.ts';
import { enqueueTelegramEveningSync } from './telegramSyncOutboxService.ts';
import { kickVkLiveEveningSync } from './vkLiveEveningSyncWorker.ts';

export const SLOT_PRICE = 100;
export const CLUB_EVENING_MAX_PRICE = 400;
export const TABLE_MIN_PLAYERS = 11;
export const TABLE_MIN_READY_SLOTS = 4;
export const NOVICE_PAID_GAME_PRICE = 200;
export const NOVICE_FREE_VISITS = 2;

/**
 * Per-game NOVICE price for this player on this evening. For a player with the
 * «Новичок» level the first two factually attended NOVICE evenings are free; the evening is priced by how
 * many NOVICE evenings the player attended *before* it, so marking attendance
 * on the evening itself never turns a free evening into a paid one.
 */
export const novicePriceForPlayer = async (db: DatabaseWrapper, playerId: string, eveningId: string): Promise<number> => {
  // Free visits are only for real novices (never played mafia). An experienced player at a
  // novice evening, for example a guest from another city, pays from the first game.
  // One query on purpose: this runs inside slot transactions.
  const row = await db.get<any>(
    `SELECT (SELECT game_level FROM players WHERE id = ?) AS game_level,
            (SELECT COUNT(DISTINCT ep.evening_id)
               FROM evening_participants ep
               JOIN game_evenings e ON e.id = ep.evening_id
               JOIN game_evenings current ON current.id = ?
              WHERE ep.player_id = ? AND ep.attendance_status = 'attended'
                AND UPPER(COALESCE(e.format, '')) = 'NOVICE'
                AND e.id != current.id
                AND datetime(e.starts_at) < datetime(current.starts_at)) AS visits`,
    [playerId, eveningId, playerId],
  );
  if (String(row?.game_level || '') !== 'novice') return NOVICE_PAID_GAME_PRICE;
  return Number(row?.visits || 0) < NOVICE_FREE_VISITS ? 0 : NOVICE_PAID_GAME_PRICE;
};

// A recorded payment stays «paid» even if the evening becomes free, so settlement
// still books it as income (as the regular-evening reconciler does).
const novicePaymentStatus = (due: number, paid: number) =>
  due <= 0 ? (paid > 0 ? 'paid' : 'waived') : paid >= due ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

/**
 * Re-prices every participant of an open NOVICE evening from the facts known
 * now (earlier attended NOVICE evenings × selected games). A registration made
 * in advance is estimated before the earlier evenings happen, so it must be
 * corrected before settlement. Explicit organizer fee waivers are kept.
 */
export async function reconcileNoviceEveningCharges(db: DatabaseWrapper, eveningId: string): Promise<number> {
  const evening = await db.get<any>('SELECT id, format, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening || evening.status === 'completed' || evening.settled_at) return 0;
  const format = normalizeEveningFormat(evening.format);
  if (format === 'RATING') return reconcileRatingEveningCharges(db, eveningId);
  if (format !== 'NOVICE') return 0;
  const waiverTable = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'evening_fee_waivers'");
  const waived = new Set((waiverTable
    ? await db.all<any>('SELECT participant_id FROM evening_fee_waivers WHERE evening_id = ?', [eveningId])
    : []).map((row: any) => String(row.participant_id)));
  const participants = await db.all<any>(
    `SELECT ep.id, ep.player_id, ep.amount_due, ep.amount_paid, ep.payment_status, ep.response_status,
            (SELECT COUNT(*) FROM evening_slot_registrations r
               JOIN evening_game_slots s ON s.id = r.slot_id
              WHERE r.participant_id = ep.id AND s.evening_id = ep.evening_id) AS games
       FROM evening_participants ep
      WHERE ep.evening_id = ? AND ep.player_id IS NOT NULL`,
    [eveningId],
  );
  // A coarse «иду» (Telegram/VK/cabinet) without an exact plan means the whole
  // evening, exactly as the slot plan counts it.
  const openSlots = await db.get<any>("SELECT COUNT(*) AS count FROM evening_game_slots WHERE evening_id = ? AND status = 'open'", [eveningId]);
  const wholeEveningGames = Number(openSlots?.count || 0);
  let changed = 0;
  const now = new Date().toISOString();
  for (const participant of participants) {
    if (waived.has(String(participant.id))) continue;
    const price = await novicePriceForPlayer(db, String(participant.player_id), eveningId);
    const selected = Number(participant.games || 0);
    const games = selected > 0 ? selected : ['going', 'late'].includes(String(participant.response_status || '')) ? wholeEveningGames : 0;
    const due = price * games;
    const paid = Math.max(0, Number(participant.amount_paid || 0));
    const status = novicePaymentStatus(due, paid);
    if (Number(participant.amount_due || 0) === due && String(participant.payment_status || '') === status) continue;
    await db.run('UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?', [due, status, now, participant.id]);
    changed += 1;
  }
  return changed;
}

/**
 * Rating evening: one 500 ₽ entry fee for everyone who comes (answered «иду»/«позже», picked games
 * or was marked present). Exempt players keep their waiver; a recorded payment is never lost.
 */
async function reconcileRatingEveningCharges(db: DatabaseWrapper, eveningId: string): Promise<number> {
  const waiverTable = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'evening_fee_waivers'");
  const waived = new Set((waiverTable
    ? await db.all<any>('SELECT participant_id FROM evening_fee_waivers WHERE evening_id = ?', [eveningId])
    : []).map((row: any) => String(row.participant_id)));
  const participants = await db.all<any>(
    `SELECT ep.id, ep.player_id, ep.amount_due, ep.amount_paid, ep.payment_status, ep.response_status, ep.attendance_status,
            (SELECT COUNT(*) FROM evening_slot_registrations r
               JOIN evening_game_slots s ON s.id = r.slot_id
              WHERE r.participant_id = ep.id AND s.evening_id = ep.evening_id) AS games
       FROM evening_participants ep
      WHERE ep.evening_id = ? AND ep.player_id IS NOT NULL`,
    [eveningId],
  );
  const staffTable = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'evening_staff_assignments'");
  const organizerId = staffTable
    ? String((await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId]))?.organizer_player_id || '')
    : '';
  let changed = 0;
  const now = new Date().toISOString();
  for (const participant of participants) {
    if (waived.has(String(participant.id))) continue;
    // As on club evenings, the evening's organizer is not charged.
    const staffExempt = Boolean(organizerId && String(participant.player_id) === organizerId);
    const comes = Number(participant.games || 0) > 0
      || ['going', 'late'].includes(String(participant.response_status || ''))
      || String(participant.attendance_status || '') === 'attended';
    const due = comes && !staffExempt ? RATING_ENTRY_FEE : 0;
    const status = novicePaymentStatus(due, Math.max(0, Number(participant.amount_paid || 0)));
    if (Number(participant.amount_due || 0) === due && String(participant.payment_status || '') === status) continue;
    await db.run('UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?', [due, status, now, participant.id]);
    changed += 1;
  }
  return changed;
}

export const calculateEveningSelectionTotal = (format: unknown, prices: number[]): number => {
  // A rating evening is one entry fee for the whole evening, however many games are picked.
  if (normalizeEveningFormat(format) === 'RATING') return prices.length ? RATING_ENTRY_FEE : 0;
  if (normalizeEveningFormat(format) === 'CASUAL') {
    return Math.min(prices.length * SLOT_PRICE, CLUB_EVENING_MAX_PRICE);
  }
  return prices.reduce((sum, price) => sum + Math.max(0, Number(price || 0)), 0);
};

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

  const isCasual = normalizeEveningFormat(evening.format) === 'CASUAL';
  const now = new Date().toISOString();
  if (isCasual && Number(evening.default_price || 0) !== SLOT_PRICE) {
    await db.run('UPDATE game_evenings SET default_price = ?, updated_at = ? WHERE id = ?', [SLOT_PRICE, now, eveningId]);
    evening.default_price = SLOT_PRICE;
  }

  let settings = await db.get<any>('SELECT * FROM evening_slot_settings WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (!settings) {
    await db.run(
      'INSERT OR IGNORE INTO evening_slot_settings (evening_id, planned_slots, slot_duration_minutes, price_per_game, ready_slots_required, ready_players_per_slot, created_at, updated_at) VALUES (?, ?, 60, 100, 4, 11, ?, ?)',
      [eveningId, plannedCount(evening), now, now],
    );
    settings = await db.get<any>('SELECT * FROM evening_slot_settings WHERE evening_id = ? LIMIT 1', [eveningId]);
  }
  if (isCasual && Number(settings?.price_per_game || 0) !== SLOT_PRICE) {
    await db.run('UPDATE evening_slot_settings SET price_per_game = ?, updated_at = ? WHERE evening_id = ?', [SLOT_PRICE, now, eveningId]);
    settings = { ...settings, price_per_game: SLOT_PRICE };
  }

  let slots = await db.all<any>('SELECT * FROM evening_game_slots WHERE evening_id = ? ORDER BY slot_number', [eveningId]);
  if (isCasual && slots.some((slot) => Number(slot.price_rub || 0) !== SLOT_PRICE)) {
    await db.run('UPDATE evening_game_slots SET price_rub = ?, updated_at = ? WHERE evening_id = ?', [SLOT_PRICE, now, eveningId]);
    slots = slots.map((slot) => ({ ...slot, price_rub: SLOT_PRICE }));
  }
  if (!slots.length) {
    const duration = Number(settings.slot_duration_minutes || 60);
    const count = Number(settings.planned_slots || 6);
    const price = isCasual ? SLOT_PRICE : Number(settings.price_per_game || SLOT_PRICE);
    const targetPlayers = Number(settings.ready_players_per_slot || TABLE_MIN_PLAYERS);

    await db.transaction(async (tx: DatabaseWrapper) => {
      for (let i = 0; i < count; i += 1) {
        await tx.run(
          'INSERT OR IGNORE INTO evening_game_slots (id, evening_id, slot_number, starts_at, ends_at, price_rub, target_players, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [randomUUID(), eveningId, i + 1, plusMinutes(evening.starts_at, i * duration), plusMinutes(evening.starts_at, (i + 1) * duration), price, targetPlayers, 'open', now, now],
        );
      }
    });

    slots = await db.all<any>('SELECT * FROM evening_game_slots WHERE evening_id = ? ORDER BY slot_number', [eveningId]);

    // Legacy going/late meant "whole evening". This migration is only needed the
    // first time slots are created. Keep the familiar write shape so local/test DB
    // adapters and Turso follow the same path, while the normal read path stays lean.
    const legacy = await db.all<any>(
      "SELECT id FROM evening_participants WHERE evening_id = ? AND response_status IN ('going','late')",
      [eveningId],
    );
    if (legacy.length && slots.length) {
      await db.transaction(async (tx: DatabaseWrapper) => {
        for (const participant of legacy) {
          for (const slot of slots) {
            await tx.run(
              'INSERT OR IGNORE INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
              [randomUUID(), slot.id, participant.id, now, now],
            );
          }
        }
      });
    }
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

  const isCasual = normalizeEveningFormat(evening.format) === 'CASUAL';
  const nextCount = Math.max(1, Math.min(12, Math.round(Number(input.planned_slots ?? settings.planned_slots ?? 6))));
  const nextPrice = isCasual
    ? SLOT_PRICE
    : Math.max(0, Math.round(Number(input.price_per_game ?? settings.price_per_game ?? SLOT_PRICE)));
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
  await db.transaction(async (tx: DatabaseWrapper) => {
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
  const own = playerId
    ? await db.get<any>('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [eveningId, playerId])
    : null;

  const rows = await db.all<any>(
    `SELECT s.id, s.slot_number, s.starts_at, s.ends_at, s.price_rub, s.target_players, s.status,
            COUNT(r.id) AS registered_count
       FROM evening_game_slots s
       LEFT JOIN evening_slot_registrations r ON r.slot_id = s.id
      WHERE s.evening_id = ?
      GROUP BY s.id, s.slot_number, s.starts_at, s.ends_at, s.price_rub, s.target_players, s.status
      ORDER BY s.slot_number`,
    [eveningId],
  );

  const peopleRows = await db.all<any>(
    `SELECT r.slot_id, p.id, p.nickname
       FROM evening_slot_registrations r
       JOIN evening_game_slots s ON s.id = r.slot_id
       JOIN evening_participants ep ON ep.id = r.participant_id
       JOIN players p ON p.id = ep.player_id
      WHERE s.evening_id = ?
      ORDER BY s.slot_number, p.nickname COLLATE NOCASE`,
    [eveningId],
  );

  // Legacy Telegram/VK answers such as «Буду» create an evening participant
  // without slot registrations. Treat those players as registered for every
  // game until they choose an exact slot plan, so public announcements do not
  // show 0 after a successful whole-evening registration.
  const legacyWholeEveningRows = await db.all<any>(
    `SELECT ep.id AS participant_id, p.id, p.nickname
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
      WHERE ep.evening_id = ?
        AND ep.response_status IN ('going', 'late')
        AND NOT EXISTS (
          SELECT 1
            FROM evening_slot_registrations existing
            JOIN evening_game_slots existing_slot ON existing_slot.id = existing.slot_id
           WHERE existing.participant_id = ep.id
             AND existing_slot.evening_id = ?
        )
      ORDER BY p.nickname COLLATE NOCASE`,
    [eveningId, eveningId],
  );
  const peopleBySlot = new Map<string, Array<{ id: string; nickname: string; whole_evening?: boolean }>>();
  for (const person of peopleRows) {
    const slotId = String(person.slot_id);
    const group = peopleBySlot.get(slotId) || [];
    group.push({ id: String(person.id), nickname: String(person.nickname || 'Игрок') });
    peopleBySlot.set(slotId, group);
  }
  if (legacyWholeEveningRows.length) {
    for (const slot of rows) {
      const slotId = String(slot.id);
      const group = peopleBySlot.get(slotId) || [];
      for (const person of legacyWholeEveningRows) {
        // Counted for every game, but flagged so screens can tell «whole evening, no exact plan» from a real choice.
        group.push({ id: String(person.id), nickname: String(person.nickname || 'Игрок'), whole_evening: true });
      }
      peopleBySlot.set(slotId, group);
      slot.registered_count = Number(slot.registered_count || 0) + legacyWholeEveningRows.length;
    }
  }

  const selectedSlotIds = new Set<string>();
  if (own) {
    const selectedRows = await db.all<any>(
      `SELECT r.slot_id
         FROM evening_slot_registrations r
         JOIN evening_game_slots s ON s.id = r.slot_id
        WHERE s.evening_id = ? AND r.participant_id = ?`,
      [eveningId, own.id],
    );
    for (const row of selectedRows) selectedSlotIds.add(String(row.slot_id));
  }

  const personalNovicePrice = playerId && normalizeEveningFormat(evening.format) === 'NOVICE'
    ? await novicePriceForPlayer(db, playerId, eveningId)
    : null;
  const slots = rows.map((row) => ({
    id: String(row.id),
    slot_number: Number(row.slot_number),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    price: personalNovicePrice == null ? Number(row.price_rub || SLOT_PRICE) : personalNovicePrice,
    target_players: Number(row.target_players || TABLE_MIN_PLAYERS),
    registered_count: Number(row.registered_count || 0),
    selected: selectedSlotIds.has(String(row.id)),
    participants: peopleBySlot.get(String(row.id)) || [],
  }));

  const requiredPlayers = Number(settings.ready_players_per_slot || TABLE_MIN_PLAYERS);
  const requiredSlots = Number(settings.ready_slots_required || TABLE_MIN_READY_SLOTS);
  const ready = slots.filter((slot) => slot.registered_count >= requiredPlayers).length;
  const selected = slots.filter((slot) => slot.selected);
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
      price_per_game: isFinite(Number(settings.price_per_game)) ? Number(settings.price_per_game) : SLOT_PRICE,
      max_evening_price: normalizeEveningFormat(evening.format) === 'CASUAL' ? CLUB_EVENING_MAX_PRICE : null,
      slot_duration_minutes: Number(settings.slot_duration_minutes || 60),
      slot_count: slots.length,
      assembled_slots: ready,
      required_slots: requiredSlots,
      required_players_per_slot: requiredPlayers,
      assembled: ready >= requiredSlots,
    },
    slots,
    selection: {
      slot_ids: selected.map((slot) => slot.id),
      games: selected.length,
      total: calculateEveningSelectionTotal(evening.format, selected.map((slot) => slot.price)),
    },
  };
}

export async function replacePlayerSlotSelection(db: DatabaseWrapper, eveningId: string, playerId: string, raw: unknown) {
  const { evening } = await ensureSlotsForEvening(db, eveningId);
  if (!['published','active'].includes(String(evening.status || '')) || evening.settled_at) throw Object.assign(new Error('Запись на это событие закрыта'), { statusCode: 409 });
  const available = await db.all<any>("SELECT id, price_rub FROM evening_game_slots WHERE evening_id = ? AND status = 'open'", [eveningId]);
  const byId = new Map(available.map(s => [String(s.id), s]));
  const ids = Array.isArray(raw) ? Array.from(new Set(raw.map(v => String(v || '').trim()).filter(Boolean))) : [];
  if (ids.some(id => !byId.has(id))) throw Object.assign(new Error('В выборе есть недоступная игра'), { statusCode: 400 });
  const personalNovicePrice = normalizeEveningFormat(evening.format) === 'NOVICE'
    ? await novicePriceForPlayer(db, playerId, eveningId)
    : null;
  const estimate = calculateEveningSelectionTotal(
    evening.format,
    ids.map((id) => personalNovicePrice == null ? Number(byId.get(id)?.price_rub || 0) : personalNovicePrice),
  );
  const isCasual = normalizeEveningFormat(evening.format) === 'CASUAL';
  const now = new Date().toISOString();
  await db.transaction(async (tx: DatabaseWrapper) => {
    let participant = await tx.get<any>('SELECT id, attendance_status, amount_due, amount_paid, payment_status FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1', [eveningId, playerId]);
    if (participant && String(participant.attendance_status || 'pending') !== 'pending') throw Object.assign(new Error('Явка уже отмечена. Изменить запись может только организатор.'), { statusCode: 409 });
    if (!participant) {
      const id = randomUUID();
      const amountDue = isCasual ? 0 : estimate;
      await tx.run("INSERT INTO evening_participants (id, evening_id, player_id, response_status, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at) VALUES (?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)", [id, eveningId, playerId, amountDue ? 'unpaid' : 'waived', amountDue, now, now, now]);
      participant = { id, amount_due: amountDue, amount_paid: 0, payment_status: amountDue ? 'unpaid' : 'waived' };
    }
    await tx.run('DELETE FROM evening_slot_registrations WHERE participant_id = ? AND slot_id IN (SELECT id FROM evening_game_slots WHERE evening_id = ?)', [participant.id, eveningId]);
    for (const slotId of ids) await tx.run('INSERT INTO evening_slot_registrations (id, slot_id, participant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), slotId, participant.id, now, now]);
    if (!isCasual) {
      const paid = Number(participant.amount_paid || 0);
      const paymentStatus = estimate === 0 ? 'waived' : paid >= estimate ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      await tx.run('UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?', [estimate, paymentStatus, now, participant.id]);
    }
    await setParticipantResponse(tx as DatabaseWrapper, String(participant.id), ids.length ? 'going' : 'declined');
  });
  await enqueueTelegramEveningSync(db, eveningId);
  // Keep the existing VK announcement current immediately after a player changes
  // their exact game plan; the periodic worker remains the recovery path.
  kickVkLiveEveningSync(db);
  return loadEveningSlotPlan(db, eveningId, playerId);
}
