import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
const savedEnv = {
  bot: process.env.BOT_API_SECRET,
  organizer: process.env.ORGANIZER_NOTIFICATION_IDS,
  telegram: process.env.TELEGRAM_BOT_TOKEN,
};
afterEach(() => {
  while (opened.length) {
    try { opened.pop()?.sqlite.close(); } catch { /* closed */ }
  }
  for (const [name, value] of [
    ['BOT_API_SECRET', savedEnv.bot],
    ['ORGANIZER_NOTIFICATION_IDS', savedEnv.organizer],
    ['TELEGRAM_BOT_TOKEN', savedEnv.telegram],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function setup() {
  process.env.BOT_API_SECRET = 'test-rsvp-cross-channel-secret';
  process.env.ORGANIZER_NOTIFICATION_IDS = '777';
  delete process.env.TELEGRAM_BOT_TOKEN;

  const db = createDatabaseConnection(':memory:');
  opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,created_at,updated_at)
     VALUES ('cross-player','Сквозной игрок','750001','normal','normal',?,?)`,
    [now, now],
  );
  await db.run(
    `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
     VALUES ('cross-evening','Проверка регистраций',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`,
    [new Date(Date.now() + 2 * 86400_000).toISOString(), now, now],
  );
  const bot = () => request(app).post('/api/bot/evenings/cross-evening/respond')
    .set('X-Bot-Token', 'test-rsvp-cross-channel-secret');
  const participant = () => db.get<any>(
    "SELECT id,response_status,registration_status,attendance_status,arrival_status FROM evening_participants WHERE evening_id='cross-evening' AND player_id='cross-player'",
  );
  const bookedSlots = async () => (await db.all<any>(
    `SELECT s.id FROM evening_slot_registrations r
     JOIN evening_game_slots s ON s.id=r.slot_id
     JOIN evening_participants ep ON ep.id=r.participant_id
     WHERE ep.evening_id='cross-evening' AND ep.player_id='cross-player' ORDER BY s.slot_number`,
  )).map(row => String(row.id));
  const alerts = async () => (await db.all<any>(
    "SELECT event_type FROM telegram_message_outbox WHERE category='organizer' AND event_type IN ('evening_signed_up','evening_cancelled_by_player') ORDER BY rowid",
  )).map(row => row.event_type);
  return { app, db, bot, participant, bookedSlots, alerts };
}

describe('canonical participant mutation across Telegram and organizer CRM', () => {
  it('keeps RSVP and slots consistent as Telegram changes its quick answer', async () => {
    const { app, db, bot, participant, bookedSlots, alerts } = await setup();
    const slotsResponse = await request(app).get('/api/bot/evenings/cross-evening/slots')
      .set('X-Bot-Token', 'test-rsvp-cross-channel-secret');
    expect(slotsResponse.status, JSON.stringify(slotsResponse.body)).toBe(200);
    const ids = slotsResponse.body.slots.map((slot: any) => String(slot.id));
    expect(ids.length).toBeGreaterThanOrEqual(3);

    const send = async (status: string, starting?: string) => {
      const response = await bot().send({
        telegram_user_id: '750001',
        response_status: status,
        ...(starting ? { starting_slot_id: starting } : {}),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const row = await participant();
      expect(row.response_status).toBe(status);
      expect(row.registration_status).toBe(status);
      expect(row.attendance_status).toBe('pending');
      return row;
    };

    await send('going');
    expect(await bookedSlots()).toEqual(ids);
    expect(await alerts()).toEqual(['evening_signed_up']);

    // Repeated confirmation and a switch between two positive answers must
    // not generate duplicate organizer sign-up notices.
    await send('going');
    await send('late', ids[1]);
    expect(await bookedSlots()).toEqual(ids.slice(1));
    expect(await alerts()).toEqual(['evening_signed_up']);

    await send('thinking');
    expect(await bookedSlots()).toEqual([]);
    expect(await alerts()).toEqual(['evening_signed_up']);

    await send('going');
    expect(await bookedSlots()).toEqual(ids);
    expect(await alerts()).toEqual(['evening_signed_up', 'evening_signed_up']);

    await send('declined');
    expect(await bookedSlots()).toEqual([]);
    expect(await alerts()).toEqual(['evening_signed_up', 'evening_signed_up', 'evening_cancelled_by_player']);

    const rows = await db.all<any>("SELECT id FROM evening_participants WHERE evening_id='cross-evening' AND player_id='cross-player'");
    expect(rows).toHaveLength(1);
  });

  it('allows CRM correction through the same persisted entity, but locks Telegram after factual arrival', async () => {
    const { app, bot, participant, bookedSlots, alerts } = await setup();
    const sent = await bot().send({ telegram_user_id: '750001', response_status: 'going' });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect((await bookedSlots()).length).toBeGreaterThan(0);
    const participantId = String((await participant()).id);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    const corrected = await request(app).patch(`/api/evening-participants/${participantId}`)
      .set('Cookie', cookie).send({ response_status: 'declined' });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
    expect((await participant()).response_status).toBe('declined');
    expect((await participant()).registration_status).toBe('declined');
    expect(await bookedSlots()).toEqual([]);
    // Organizer corrections do not masquerade as a self-service Telegram refusal.
    expect(await alerts()).toEqual(['evening_signed_up']);

    const resumed = await bot().send({ telegram_user_id: '750001', response_status: 'going' });
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(200);
    expect(await alerts()).toEqual(['evening_signed_up', 'evening_signed_up']);

    const checkedIn = await request(app).patch(`/api/evening-participants/${participantId}`)
      .set('Cookie', cookie).send({ attendance_fact: 'attended_on_time' });
    expect(checkedIn.status, JSON.stringify(checkedIn.body)).toBe(200);
    expect((await participant()).attendance_status).toBe('attended');

    const rejected = await bot().send({ telegram_user_id: '750001', response_status: 'declined' });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('attendance_locked');
    expect((await participant()).response_status).toBe('going');
    expect((await bookedSlots()).length).toBeGreaterThan(0);
    expect(await alerts()).toEqual(['evening_signed_up', 'evening_signed_up']);
  });
});
