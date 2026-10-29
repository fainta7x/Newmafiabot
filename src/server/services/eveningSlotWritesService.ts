import { isOpenEvening } from '../../lib/eveningStatus.ts';
import { ensureEveningSeatingSchema } from './eveningSeatBookingService.ts';
import { loadEveningPrices } from './eveningPriceSettingsService.ts';
import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { setParticipantResponse } from './eveningParticipantState.ts';
import { enqueueTelegramEveningSync } from './telegramSyncOutboxService.ts';
import { kickVkLiveEveningSync } from './vkLiveEveningSyncWorker.ts';
import { notifyEveningRescheduled } from './eveningRescheduleService.ts';
import {
  SLOT_PRICE,
  TABLE_MIN_PLAYERS,
  calculateEveningSelectionTotal,
  ensureSlotsForEvening,
  loadEveningSlotPlan,
  normalizeStartsAt,
  novicePriceForPlayer,
  plusMinutes,
} from './eveningSlotPlanningService.ts';

// Organizer and player changes to an evening's games. They refresh the Telegram/VK announcements and send the
// reschedule notice, so they live apart from the read model in eveningSlotPlanningService (which those services read).

export async function updateEveningSlotSettings(
  db: DatabaseWrapper,
  eveningId: string,
  input: {
    planned_slots?: unknown;
    price_per_game?: unknown;
    slot_duration_minutes?: unknown;
    starts_at?: unknown;
  },
  /** `notAnnouncedYet` — nothing is posted yet: a moved start sends no «перенос» notice and no channel/VK sync
   *  (a sync close to the announcement time could create the post early). */
  options: { notAnnouncedYet?: boolean } = {},
) {
  const { evening, settings } = await ensureSlotsForEvening(db, eveningId);
  if (evening.status === 'completed' || evening.settled_at) throw Object.assign(new Error('Завершённый вечер менять нельзя'), { statusCode: 409 });

  const isCasual = normalizeEveningFormat(evening.format) === 'CASUAL';
  const nextCount = Math.max(1, Math.min(12, Math.round(Number(input.planned_slots ?? settings.planned_slots ?? 6))));
  const nextPrice = isCasual
    ? (await loadEveningPrices(db, eveningId)).casual_game
    : Math.max(0, Math.round(Number(input.price_per_game ?? settings.price_per_game ?? SLOT_PRICE)));
  const nextDuration = Math.max(15, Math.min(180, Math.round(Number(input.slot_duration_minutes ?? settings.slot_duration_minutes ?? 60))));
  const nextStartsAt = normalizeStartsAt(input.starts_at, evening.starts_at);
  // Players and announcements already count on the start once the evening is running.
  const startMoved = new Date(nextStartsAt).getTime() !== new Date(evening.starts_at).getTime();
  if (startMoved && !['draft', 'published'].includes(String(evening.status || ''))) {
    throw Object.assign(new Error('Время начала можно перенести только до начала вечера'), { statusCode: 409 });
  }
  if (!Number.isFinite(nextCount) || !Number.isFinite(nextPrice) || !Number.isFinite(nextDuration)) {
    throw Object.assign(new Error('Неверные настройки игр вечера'), { statusCode: 400 });
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
  // Existing announcements update as before; an actual move also gets its own notice.
  if (String(evening.status || '') === 'published' && !options.notAnnouncedYet) {
    await enqueueTelegramEveningSync(db, eveningId).catch((error) => console.warn('[SLOTS] Telegram evening sync failed:', error));
    kickVkLiveEveningSync(db);
    if (startMoved) {
      await notifyEveningRescheduled(db, eveningId, String(evening.starts_at), nextStartsAt)
        .catch((error) => console.warn('[SLOTS] Reschedule notice failed:', error));
    }
  }
  return loadEveningSlotPlan(db, eveningId);
}

export async function replacePlayerSlotSelection(
  db: DatabaseWrapper,
  eveningId: string,
  playerId: string,
  raw: unknown,
  options: { notifyOrganizer?: boolean; source?: string } = {},
) {
  const { evening } = await ensureSlotsForEvening(db, eveningId);
  if (!isOpenEvening(evening)) throw Object.assign(new Error('Запись на это событие закрыта'), { statusCode: 409 });
  const available = await db.all<any>("SELECT id, price_rub FROM evening_game_slots WHERE evening_id = ? AND status = 'open'", [eveningId]);
  const byId = new Map(available.map(s => [String(s.id), s]));
  const ids = Array.isArray(raw) ? Array.from(new Set(raw.map(v => String(v || '').trim()).filter(Boolean))) : [];
  if (ids.some(id => !byId.has(id))) throw Object.assign(new Error('В выборе есть недоступная игра'), { statusCode: 400 });
  const personalNovicePrice = normalizeEveningFormat(evening.format) === 'NOVICE'
    ? await novicePriceForPlayer(db, playerId, eveningId)
    : null;
  const policy = await loadEveningPrices(db, eveningId);
  const estimate = calculateEveningSelectionTotal(
    evening.format,
    ids.map((id) => personalNovicePrice == null ? Number(byId.get(id)?.price_rub || 0) : personalNovicePrice),
    policy,
  );
  const isCasual = normalizeEveningFormat(evening.format) === 'CASUAL';
  await ensureEveningSeatingSchema(db);
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
    // An unselected future game must not keep a phantom seat reservation.
    // Actual started seating is immutable historical evidence.
    await tx.run(`DELETE FROM evening_seat_plans
      WHERE evening_id = ? AND player_id = ? AND started = 0
        AND slot_id NOT IN (SELECT slot_id FROM evening_slot_registrations WHERE participant_id = ?)`,
      [eveningId, playerId, participant.id]);
    if (!isCasual) {
      const paid = Number(participant.amount_paid || 0);
      const paymentStatus = estimate === 0 ? 'waived' : paid >= estimate ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      await tx.run('UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?', [estimate, paymentStatus, now, participant.id]);
    }
    // «Очистить выбор» is not a refusal (owner, 2026-10-13): the player is back to «нет ответа», unless he already said «Не иду» himself.
    const previousAnswer = String((await tx.get<any>('SELECT response_status FROM evening_participants WHERE id = ?', [participant.id]))?.response_status || '');
    const clearedAnswer = previousAnswer === 'declined' ? 'declined' : 'unanswered';
    await setParticipantResponse(tx as DatabaseWrapper, String(participant.id), ids.length ? 'going' : clearedAnswer, { byPlayer: options.notifyOrganizer !== false, source: options.source || (ids.length ? 'slot_selection' : 'slot_selection_cleared') });
  });
  await enqueueTelegramEveningSync(db, eveningId);
  // Keep the existing VK announcement current immediately after a player changes
  // their exact game plan; the periodic worker remains the recovery path.
  kickVkLiveEveningSync(db);
  return loadEveningSlotPlan(db, eveningId, playerId);
}
