import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { createWelcomeLead, leadManagementTokenHash } from '../server/services/newcomerFunnelService.ts';
import { issueGuestBookingToken, loadGuestBooking, updateGuestBooking } from '../server/services/guestBookingService.ts';
import { ensureSlotsForEvening } from '../server/services/eveningSlotPlanningService.ts';
import { generateOrganizerToken } from '../server/auth.ts';

describe('a lead manages their own booking without an account', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  let client: ReturnType<typeof request.agent>;
  let clientNumber = 0;
  const input = { name: 'Аня', contact_kind: 'telegram', contact_value: '@anna_booking', evening_id: 'first' };
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    client = request.agent(app).set('X-Forwarded-For', `192.0.2.${++clientNumber}`);
    const stamp = new Date().toISOString();
    for (const [id, days, format, status] of [['first', 2, 'NOVICE', 'published'], ['next', 9, 'NOVICE', 'published'], ['club', 9, 'CASUAL', 'published'], ['closed', 9, 'NOVICE', 'completed']] as const) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at) VALUES (?,?,?,'Europe/Moscow','Суп с Котом',?,?,20,200,?,?)`, [id, id, new Date(Date.now() + days * 86400_000).toISOString(), format, status, stamp, stamp]);
    }
  });
  afterEach(() => { vi.restoreAllMocks(); db.sqlite.close(); });
  const signUp = async () => {
    const result = await client.post('/api/public/welcome/lead').send(input);
    expect(result.status).toBe(201);
    expect(result.body.booked).toBe(true);
    return result.body.management_token as string;
  };
  const answer = async (eveningId: string) => (await db.get<{ response_status: string }>('SELECT response_status FROM evening_participants WHERE evening_id=?', [eveningId]))?.response_status;

  it('returns a private token once, stores its hash, and reveals neither contact nor player ID', async () => {
    const token = await signUp();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const saved = await db.get<any>('SELECT * FROM newcomer_leads');
    expect(saved.management_token_hash).toBe(leadManagementTokenHash(token));
    expect(JSON.stringify(saved)).not.toContain(token);
    const own = await client.get('/api/public/welcome/booking').set('Authorization', `Bearer ${token}`).set('Origin', 'https://2lamafia.ru');
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.body).toMatchObject({ name: 'Аня', evening: { id: 'first' }, booked: true, can_change: true, can_cancel: true });
    expect(own.body.games.length).toBeGreaterThan(0);
    expect(own.body).not.toHaveProperty('player_id');
    expect(JSON.stringify(own.body)).not.toContain('@anna_booking');
    expect((await client.get(`/api/public/welcome/booking?token=${token}`)).status).toBe(401);
  });

  it('does not grant access to a stranger repeating the contact, even after cancellation', async () => {
    const token = await signUp();
    const stranger = await client.post('/api/public/welcome/lead').send({ ...input, evening_id: 'next' });
    expect(stranger.body).toMatchObject({ management_required: true, booked: false });
    expect(stranger.body).not.toHaveProperty('management_token');
    expect((await loadGuestBooking(db, token)).evening?.id).toBe('first');
    await updateGuestBooking(db, token, { action: 'cancel' });
    const retry = await client.post('/api/public/welcome/lead').send(input);
    expect(retry.body).toMatchObject({ management_required: true, booked: false });
    expect((await loadGuestBooking(db, token)).evening).toBeNull();
  });

  it('preserves a browser-generated token through a lost-response retry and CORS preflight', async () => {
    const token = randomBytes(32).toString('base64url');
    const preflight = await client.options('/api/public/welcome/lead').set('Origin', 'https://2lamafia.ru').set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(preflight.headers['access-control-allow-headers']).toContain('Authorization');
    const first = await client.post('/api/public/welcome/lead').set('Authorization', `Bearer ${token}`).send(input);
    const retry = await client.post('/api/public/welcome/lead').set('Authorization', `Bearer ${token}`).send(input);
    expect(first.body.management_token).toBe(token);
    expect(retry.body.management_token).toBe(token);
    expect(retry.body).toMatchObject({ created: false, booked: true });
    expect(Number((await db.get<any>('SELECT COUNT(*) n FROM newcomer_leads')).n)).toBe(1);
  });

  it('cancels all chosen games, records an actual refusal, and safely repeats cancellation', async () => {
    const token = await signUp();
    const cancel = await client.post('/api/public/welcome/booking').set('Authorization', `Bearer ${token}`).send({ action: 'cancel' });
    expect(cancel.status).toBe(200);
    expect(cancel.body).toMatchObject({ ok: true, booked: false, evening: null, can_cancel: false });
    expect(await answer('first')).toBe('declined');
    expect(Number((await db.get<any>('SELECT COUNT(*) n FROM evening_slot_registrations')).n)).toBe(0);
    expect((await updateGuestBooking(db, token, { action: 'cancel' })).evening).toBeNull();
    expect((await client.get('/api/public/welcome/seats?evening=first')).body.going).toBe(0);
  });

  it('moves the same person atomically and allows booking again after a cancellation', async () => {
    const token = await signUp();
    const moved = await updateGuestBooking(db, token, { action: 'reschedule', evening_id: 'next' });
    expect(moved).toMatchObject({ booked: true, evening: { id: 'next' } });
    expect(await answer('first')).toBe('declined');
    expect(await answer('next')).toBe('going');
    expect((await client.get('/api/public/welcome/seats?evening=first')).body.going).toBe(0);
    expect((await client.get('/api/public/welcome/seats?evening=next')).body.going).toBe(1);
    await updateGuestBooking(db, token, { action: 'cancel' });
    expect((await updateGuestBooking(db, token, { action: 'reschedule', evening_id: 'first' })).booked).toBe(true);
    expect(Number((await db.get<any>('SELECT COUNT(*) n FROM players')).n)).toBe(1);
  });

  it('leaves the original booking intact for a missing, closed, wrong-format or failed target', async () => {
    const token = await signUp();
    for (const id of ['missing', 'closed', 'club']) {
      await expect(updateGuestBooking(db, token, { action: 'reschedule', evening_id: id })).rejects.toMatchObject({ statusCode: 409 });
    }
    await ensureSlotsForEvening(db, 'next');
    await db.run("UPDATE evening_game_slots SET status='closed' WHERE evening_id='next'");
    await expect(updateGuestBooking(db, token, { action: 'reschedule', evening_id: 'next' })).rejects.toMatchObject({ statusCode: 409 });
    expect((await loadGuestBooking(db, token))).toMatchObject({ booked: true, evening: { id: 'first' } });
    expect(await answer('first')).toBe('going');
    expect((await client.get('/api/public/welcome/seats?evening=first')).body.going).toBe(1);
  });

  it('rejects expired, converted or unrelated tokens and an already marked attendance', async () => {
    const token = await signUp();
    const stranger = randomBytes(32).toString('base64url');
    expect((await client.post('/api/public/welcome/booking').set('Authorization', `Bearer ${stranger}`).send({ action: 'cancel', player_id: 'any' })).status).toBe(401);
    await db.run("UPDATE evening_participants SET attendance_status='attended' WHERE evening_id='first'");
    expect((await loadGuestBooking(db, token)).can_change).toBe(false);
    await expect(updateGuestBooking(db, token, { action: 'cancel' })).rejects.toMatchObject({ statusCode: 409 });
    await db.run("UPDATE newcomer_leads SET management_expires_at='2000-01-01T00:00:00.000Z'");
    await expect(loadGuestBooking(db, token)).rejects.toMatchObject({ statusCode: 401 });
    await db.run("UPDATE newcomer_leads SET management_expires_at='2099-01-01T00:00:00.000Z',status='converted'");
    await expect(loadGuestBooking(db, token)).rejects.toMatchObject({ statusCode: 401 });
    expect((await client.post('/api/public/welcome/lead').set('Authorization', `Bearer ${token}`).send({ ...input, evening_id: 'next' })).body.management_required).toBe(true);
  });

  it('does not reuse one person’s secret when a second contact registers from the same browser', async () => {
    const token = await signUp();
    const second = await createWelcomeLead(db, { name: 'Борис', contactKind: 'telegram', contactValue: '@boris_booking', eveningId: 'first', managementToken: token });
    expect(second.managementToken).not.toBe(token);
    expect((await loadGuestBooking(db, token)).name).toBe('Аня');
    expect((await loadGuestBooking(db, second.managementToken)).name).toBe('Борис');
  });

  it('lets only an organizer issue a private link for an old lead, rotating the previous link', async () => {
    const lead = await createWelcomeLead(db, { name: 'Вера', contactKind: 'telegram', contactValue: '@vera_old_booking', eveningId: 'first', addedBy: 'crm' });
    const path = `/api/crm/leads/${lead.playerId}/booking-link`;
    expect((await client.post(path).send({})).status).toBe(401);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const first = await client.post(path).set('Cookie', cookie).send({});
    expect(first.status).toBe(200);
    const token = new URL(first.body.url).hash.slice('#booking='.length);
    expect((await loadGuestBooking(db, token)).name).toBe('Вера');
    const second = await client.post(path).set('Cookie', cookie).send({});
    expect(second.body.url).not.toBe(first.body.url);
    await expect(loadGuestBooking(db, token)).rejects.toMatchObject({ statusCode: 401 });
    expect((await loadGuestBooking(db, new URL(second.body.url).hash.slice('#booking='.length))).booked).toBe(true);
  });

  it('does not create two identities when the same initial contact is submitted concurrently', async () => {
    const input = { name: 'Оля', contactKind: 'telegram', contactValue: '@olya_parallel_booking', eveningId: 'first' };
    const attempts = await Promise.allSettled([createWelcomeLead(db, input), createWelcomeLead(db, input)]);
    expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(Number((await db.get<any>('SELECT COUNT(*) n FROM newcomer_leads')).n)).toBe(1);
  });

  it('honours token revocation while a repeat submission is being processed', async () => {
    const token = await signUp();
    await updateGuestBooking(db, token, { action: 'cancel' });
    const lead = await db.get<{ player_id: string }>('SELECT player_id FROM newcomer_leads');
    const originalGet = db.get.bind(db);
    let replacement = '';
    vi.spyOn(db, 'get').mockImplementation(async (sql, args) => {
      const row = await originalGet(sql, args);
      if (!replacement && sql.startsWith('SELECT l.player_id,l.management_token_hash')) {
        replacement = await issueGuestBookingToken(db, lead!.player_id);
      }
      return row;
    });
    const retried = await createWelcomeLead(db, { name: 'Аня', contactKind: 'telegram', contactValue: input.contact_value, eveningId: 'next', managementToken: token });
    expect(retried.managementRequired).toBe(true);
    expect((await loadGuestBooking(db, replacement)).evening).toBeNull();
    expect(await answer('next')).not.toBe('going');
  });
});
