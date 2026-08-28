import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService';
import { loadEveningRecruitmentState } from '../server/services/eveningRecruitmentService';

describe('evening recruitment state', () => {
  let db: DatabaseWrapper;
  let slots: any[];
  const now = '2026-08-28T10:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,ends_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('recruit-evening','Friday game','2026-08-28T20:00:00+03:00','2026-08-29T00:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`,
      [now, now],
    );
    slots = (await ensureSlotsForEvening(db, 'recruit-evening')).slots;
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  const addPlayer = async (index: number) => {
    const playerId = `recruit-player-${index}`;
    const participantId = `recruit-participant-${index}`;
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES (?,?, 'normal','test',1000,0,?,?)`,
      [playerId, `Player ${index}`, now, now],
    );
    // Insert as thinking so the legacy "whole evening" INSERT trigger does not
    // pre-register this test participant in every slot. Exact slot selection is
    // the canonical modern flow; response status is finalized afterwards.
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES (?, 'recruit-evening', ?, 'thinking', 'thinking', 'pending','unknown','unpaid',0,0,?,?)`,
      [participantId, playerId, now, now],
    );
    return participantId;
  };

  const register = async (participantId: string, slotNumber: number) => {
    const slot = slots.find((item) => Number(item.slot_number) === slotNumber);
    if (!slot) throw new Error(`slot ${slotNumber} missing`);
    await db.run(
      `INSERT INTO evening_slot_registrations (id,slot_id,participant_id,created_at,updated_at)
       VALUES (?,?,?,?,?)`,
      [`reg-${participantId}-${slotNumber}`, slot.id, participantId, now, now],
    );
  };

  const setResponse = async (participantId: string, response: 'going' | 'thinking') => {
    await db.run(
      `UPDATE evening_participants
          SET response_status = ?, registration_status = ?, updated_at = ?
        WHERE id = ?`,
      [response, response, now, participantId],
    );
  };

  it('reports shortages independently for every game instead of total evening attendance', async () => {
    const participants: string[] = [];
    for (let i = 1; i <= 12; i += 1) participants.push(await addPlayer(i));

    for (const participant of participants.slice(0, 8)) await register(participant, 1);
    for (const participant of participants.slice(0, 10)) await register(participant, 2);
    for (const participant of participants.slice(0, 11)) await register(participant, 3);
    for (const participant of participants.slice(0, 10)) await register(participant, 4);
    for (const participant of participants.slice(0, 11)) await setResponse(participant, 'going');
    await setResponse(participants[11], 'thinking');

    const state = await loadEveningRecruitmentState(db, 'recruit-evening');
    expect(state).toMatchObject({
      confirmed_players: 11,
      thinking_players: 1,
      total_slots: 4,
      ready_slots: 1,
      underfilled_slot_count: 3,
      all_slots_ready: false,
      can_recruit: true,
    });
    expect(state?.underfilled_slots.map((slot) => ({
      slot: slot.slot_number,
      registered: slot.registered_players,
      target: slot.target_players,
      needed: slot.needed_players,
    }))).toEqual([
      { slot: 1, registered: 8, target: 11, needed: 3 },
      { slot: 2, registered: 10, target: 11, needed: 1 },
      { slot: 4, registered: 10, target: 11, needed: 1 },
    ]);
  });

  it('marks the evening recruited only when every active game reaches its own target', async () => {
    const participants: string[] = [];
    for (let i = 1; i <= 11; i += 1) participants.push(await addPlayer(i));
    for (const slot of slots) {
      for (const participant of participants) await register(participant, Number(slot.slot_number));
    }
    for (const participant of participants) await setResponse(participant, 'going');

    const state = await loadEveningRecruitmentState(db, 'recruit-evening');
    expect(state).toMatchObject({
      confirmed_players: 11,
      total_slots: 4,
      ready_slots: 4,
      underfilled_slot_count: 0,
      all_slots_ready: true,
      can_recruit: false,
    });
    expect(state?.underfilled_slots).toEqual([]);
  });
});
