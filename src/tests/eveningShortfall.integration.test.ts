import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService.ts';
import { loadClubOrder } from '../server/services/clubOrderService.ts';
import { eveningMinimumPlayers, runEveningShortfallChecks } from '../server/services/eveningShortfallService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const HOUR = 3_600_000;

async function setup(going: number, format = 'CASUAL') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  const start = Date.now() + 2.5 * HOUR;
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Пятница',?,'Europe/Moscow',?,'published',20,100,?,?)`, [new Date(start).toISOString(), format, stamp, stamp]);
  await ensureSlotsForEvening(db, 'ev');
  for (let i = 0; i < going; i += 1) {
    await db.run('INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES (?,?,0,?,?)', [`p${i}`, `Игрок ${i}`, stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going','pending','unknown','unpaid',0,0,?,?)`, [`e${i}`, 'ev', `p${i}`, stamp, stamp]);
  }
  return { db, app, start };
}

describe('evening shortfall', () => {
  it('knows the table minimum: 10 players, 8 on a novice evening', () => {
    expect(eveningMinimumPlayers('CASUAL')).toBe(10);
    expect(eveningMinimumPlayers('RATING')).toBe(10);
    expect(eveningMinimumPlayers('NOVICE')).toBe(8);
  });

  it('calls people in the group once at 3 hours and asks the organizer to cancel at 1 hour', async () => {
    const { db, start } = await setup(6);
    const calls: string[] = [];
    const recruit = async (id: string) => { calls.push(id); return { success: true }; };

    await runEveningShortfallChecks(db, start - 4 * HOUR, recruit);
    expect(calls).toEqual([]);
    await runEveningShortfallChecks(db, start - 2.9 * HOUR, recruit);
    await runEveningShortfallChecks(db, start - 2 * HOUR, recruit);
    expect(calls).toEqual(['ev']);
    expect((await loadClubOrder(db, start - 2 * HOUR)).items.map((item) => item.id)).not.toContain('shortfall:ev');

    await runEveningShortfallChecks(db, start - 0.9 * HOUR, recruit);
    expect(await db.get<any>("SELECT cancel_prompt_at FROM evening_shortfall_actions WHERE evening_id = 'ev'")).toMatchObject({ cancel_prompt_at: expect.any(String) });
    const order = await loadClubOrder(db, start - 0.9 * HOUR);
    expect(order.items.find((item) => item.id === 'shortfall:ev')).toMatchObject({ action: { type: 'cancel_evening', evening_id: 'ev' }, action_label: 'Отменить вечер' });
  });

  it('retries the group call when the bot was unavailable, and leaves a full evening alone', async () => {
    const { db, start } = await setup(6);
    let attempts = 0;
    await runEveningShortfallChecks(db, start - 2 * HOUR, async () => { attempts += 1; return { success: false }; });
    await runEveningShortfallChecks(db, start - 1.9 * HOUR, async () => { attempts += 1; return { success: true }; });
    expect(attempts).toBe(2);

    const full = await setup(12);
    const order = await loadClubOrder(full.db, full.start - 0.5 * HOUR);
    expect(order.items.map((item) => item.id)).not.toContain('shortfall:ev');
  });

  it('tells every registered player when the organizer cancels the evening', async () => {
    const { db, app } = await setup(3);
    const cancelled = await request(app).patch('/api/evenings/ev').set('Cookie', `organizer_token=${generateOrganizerToken()}`)
      .send({ status: 'cancelled', cancel_reason: 'shortfall' });
    expect(cancelled.status).toBe(200);
    const notices = await db.all<any>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'evening_cancelled' ORDER BY player_id");
    expect(notices.map((row) => row.player_id)).toEqual(['p0', 'p1', 'p2']);
    expect(notices[0].text).toContain('отменён: не набралось игроков');
  });
});
