import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { createGuestPlaceholder, updateGuestPlaceholder } from '../server/services/guestPlayerService.ts';
import { buildTodayPostDraft } from '../server/services/eveningTodayPostService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,venue,created_at,updated_at)
    VALUES ('ev','Пятница','2099-10-02T18:00:00.000Z','Europe/Moscow','CASUAL','published',20,100,'Суп с Котом',?,?)`, [now, now]);
  await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['a', 'Аня', now, now]);
  await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
    VALUES ('ep-a','ev','a','going','going','pending','unpaid',?,?)`, [now, now]);
  return db;
}

describe('guests are in the sign-ups', () => {
  it('counts a guest and the people they bring in every game, with their names', async () => {
    const db = await setup();
    await loadEveningSlotPlan(db, 'ev');
    const guest = await createGuestPlaceholder(db, { eveningId: 'ev', displayName: 'Екатерина', responseStatus: 'going', plusCount: 1 });
    const plan = await loadEveningSlotPlan(db, 'ev');
    expect(plan.slots.length).toBeGreaterThan(0);
    for (const slot of plan.slots) {
      expect(slot.registered_count).toBe(3);
      expect(slot.participants.map((person: any) => person.nickname).sort()).toEqual(['Аня', 'Екатерина', 'Екатерина +1']);
      expect(slot.participants.filter((person: any) => person.is_guest).length).toBe(2);
    }
    // A guest who is not coming is not counted.
    await updateGuestPlaceholder(db, guest.id, { response_status: 'declined' });
    const after = await loadEveningSlotPlan(db, 'ev');
    expect(after.slots.every((slot: any) => slot.registered_count === 1)).toBe(true);
  });

  it('does not count the same guests twice in the «сегодня играем» roster', async () => {
    const db = await setup();
    await createGuestPlaceholder(db, { eveningId: 'ev', displayName: 'Екатерина', responseStatus: 'going', plusCount: 1 });
    const draft = await buildTodayPostDraft(db, 'ev', 1);
    expect(draft.text).toContain('Состав (3)');
  });
});
