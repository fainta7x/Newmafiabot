import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

const now = '2026-09-09T14:00:00.000Z';

describe('CRM-PAY-003-R2 evening staff assignment routes', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  const auth = () => ({ Cookie: `organizer_token=${generateOrganizerToken()}` });

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);

    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('staff-evening','Staff evening','2026-09-11T20:00:00+03:00','Europe/Moscow','CASUAL','active',20,100,?,?)`,
      [now, now],
    );

    for (const suffix of ['a', 'b']) {
      await db.run(
        `INSERT INTO players
         (id,nickname,lifecycle_status,source,elo,tokens,club_role,judge_level,created_at,updated_at)
         VALUES (?,?, 'normal','test',1000,0,'organizer','none',?,?)`,
        [`staff-player-${suffix}`, `Organizer ${suffix.toUpperCase()}`, now, now],
      );
      await db.run(
        `INSERT INTO evening_participants
         (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
         VALUES (?,'staff-evening',?,'going','going','attended','on_time','unpaid',100,0,?,?)`,
        [`staff-participant-${suffix}`, `staff-player-${suffix}`, now, now],
      );
    }

    const protocol = JSON.stringify({
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { status: 'completed' },
      player_results: [
        { participant_id: 'staff-participant-a' },
        { participant_id: 'staff-participant-b' },
      ],
    });
    await db.run(
      `INSERT INTO games
       (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('staff-evening',1,'2026-09-11','red','Красные',?,'[]',?)`,
      [protocol, now],
    );
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('assigns A, replaces with B, then fully removes the factual organizer and reconciles each change', async () => {
    const assignA = await request(app)
      .patch('/api/evenings/staff-evening/staff')
      .set(auth())
      .send({ organizer_player_id: 'staff-player-a' });
    expect(assignA.status, JSON.stringify(assignA.body)).toBe(200);
    expect(assignA.body.organizer).toMatchObject({ player_id: 'staff-player-a' });

    let a = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-a']);
    let b = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-b']);
    expect(a).toMatchObject({ amount_due: 0, payment_status: 'waived' });
    expect(b).toMatchObject({ amount_due: 100, payment_status: 'unpaid' });

    const replaceWithB = await request(app)
      .patch('/api/evenings/staff-evening/staff')
      .set(auth())
      .send({ organizer_player_id: 'staff-player-b' });
    expect(replaceWithB.status, JSON.stringify(replaceWithB.body)).toBe(200);
    expect(replaceWithB.body.organizer).toMatchObject({ player_id: 'staff-player-b' });

    a = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-a']);
    b = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-b']);
    expect(a).toMatchObject({ amount_due: 100, payment_status: 'unpaid' });
    expect(b).toMatchObject({ amount_due: 0, payment_status: 'waived' });

    const remove = await request(app)
      .patch('/api/evenings/staff-evening/staff')
      .set(auth())
      .send({ organizer_player_id: null });
    expect(remove.status, JSON.stringify(remove.body)).toBe(200);
    expect(remove.body.organizer).toBeNull();

    const assignment = await db.get<any>('SELECT evening_id FROM evening_staff_assignments WHERE evening_id = ?', ['staff-evening']);
    expect(assignment).toBeNull();
    a = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-a']);
    b = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-b']);
    expect(a).toMatchObject({ amount_due: 100, payment_status: 'unpaid' });
    expect(b).toMatchObject({ amount_due: 100, payment_status: 'unpaid' });
  });

  it('keeps an explicit participant waiver after the staff assignment is removed', async () => {
    await db.run(
      `INSERT INTO evening_fee_waivers (participant_id,evening_id,reason,waived_at,updated_at)
       VALUES ('staff-participant-a','staff-evening','Explicit free evening',?,?)`,
      [now, now],
    );

    const assignA = await request(app)
      .patch('/api/evenings/staff-evening/staff')
      .set(auth())
      .send({ organizer_player_id: 'staff-player-a' });
    expect(assignA.status).toBe(200);

    const remove = await request(app)
      .patch('/api/evenings/staff-evening/staff')
      .set(auth())
      .send({ organizer_player_id: null });
    expect(remove.status, JSON.stringify(remove.body)).toBe(200);
    expect(remove.body.organizer).toBeNull();

    const a = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-a']);
    const b = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', ['staff-participant-b']);
    expect(a).toMatchObject({ amount_due: 0, payment_status: 'waived' });
    expect(b).toMatchObject({ amount_due: 100, payment_status: 'unpaid' });
  });
});