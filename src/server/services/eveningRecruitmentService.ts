import type { DatabaseWrapper } from '../../db/index.ts';
import { loadEveningSlotPlan } from './eveningSlotPlanningService.ts';

const RESPONSE_GOING = new Set(['going', 'late']);

export type EveningRecruitmentSlot = {
  id: string;
  slot_number: number;
  starts_at: string;
  target_players: number;
  registered_players: number;
  needed_players: number;
  status: string;
  ready: boolean;
};

const isRecruitableSlot = (status: unknown) => !['completed', 'cancelled', 'closed'].includes(String(status || '').toLowerCase());

export async function loadEveningRecruitmentState(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>(
    `SELECT id, title, starts_at, timezone, venue, format, status, settled_at
       FROM game_evenings
      WHERE id = ?
      LIMIT 1`,
    [eveningId],
  );
  if (!evening) return null;

  const [participants, slotPlan] = await Promise.all([
    db.all<any>(
      `SELECT ep.player_id, ep.response_status, ep.registration_status, p.nickname
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
        WHERE ep.evening_id = ?`,
      [eveningId],
    ),
    loadEveningSlotPlan(db, eveningId),
  ]);

  const confirmed = participants.filter((row: any) => {
    const status = String(row.response_status || row.registration_status || '').trim();
    return RESPONSE_GOING.has(status);
  });
  const unanswered = participants.filter((row: any) => {
    const status = String(row.response_status || row.registration_status || '').trim();
    return !status || status === 'unanswered' || status === 'invited';
  });
  const thinking = participants.filter((row: any) => String(row.response_status || row.registration_status || '') === 'thinking');

  const slots: EveningRecruitmentSlot[] = (slotPlan.slots || []).map((slot: any) => {
    const target = Math.max(1, Number(slot.target_players || 11));
    const registered = Math.max(0, Number(slot.registered_count || (slot.participants || []).length || 0));
    const needed = Math.max(0, target - registered);
    return {
      id: String(slot.id),
      slot_number: Number(slot.slot_number || 0),
      starts_at: String(slot.starts_at || evening.starts_at || ''),
      target_players: target,
      registered_players: registered,
      needed_players: needed,
      status: String(slot.status || 'open'),
      ready: needed === 0,
    };
  });

  const activeSlots = slots.filter((slot) => isRecruitableSlot(slot.status));
  const underfilledSlots = activeSlots.filter((slot) => slot.needed_players > 0);
  const confirmedCount = new Set(confirmed.map((row: any) => String(row.player_id))).size;
  const maxSlotShortfall = underfilledSlots.reduce((max, slot) => Math.max(max, slot.needed_players), 0);

  return {
    evening,
    confirmed_players: confirmedCount,
    needed_players: maxSlotShortfall,
    unanswered_players: unanswered.length,
    thinking_players: thinking.length,
    total_slots: activeSlots.length,
    ready_slots: activeSlots.length - underfilledSlots.length,
    underfilled_slot_count: underfilledSlots.length,
    all_slots_ready: activeSlots.length > 0 && underfilledSlots.length === 0,
    slots: activeSlots,
    underfilled_slots: underfilledSlots,
    can_recruit: ['published', 'active'].includes(String(evening.status)) && !evening.settled_at && underfilledSlots.length > 0,
  };
}
