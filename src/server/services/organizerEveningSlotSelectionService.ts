import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  calculateEveningSelectionTotal,
  ensureSlotsForEvening,
  loadEveningSlotPlan,
} from './eveningSlotPlanningService.ts';
import { setParticipantResponse } from './eveningParticipantState.ts';

export async function replaceOrganizerPlayerSlotSelection(
  db: DatabaseWrapper,
  eveningId: string,
  playerId: string,
  rawSlotIds: unknown,
) {
  const { evening } = await ensureSlotsForEvening(db, eveningId);
  if (evening.status === 'completed' || evening.settled_at) {
    throw Object.assign(new Error('Завершённый вечер менять нельзя'), { statusCode: 409 });
  }

  const player = await db.get<any>('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });

  const available = await db.all<any>(
    "SELECT id, price_rub FROM evening_game_slots WHERE evening_id = ? AND status = 'open' ORDER BY slot_number",
    [eveningId],
  );
  const byId = new Map(available.map((slot) => [String(slot.id), slot]));
  const slotIds = Array.isArray(rawSlotIds)
    ? Array.from(new Set(rawSlotIds.map((value) => String(value || '').trim()).filter(Boolean)))
    : [];

  if (slotIds.some((slotId) => !byId.has(slotId))) {
    throw Object.assign(new Error('В выборе есть недоступная игра'), { statusCode: 400 });
  }

  const total = calculateEveningSelectionTotal(
    evening.format,
    slotIds.map((slotId) => Number(byId.get(slotId)?.price_rub || 0)),
  );
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    let participant = await tx.get<any>(
      'SELECT id, amount_paid FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1',
      [eveningId, playerId],
    );

    if (!participant) {
      const participantId = randomUUID();
      await tx.run(
        `INSERT INTO evening_participants
          (id, evening_id, player_id, response_status, registration_status,
           attendance_status, arrival_status, payment_status, amount_due, amount_paid,
           registered_at, created_at, updated_at)
         VALUES (?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', 'waived', 0, 0, ?, ?, ?)`,
        [participantId, eveningId, playerId, now, now, now],
      );
      participant = { id: participantId, amount_paid: 0 };
    }

    await tx.run(
      `DELETE FROM evening_slot_registrations
        WHERE participant_id = ?
          AND slot_id IN (SELECT id FROM evening_game_slots WHERE evening_id = ?)`,
      [participant.id, eveningId],
    );

    for (const slotId of slotIds) {
      await tx.run(
        `INSERT INTO evening_slot_registrations
          (id, slot_id, participant_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), slotId, participant.id, now, now],
      );
    }

    const paid = Number(participant.amount_paid || 0);
    const paymentStatus = total === 0
      ? 'waived'
      : paid >= total
        ? 'paid'
        : paid > 0
          ? 'partial'
          : 'unpaid';

    await tx.run(
      'UPDATE evening_participants SET amount_due = ?, payment_status = ?, updated_at = ? WHERE id = ?',
      [total, paymentStatus, now, participant.id],
    );
    await setParticipantResponse(tx, String(participant.id), slotIds.length ? 'going' : 'declined');
  });

  return loadEveningSlotPlan(db, eveningId, playerId);
}
