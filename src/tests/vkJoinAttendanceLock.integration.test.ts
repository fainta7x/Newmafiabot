import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  isParticipantResponseLockedAfterAttendance,
  setParticipantAttendance,
  setParticipantResponse,
} from '../server/services/eveningParticipantState.ts';
import { saveVkJoinResponse } from '../server/services/vkJoinRegistrationService.ts';

const dbs: DatabaseWrapper[] = [];
afterEach(() => {
  while (dbs.length) {
    try { dbs.pop()?.sqlite.close(); } catch { /* closed */ }
  }
});

const setup = async () => {
  const db = createDatabaseConnection(':memory:');
  dbs.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO players (id,nickname,game_level,contact_status,lifecycle_status,created_at,updated_at)
     VALUES ('vk-lock-player','VK участник','club','normal','normal',?,?)`,
    [now, now],
  );
  await db.run(
    `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
     VALUES ('vk-lock-evening','VK тест',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`,
    [new Date(Date.now() + 2 * 86400_000).toISOString(), now, now],
  );
  const row = async () => db.get<any>(
    "SELECT id,response_status,registration_status,attendance_status,arrival_status FROM evening_participants WHERE evening_id='vk-lock-evening' AND player_id='vk-lock-player'",
  );
  const respond = async (status: string) => saveVkJoinResponse(db, 'vk-lock-evening', 'vk-lock-player', status);
  return { db, row, respond };
};

describe('VK self-service RSVP after factual attendance', () => {
  it.each([
    [null, false],
    [undefined, false],
    [{ attendance_status: 'pending' }, false],
    [{ attendance_status: '' }, false],
    [{ attendance_status: 'attended' }, true],
    [{ attendance_status: 'no_show' }, true],
  ])('treats attendance %j as locked=%s', (input, locked) => {
    expect(isParticipantResponseLockedAfterAttendance(input)).toBe(locked);
  });

  it('allows normal response changes while pending, then blocks VK edits after arrival', async () => {
    const { db, row, respond } = await setup();
    const first = await respond('going');
    expect(first.response_status).toBe('going');
    expect(await row()).toMatchObject({ response_status: 'going', registration_status: 'going', attendance_status: 'pending' });

    const next = await respond('late');
    expect(next.response_status).toBe('late');
    const previous = await row();
    expect(previous).toMatchObject({ response_status: 'late', registration_status: 'late', attendance_status: 'pending' });

    await setParticipantAttendance(db, String(previous.id), 'attended_on_time');
    const checkedIn = await row();
    expect(checkedIn.attendance_status).toBe('attended');
    await expect(respond('declined')).rejects.toMatchObject({ statusCode: 409, code: 'attendance_locked' });
    expect(await row()).toEqual(checkedIn);

    // The organizer is still allowed to fix a mistakenly entered RSVP.
    await setParticipantResponse(db, String(previous.id), 'declined');
    expect(await row()).toMatchObject({
      response_status: 'declined', registration_status: 'declined', attendance_status: 'attended',
    });
  });

  it('also blocks VK changes after the organizer explicitly marked a no-show', async () => {
    const { db, row, respond } = await setup();
    await respond('going');
    const before = await row();
    await setParticipantAttendance(db, String(before.id), 'no_show');
    const checked = await row();
    expect(checked.attendance_status).toBe('no_show');
    await expect(respond('thinking')).rejects.toMatchObject({ statusCode: 409, code: 'attendance_locked' });
    expect(await row()).toEqual(checked);
  });
});
