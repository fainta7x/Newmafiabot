import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService';
import { registerGoingParticipantsForAllGames, setParticipantResponse } from '../server/services/eveningParticipantState';
import { runCrmAutomations } from '../server/services/crmAutomationService';

describe('«Иду» means every game (owner, 2026-10-13)', () => {
  let db: DatabaseWrapper;
  let slotIds: string[];
  const now = new Date().toISOString();

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,ends_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('e1','Пятница','2099-08-28T20:00:00+03:00','2099-08-29T00:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`, [now, now]);
    slotIds = (await ensureSlotsForEvening(db, 'e1')).slots.map((slot: any) => String(slot.id));
    for (const id of ['a', 'b', 'c']) {
      await db.run("INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,?,?)", [id, `Игрок ${id}`, now, now]);
      // «Нет ответа»: the organizer added them to the roster without an answer
      await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'unanswered','invited','pending',?,?)", [`ep-${id}`, 'e1', id, now, now]);
    }
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  const games = async (participantId: string) => Number((await db.get<any>('SELECT COUNT(*) AS n FROM evening_slot_registrations WHERE participant_id = ?', [participantId]))?.n || 0);

  it('registers the player in every open game when the answer becomes «Иду»', async () => {
    expect(slotIds.length).toBeGreaterThan(1);
    expect(await games('ep-a')).toBe(0);
    await setParticipantResponse(db, 'ep-a', 'going');
    expect(await games('ep-a')).toBe(slotIds.length);
  });

  it('leaves «Приду позже» as an intent and keeps the exact games a player picked', async () => {
    await setParticipantResponse(db, 'ep-b', 'late');
    expect(await games('ep-b')).toBe(0);
    await db.run("INSERT INTO evening_slot_registrations (id,slot_id,participant_id,created_at,updated_at) VALUES ('r1',?,?,?,?)", [slotIds[0], 'ep-c', now, now]);
    await setParticipantResponse(db, 'ep-c', 'going');
    expect(await games('ep-c')).toBe(1);
  });

  it('turns old «Иду» answers without games into «all games» in the sweep', async () => {
    await db.run("UPDATE evening_participants SET response_status = 'going', registration_status = 'going' WHERE id = 'ep-a'");
    expect(await games('ep-a')).toBe(0);
    await runCrmAutomations(db);
    expect(await games('ep-a')).toBe(slotIds.length);
    expect(await registerGoingParticipantsForAllGames(db)).toBe(0);
  });
});
