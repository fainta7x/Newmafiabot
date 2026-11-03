import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService';
import { setParticipantResponse } from '../server/services/eveningParticipantState';
import { generateOrganizerToken } from '../server/auth';

// Owner, 2026-11-03: after «сгенерировать рассадку» it was unclear whether players got it; the judge wants the whole seating in DMs.
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('generated evening seating is sent', () => {
  it('players get their seats, the judge gets the whole seating, a second run sends nothing new', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,ends_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('e1','Пятница','2099-08-28T20:00:00+03:00','2099-08-29T00:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`, [now, now]);
    await ensureSlotsForEvening(db, 'e1');
    await db.run("INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,telegram_user_id,created_at,updated_at) VALUES ('judge','Судья','normal','test',1000,0,'999',?,?)", [now, now]);
    for (let i = 1; i <= 10; i += 1) {
      await db.run("INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,telegram_user_id,created_at,updated_at) VALUES (?,?, 'normal','test',1000,0,?,?,?)", [`p${i}`, `Игрок ${i}`, String(100 + i), now, now]);
      await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'unanswered','invited','pending',?,?)", [`ep-${i}`, 'e1', `p${i}`, now, now]);
      await setParticipantResponse(db, `ep-${i}`, 'going');
    }
    await db.run(`INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, judge_player_id, assigned_at, updated_at) VALUES ('e1',NULL,'judge',?,?)
      ON CONFLICT(evening_id) DO UPDATE SET judge_player_id = 'judge'`, [now, now]);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const first = await request(app).post('/api/evenings/e1/seating/generate').set('Cookie', cookie).send({});
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.created).toBeGreaterThan(0);
    expect(first.body.notified_players).toBe(10);
    expect(first.body.judge_notified).toBe(true);
    const judge = await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE player_id = 'judge' AND notification_key LIKE 'evening-seating-judge:%'");
    expect(judge.text).toContain('Игра №1');
    expect(judge.text).toContain('Игрок');
    // Pressing again draws the not-started games anew (owner, 2026-11-03); a seat the organizer fixed by hand stays.
    const fixed = await db.get<any>("SELECT id, slot_id, seat_number, player_id FROM evening_seat_plans WHERE evening_id='e1' ORDER BY slot_id, seat_number LIMIT 1");
    await db.run('UPDATE evening_seat_plans SET locked = 1 WHERE id = ?', [fixed.id]);
    const before = (await db.all<any>("SELECT id FROM evening_seat_plans WHERE evening_id='e1' AND locked = 0")).map((r) => r.id).sort();
    const again = await request(app).post('/api/evenings/e1/seating/generate').set('Cookie', cookie).send({});
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(before.length);
    const after = (await db.all<any>("SELECT id FROM evening_seat_plans WHERE evening_id='e1' AND locked = 0")).map((r) => r.id).sort();
    expect(after.some((id) => before.includes(id))).toBe(false);
    expect(await db.get<any>('SELECT player_id, seat_number FROM evening_seat_plans WHERE id = ?', [fixed.id])).toEqual({ player_id: fixed.player_id, seat_number: fixed.seat_number });
  });
});
