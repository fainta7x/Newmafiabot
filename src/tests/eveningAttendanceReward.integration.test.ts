import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import request from 'supertest';
import { createApp } from '../app.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { setParticipantAttendance, setParticipantResponse } from '../server/services/eveningParticipantState.ts';
import { attendanceRewardFor } from '../server/services/eveningAttendanceRewardService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup(startsAt = '2026-10-02T16:00:00.000Z') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Пятница',?,'Europe/Moscow','CASUAL','active',20,100,?,?)`, [startsAt, now, now]);
  const add = async (id: string, response: string) => {
    await db.run('INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES (?,?,0,?,?)', [id, id, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,?,?,'pending','unknown','unpaid',0,0,?,?)`, [`ep-${id}`, 'ev', id, response, response, now, now]);
  };
  const tokens = async (id: string) => Number((await db.get<any>('SELECT tokens FROM players WHERE id = ?', [id])).tokens);
  return { db, add, tokens, app };
}

describe('tokens for coming to an evening', () => {
  it('pays 500 at the start after signing up, 400 late or without signing up', () => {
    expect(attendanceRewardFor({ response_status: 'going', attendance_status: 'attended', arrival_status: 'on_time' })).toBe(500);
    expect(attendanceRewardFor({ response_status: 'late', attendance_status: 'attended', arrival_status: 'on_time' })).toBe(500);
    expect(attendanceRewardFor({ response_status: 'going', attendance_status: 'attended', arrival_status: 'late' })).toBe(400);
    expect(attendanceRewardFor({ response_status: 'unanswered', attendance_status: 'attended', arrival_status: 'on_time' })).toBe(400);
    expect(attendanceRewardFor({ response_status: 'going', attendance_status: 'no_show', arrival_status: 'unknown' })).toBe(0);
  });

  it('follows the attendance mark without paying twice', async () => {
    const { db, add, tokens } = await setup();
    await add('a', 'going');
    await add('b', 'unanswered');

    await setParticipantAttendance(db, 'ep-a', 'attended_on_time');
    await setParticipantAttendance(db, 'ep-a', 'attended_on_time');
    expect(await tokens('a')).toBe(500);

    // Switched to late: the difference is taken back; unmarked: everything is taken back.
    await setParticipantAttendance(db, 'ep-a', 'attended_late');
    expect(await tokens('a')).toBe(400);
    await setParticipantAttendance(db, 'ep-a', 'pending');
    expect(await tokens('a')).toBe(0);

    // A walk-in who arrived at the start still gets 400.
    await setParticipantAttendance(db, 'ep-b', 'attended_on_time');
    expect(await tokens('b')).toBe(400);
    const entries = await db.all<any>("SELECT amount, description FROM token_ledger WHERE player_id = 'b' AND reason_type = 'evening_attendance'");
    expect(entries).toEqual([{ amount: 400, description: 'Вечер «Пятница»: жетоны за приход' }]);
  });

  it('settles a changed answer and never pays for evenings before the start of the rule', async () => {
    const { db, add, tokens } = await setup();
    await add('c', 'unanswered');
    await setParticipantAttendance(db, 'ep-c', 'attended_on_time');
    await setParticipantResponse(db, 'ep-c', 'going');
    expect(await tokens('c')).toBe(500);

    const old = await setup('2026-09-20T16:00:00.000Z');
    await old.add('d', 'going');
    await setParticipantAttendance(old.db, 'ep-d', 'attended_on_time');
    expect(await old.tokens('d')).toBe(0);
  });

  it('takes the tokens back when a checked-in player or the whole evening is deleted', async () => {
    const { db, add, tokens, app } = await setup();
    const auth = { Cookie: `organizer_token=${generateOrganizerToken()}` };
    await add('e', 'going');
    await add('f', 'going');
    await setParticipantAttendance(db, 'ep-e', 'attended_on_time');
    await setParticipantAttendance(db, 'ep-f', 'attended_late');

    expect((await request(app).delete('/api/evening-participants/ep-e').set(auth)).status).toBe(200);
    expect(await tokens('e')).toBe(0);

    // Re-added and checked in again: paid once more, not swallowed by an old idempotency key.
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep-e2','ev','e','going','going','pending','unknown','unpaid',0,0,?,?)`, [new Date().toISOString(), new Date().toISOString()]);
    await setParticipantAttendance(db, 'ep-e2', 'attended_on_time');
    expect(await tokens('e')).toBe(500);

    expect((await request(app).delete('/api/evenings/ev').set(auth)).status).toBe(200);
    expect(await tokens('e')).toBe(0);
    expect(await tokens('f')).toBe(0);
  });
});
