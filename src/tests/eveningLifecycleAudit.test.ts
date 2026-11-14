import { afterEach, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { replacePlayerSlotSelection } from '../server/services/eveningSlotWritesService.ts';
import { replaceOrganizerPlayerSlotSelection } from '../server/services/organizerEveningSlotSelectionService.ts';
import { loadEveningSeatBookings, saveEveningSeatBooking, cancelEveningSeatBooking } from '../server/services/eveningSeatBookingService.ts';
import { saveVkJoinResponse } from '../server/services/vkJoinRegistrationService.ts';
import { updateEveningSlotSettings } from '../server/services/eveningSlotWritesService.ts';
import { addEveningWalkIn, settleEveningFromCloseout } from '../server/services/eveningCloseoutService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => opened.splice(0).forEach(db => db.sqlite.close()));

async function seed() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run("INSERT INTO players (id,nickname,game_level,club_stage,created_at,updated_at) VALUES ('p','Lifecycle player','club','CLUB_PLAYER',?,?),('q','Another player','club','CLUB_PLAYER',?,?)", [now, now, now, now]);
  await db.run("INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('e','Lifecycle evening',?,'Europe/Moscow','CASUAL','published',10,100,?,?)", [new Date(Date.now() + 48 * 3600000).toISOString(), now, now]);
  await db.run("INSERT INTO evening_tables (id,evening_id,name,capacity,created_at,updated_at) VALUES ('table','e','Table',10,?,?)", [now, now]);
  const plan = await loadEveningSlotPlan(db, 'e', 'p');
  const ids = plan.slots.map(slot => slot.id);
  await replacePlayerSlotSelection(db, 'e', 'p', ids.slice(0, 2), { notifyOrganizer: false });
  await saveEveningSeatBooking(db, 'e', 'p', { slotId: ids[0], tableId: 'table', seat: 1 });
  await saveEveningSeatBooking(db, 'e', 'p', { slotId: ids[1], tableId: 'table', seat: 2 });
  return { db, app, ids, cookie: `player_token=${generatePlayerSessionToken('p')}` };
}

it('the alternative self-selection route cannot bypass the first-application gate', async () => {
  const { db, app, ids, cookie } = await seed();
  await db.run("UPDATE players SET club_stage='NEW' WHERE id='p'");
  const canonical = await request(app).post('/api/player/evenings/e/slots').set('Cookie', cookie).send({ slot_ids: [ids[0]] });
  expect(canonical.status).toBe(403);
  const alternate = await request(app).put('/api/evenings/e/slots/me').set('Cookie', cookie).send({ slot_ids: [ids[0]], noviceLead: true, source: 'welcome_page' });
  expect(alternate.status).toBe(403);
});

it('refusal releases future seats while preserving started history', async () => {
  const { db, app, ids, cookie } = await seed();
  await db.run('UPDATE evening_seat_plans SET started=1 WHERE slot_id=?', [ids[0]]);
  const response = await request(app).post('/api/player/evenings/e/respond').set('Cookie', cookie).send({ response_status: 'declined' });
  expect(response.status).toBe(200);
  const seats = await loadEveningSeatBookings(db, 'e', 'p');
  expect(seats.map(seat => [seat.slot_id, seat.started])).toEqual([[ids[0], 1]]);
});

it('organizer exact-game edits release only removed future reservations', async () => {
  const { db, ids } = await seed();
  await db.run('UPDATE evening_seat_plans SET started=1 WHERE slot_id=?', [ids[0]]);
  await replaceOrganizerPlayerSlotSelection(db, 'e', 'p', [ids[0]]);
  expect((await loadEveningSeatBookings(db, 'e', 'p')).map(seat => seat.slot_id)).toEqual([ids[0]]);
});

it('a cancelled evening does not accept a new or moved seat', async () => {
  const { db, ids } = await seed();
  await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'");
  await expect(saveEveningSeatBooking(db, 'e', 'p', { slotId: ids[0], tableId: 'table', seat: 4 })).rejects.toMatchObject({ statusCode: 409 });
  expect((await loadEveningSeatBookings(db, 'e', 'p'))[0].seat).toBe(1);
});

it('a cancelled evening does not accept organizer slot edits', async () => {
  const { db, ids } = await seed();
  await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'");
  await expect(replaceOrganizerPlayerSlotSelection(db, 'e', 'p', [ids[0]])).rejects.toMatchObject({ statusCode: 409 });
});

it('a closed evening cannot lose an unstarted historical reservation', async () => {
  const { db, ids } = await seed();
  await db.run("UPDATE game_evenings SET status='completed',settled_at=? WHERE id='e'", [new Date().toISOString()]);
  await expect(cancelEveningSeatBooking(db, 'e', ids[1], 'p')).rejects.toMatchObject({ statusCode: 409 });
  expect(await loadEveningSeatBookings(db, 'e', 'p')).toHaveLength(2);
});

it('a cancelled evening cannot accept a walk-in', async () => {
  const { db } = await seed();
  await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'");
  await expect(addEveningWalkIn(db, 'e', { player_id: 'q' })).rejects.toMatchObject({ statusCode: 409 });
});

it('settlement cannot turn a cancelled evening into a completed one', async () => {
  const { db } = await seed();
  await db.run("UPDATE evening_participants SET attendance_status='attended' WHERE evening_id='e'");
  await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'");
  await expect(settleEveningFromCloseout(db, 'e', { allow_missing_game_stats: true })).rejects.toMatchObject({ statusCode: 409 });
  expect(await db.get("SELECT status,settled_at FROM game_evenings WHERE id='e'")).toEqual({ status: 'cancelled', settled_at: null });
});


it('Telegram and VK cannot bypass the first-application gate or create a participant', async () => {
  const { db, app } = await seed();
  await db.run("UPDATE players SET club_stage='NEW',telegram_user_id='73001' WHERE id='q'");
  const previousSecret = process.env.BOT_API_SECRET;
  process.env.BOT_API_SECRET = 'lifecycle-test-secret';
  try {
    const response = await request(app).post('/api/bot/evenings/e/respond')
      .set('X-Bot-Token', 'lifecycle-test-secret')
      .send({ telegram_user_id: '73001', response_status: 'going' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('first_application_required');
    await expect(saveVkJoinResponse(db, 'e', 'q', 'going')).rejects.toMatchObject({ statusCode: 403, code: 'first_application_required' });
    expect(await db.get("SELECT id FROM evening_participants WHERE evening_id='e' AND player_id='q'")).toBeNull();
  } finally {
    if (previousSecret === undefined) delete process.env.BOT_API_SECRET;
    else process.env.BOT_API_SECRET = previousSecret;
  }
});

it('thinking clears future commitments without changing factual attendance', async () => {
  const { db, app, cookie } = await seed();
  const response = await request(app).post('/api/player/evenings/e/respond').set('Cookie', cookie).send({ response_status: 'thinking' });
  expect(response.status).toBe(200);
  expect(await loadEveningSeatBookings(db, 'e', 'p')).toEqual([]);
  expect(await db.all("SELECT r.id FROM evening_slot_registrations r JOIN evening_participants ep ON ep.id=r.participant_id WHERE ep.evening_id='e'")).toEqual([]);
  expect(await db.get("SELECT attendance_status FROM evening_participants WHERE evening_id='e' AND player_id='p'")).toEqual({ attendance_status: 'pending' });
});

it('cancelled participant PATCH and DELETE preserve the roster', async () => {
  const { db, app } = await seed();
  const participant = await db.get<any>("SELECT id FROM evening_participants WHERE evening_id='e' AND player_id='p'");
  await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'");
  const cookie = `organizer_token=${generateOrganizerToken()}`;
  expect((await request(app).patch(`/api/evening-participants/${participant.id}`).set('Cookie', cookie).send({ response_status: 'declined' })).status).toBe(409);
  expect((await request(app).delete(`/api/evening-participants/${participant.id}`).set('Cookie', cookie)).status).toBe(409);
  expect(await db.get('SELECT response_status FROM evening_participants WHERE id=?', [participant.id])).toEqual({ response_status: 'going' });
});

it('cancelled game settings reject writes while organizer draft preparation remains possible', async () => {
  const { db, ids } = await seed();
  await db.run("UPDATE game_evenings SET status='cancelled' WHERE id='e'");
  await expect(updateEveningSlotSettings(db, 'e', { slot_duration_minutes: 90 })).rejects.toMatchObject({ statusCode: 409 });
  await db.run("UPDATE game_evenings SET status='draft' WHERE id='e'");
  await replaceOrganizerPlayerSlotSelection(db, 'e', 'p', [ids[0]]);
  await saveEveningSeatBooking(db, 'e', 'p', { slotId: ids[0], tableId: 'table', seat: 4 }, true);
  expect((await loadEveningSeatBookings(db, 'e', 'p'))[0].seat).toBe(4);
});


it('a player who lost registration eligibility cannot move a seat', async () => {
  const { db, ids } = await seed();
  await db.run("UPDATE players SET club_stage='NEW' WHERE id='p'");
  await expect(saveEveningSeatBooking(db, 'e', 'p', { slotId: ids[0], tableId: 'table', seat: 4 }))
    .rejects.toMatchObject({ statusCode: 403, code: 'first_application_required' });
  expect((await loadEveningSeatBookings(db, 'e', 'p'))[0].seat).toBe(1);
});
