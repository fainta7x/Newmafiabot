import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService';
import { setParticipantResponse } from '../server/services/eveningParticipantState';
import { generateEveningSeatingPlan } from '../server/services/eveningSeatingGenerationService';
import { ensurePrimaryEveningTable } from '../server/services/primaryEveningTableService';

// Owner, 2026-11-15: the judge of an additional table is staff, like the evening judge — never seated as a player.
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('evening seating and table judges', () => {
  it('does not seat the judge of another table', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,ends_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('e1','Пятница','2099-08-28T20:00:00+03:00','2099-08-29T00:00:00+03:00','Europe/Moscow','CASUAL','published',30,100,?,?)`, [now, now]);
    await ensureSlotsForEvening(db, 'e1');
    await ensurePrimaryEveningTable(db, 'e1');
    for (let i = 1; i <= 11; i += 1) {
      await db.run("INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,?,?)", [`p${i}`, `Игрок ${i}`, now, now]);
      await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'unanswered','invited','pending',?,?)", [`ep-${i}`, 'e1', `p${i}`, now, now]);
      await setParticipantResponse(db, `ep-${i}`, 'going');
    }
    await db.run(`INSERT INTO evening_tables (id,evening_id,name,format,capacity,host_name,host_player_id,sort_order,created_at,updated_at)
      VALUES ('t2','e1','Стол 2','CASUAL',10,'Игрок 11','p11',1,?,?)`, [now, now]);
    await generateEveningSeatingPlan(db, 'e1');
    const seated = await db.all<any>("SELECT DISTINCT player_id FROM evening_seat_plans WHERE evening_id = 'e1'");
    expect(seated.length).toBe(10);
    expect(seated.map((row) => row.player_id)).not.toContain('p11');
  });
});
