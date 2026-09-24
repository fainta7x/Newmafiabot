import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { skipGatheredPost } from '../server/services/eveningGatheredPostService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = () => `organizer_token=${generateOrganizerToken()}`;

async function setup(format: 'RATING' | 'CASUAL' | 'NOVICE') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Вечер',?,'Europe/Moscow',?,'active',20,500,?,?)`, [now, format, now, now]);
  await db.run("INSERT INTO players (id,nickname,club_role,judge_level,tokens,created_at,updated_at) VALUES ('org','Судья','organizer','judge',0,?,?)", [now, now]);
  await db.run("INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at) VALUES ('ev','org',?,?)", [now, now]);
  await skipGatheredPost(db, 'ev', 'test');
  for (let seat = 1; seat <= 10; seat += 1) {
    const paid = seat === 3 ? 0 : 500;
    await db.run('INSERT INTO players (id,nickname,game_level,tokens,created_at,updated_at) VALUES (?,?,?,0,?,?)', [`p${seat}`, `Игрок ${seat}`, format === 'NOVICE' ? 'novice' : 'club', now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going','attended','on_time',?,500,?,?,?)`, [`ep${seat}`, 'ev', `p${seat}`, paid ? 'paid' : 'unpaid', paid, now, now]);
  }
  const seats = Array.from({ length: 10 }, (_, index) => ({ participant_id: `ep${index + 1}`, seat_number: index + 1 }));
  const create = () => request(app).post('/api/games/evening/ev').set('Cookie', cookie()).send({ judge_player_id: 'org', judge_name: 'Судья', seats });
  return { db, create };
}

describe('prepayment at the table', () => {
  it('does not start a rating game while a seated player owes, and lets it start once paid', async () => {
    const { db, create } = await setup('RATING');
    const refused = await create();
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('prepayment_required');
    expect(refused.body.unpaid).toEqual([{ participant_id: 'ep3', nickname: 'Игрок 3', amount_due: 500, amount_paid: 0 }]);
    await db.run("UPDATE evening_participants SET amount_paid = 500, payment_status = 'paid' WHERE id = 'ep3'");
    const created = await create();
    expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  });

  it('recomputes novice dues first, so a real novice on a free visit is never blocked by a stale estimate', async () => {
    const novice = await setup('NOVICE');
    const created = await novice.create();
    expect(created.body.code).not.toBe('prepayment_required');
    expect(Number((await novice.db.get<any>("SELECT amount_due FROM evening_participants WHERE id = 'ep3'")).amount_due)).toBe(0);
  });

  it('never blocks an exempt player or a casual evening (postpayment)', async () => {
    const rating = await setup('RATING');
    // The organizer's «Освободить» is stored as a fee waiver, which recomputation respects.
    await rating.db.run("INSERT INTO evening_fee_waivers (participant_id, evening_id, reason, waived_at, updated_at) VALUES ('ep3', 'ev', 'test', ?, ?)", [new Date().toISOString(), new Date().toISOString()]);
    await rating.db.run("UPDATE evening_participants SET payment_status = 'waived', amount_due = 0 WHERE id = 'ep3'");
    expect((await rating.create()).body.code).not.toBe('prepayment_required');
    const casual = await setup('CASUAL');
    expect((await casual.create()).body.code).not.toBe('prepayment_required');
  });
});
