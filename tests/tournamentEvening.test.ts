import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../src/db/index.ts';
import { createApp } from '../src/app.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../src/server/auth.ts';
import {
  cancelTournamentRegistration,
  loadTournamentEvening,
  notifyTournamentAudience,
  organizerAddTournamentPlayer,
  registerTournamentPlayer,
  reorderTournamentReserve,
  reportTournamentPayment,
  reviewTournamentPayment,
} from '../src/server/services/tournamentEveningService.ts';

describe('TOURNAMENT-EVENING-001', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  let organizerToken: string;

  beforeEach(async () => {
    process.env.ORGANIZER_NOTIFICATION_IDS = '';
    process.env.ORGANIZER_CHAT_ID = '';
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    organizerToken = generateOrganizerToken();
  });

  afterEach(() => db.sqlite.close());

  const addPlayer = async (id: string, gameLevel = 'tournament', judgeLevel = 'none') => {
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players
      (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at,game_level,judge_level)
      VALUES (?,?,'normal','normal',1000,0,?,?,?,?)`, [id, id, now, now, gameLevel, judgeLevel]);
  };

  const createEvening = async () => {
    await addPlayer('judge', 'tournament', 'judge');
    const response = await request(app)
      .post('/api/tournaments/evenings')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Тестовый турнир',
        date: '2026-10-02T17:00:00.000Z',
        venue: 'Суп с котом',
        judge_player_id: 'judge',
        player_capacity: 10,
        entry_fee_rub: 500,
        prize_fund_rub: 3000,
        prize_allocations: [
          { place: '1', amount_rub: 1500 },
          { place: '2', amount_rub: 1000 },
          { place: '3', amount_rub: 500 },
        ],
      });
    expect(response.status).toBe(201);
    return String(response.body.id);
  };

  const publish = async (id: string) => {
    const response = await request(app)
      .post(`/api/tournaments/evenings/${id}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(response.status).toBe(200);
  };

  it('creates only an exact ten-player tournament configuration and validates prize allocation before publish', async () => {
    await addPlayer('judge', 'tournament', 'judge');
    const invalidCapacity = await request(app).post('/api/tournaments/evenings').set('Authorization', `Bearer ${organizerToken}`).send({
      title: 'Bad', date: '2026-10-02T17:00:00.000Z', venue: 'Venue', judge_player_id: 'judge', player_capacity: 11,
      entry_fee_rub: 500, prize_fund_rub: 1000, prize_allocations: [{ place: '1', amount_rub: 1000 }],
    });
    expect(invalidCapacity.status).toBe(400);

    const id = await createEvening();
    const created = await loadTournamentEvening(db, id);
    expect(created).toMatchObject({ entry_fee_rub: 500, prize_fund_rub: 3000, player_capacity: 10, judge_player_id: 'judge' });
    await db.run(`UPDATE tournaments SET prize_allocations_json='[{"place":"1","amount_rub":1}]' WHERE id=?`, [id]);
    const invalidPrize = await request(app).post(`/api/tournaments/evenings/${id}/publish`).set('Authorization', `Bearer ${organizerToken}`);
    expect(invalidPrize.status).toBe(409);
  });

  it('confirms first ten, places the eleventh in FIFO reserve, excludes judge, and never creates an 11th confirmed slot', async () => {
    const id = await createEvening();
    await publish(id);
    for (let index = 1; index <= 11; index += 1) await addPlayer(`p${index}`);
    const results = await Promise.all(Array.from({ length: 11 }, (_, index) => registerTournamentPlayer(db, id, `p${index + 1}`)));
    expect(results.filter((row: any) => row.status === 'confirmed')).toHaveLength(10);
    expect(results.filter((row: any) => row.status === 'reserve')).toHaveLength(1);
    expect((await db.get<any>("SELECT COUNT(*) AS count FROM tournament_registrations WHERE tournament_id=? AND status='confirmed'", [id]))?.count).toBe(10);
    expect((await db.get<any>("SELECT MAX(slot_number) AS max_slot FROM tournament_registrations WHERE tournament_id=? AND status='confirmed'", [id]))?.max_slot).toBe(10);
    const reserve = await db.get<any>("SELECT player_id,queue_order FROM tournament_registrations WHERE tournament_id=? AND status='reserve'", [id]);
    expect(reserve.queue_order).toBe(1);
    await expect(registerTournamentPlayer(db, id, 'judge')).rejects.toThrow('JUDGE_CANNOT_REGISTER');
  });

  it('keeps registration idempotent and the canonical tournament roster identical to confirmed slots', async () => {
    const id = await createEvening(); await publish(id);
    for (let index = 1; index <= 10; index += 1) { await addPlayer(`p${index}`); await registerTournamentPlayer(db, id, `p${index}`); }
    const first = await registerTournamentPlayer(db, id, 'p1');
    const retry = await registerTournamentPlayer(db, id, 'p1');
    expect(retry.id).toBe(first.id);
    const registrations = await db.all<any>("SELECT player_id FROM tournament_registrations WHERE tournament_id=? AND status='confirmed' ORDER BY slot_number", [id]);
    const canonical = await db.all<any>('SELECT player_id FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number', [id]);
    expect(canonical.map((row) => row.player_id)).toEqual(registrations.map((row) => row.player_id));
    expect(canonical).toHaveLength(10);
  });

  it('promotes exactly the first reserve atomically when a confirmed player cancels', async () => {
    const id = await createEvening(); await publish(id);
    for (let index = 1; index <= 12; index += 1) { await addPlayer(`p${index}`); await registerTournamentPlayer(db, id, `p${index}`); }
    const reserveBefore = await db.all<any>("SELECT player_id,queue_order FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY queue_order", [id]);
    expect(reserveBefore.map((row) => row.player_id)).toEqual(['p11', 'p12']);
    await Promise.all([cancelTournamentRegistration(db, id, 'p3'), cancelTournamentRegistration(db, id, 'p3')]);
    const p11 = await db.get<any>('SELECT status,slot_number FROM tournament_registrations WHERE tournament_id=? AND player_id=?', [id, 'p11']);
    const p12 = await db.get<any>('SELECT status,queue_order FROM tournament_registrations WHERE tournament_id=? AND player_id=?', [id, 'p12']);
    expect(p11.status).toBe('confirmed');
    expect(p11.slot_number).toBe(3);
    expect(p12).toMatchObject({ status: 'reserve', queue_order: 1 });
    expect((await db.get<any>("SELECT COUNT(*) AS count FROM tournament_registrations WHERE tournament_id=? AND status='confirmed'", [id]))?.count).toBe(10);
  });

  it('requires tournament eligibility and preserves canonical player identity from the player session', async () => {
    const id = await createEvening(); await publish(id);
    await addPlayer('club-only', 'club');
    const denied = await request(app).post(`/api/tournaments/evenings/${id}/register`).set('Cookie', `player_token=${generatePlayerSessionToken('club-only')}`);
    expect(denied.status).toBe(403);
    await addPlayer('eligible');
    const accepted = await request(app).post(`/api/tournaments/evenings/${id}/register`).set('Cookie', `player_token=${generatePlayerSessionToken('eligible')}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.player_id).toBe('eligible');
  });

  it('keeps payment as a two-stage isolated tournament claim and does not mutate tokens or casual payment tables', async () => {
    const id = await createEvening(); await publish(id); await addPlayer('payer'); await registerTournamentPlayer(db, id, 'payer');
    const tokenBefore = (await db.get<any>('SELECT tokens FROM players WHERE id=?', ['payer']))?.tokens;
    const reported = await reportTournamentPayment(db, id, 'payer', 'перевёл');
    expect(reported.state).toBe('pending');
    expect((await loadTournamentEvening(db, id, 'payer'))?.payment_totals.confirmed_rub).toBe(0);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id=?', ['payer']))?.tokens).toBe(tokenBefore);
    const confirmed = await reviewTournamentPayment(db, id, 'payer', 'confirmed', 'organizer-test', 'проверено');
    expect(confirmed.state).toBe('confirmed');
    expect((await loadTournamentEvening(db, id, 'payer'))?.payment_totals.confirmed_rub).toBe(500);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id=?', ['payer']))?.tokens).toBe(tokenBefore);
    const retry = await reviewTournamentPayment(db, id, 'payer', 'confirmed', 'organizer-test', 'проверено');
    expect(retry.id).toBe(confirmed.id);
  });

  it('audits organizer payment reject/correct transitions and does not count waived fees as confirmed money', async () => {
    const id = await createEvening(); await publish(id); await addPlayer('payer'); await registerTournamentPlayer(db, id, 'payer');
    await reportTournamentPayment(db, id, 'payer', 'reference');
    await reviewTournamentPayment(db, id, 'payer', 'rejected', 'organizer-test', 'не найден перевод');
    await reviewTournamentPayment(db, id, 'payer', 'confirmed', 'organizer-test', 'нашёл перевод');
    const beforeRetry = await db.get<any>("SELECT COUNT(*) AS count FROM tournament_evening_audit WHERE tournament_id=? AND player_id=? AND action='payment_confirmed'", [id, 'payer']);
    await reviewTournamentPayment(db, id, 'payer', 'confirmed', 'organizer-test', 'нашёл перевод');
    const afterRetry = await db.get<any>("SELECT COUNT(*) AS count FROM tournament_evening_audit WHERE tournament_id=? AND player_id=? AND action='payment_confirmed'", [id, 'payer']);
    expect(afterRetry.count).toBe(beforeRetry.count);
    await reviewTournamentPayment(db, id, 'payer', 'waived', 'organizer-test', 'гостевой допуск');
    const detail = await loadTournamentEvening(db, id);
    expect(detail?.payment_totals.confirmed_rub).toBe(0);
    expect(detail?.payment_totals.unpaid_count).toBe(0);
    const audit = await db.all<any>("SELECT action,actor_type,actor_id,created_at FROM tournament_evening_audit WHERE tournament_id=? AND player_id=? AND action LIKE 'payment_%'", [id, 'payer']);
    expect(audit.some((row) => row.action === 'payment_rejected' && row.actor_type === 'organizer' && row.actor_id === 'organizer-test' && row.created_at)).toBe(true);
    expect(audit.some((row) => row.action === 'payment_waived')).toBe(true);
  });

  it('audits organizer add, reserve reorder and removal with explicit reasons', async () => {
    const id = await createEvening();
    for (let index = 1; index <= 12; index += 1) await addPlayer(`p${index}`);
    for (let index = 1; index <= 12; index += 1) await organizerAddTournamentPlayer(db, id, `p${index}`, 'ручное добавление');
    const reserve = await db.all<any>("SELECT id,player_id FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY queue_order", [id]);
    await reorderTournamentReserve(db, id, [reserve[1].id, reserve[0].id], 'поменяли приоритет');
    const reordered = await db.all<any>("SELECT player_id FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY queue_order", [id]);
    expect(reordered.map((row) => row.player_id)).toEqual(['p12', 'p11']);
    await cancelTournamentRegistration(db, id, 'p2', 'organizer', null, 'снял организатор');
    const actions = await db.all<any>('SELECT action,reason FROM tournament_evening_audit WHERE tournament_id=? ORDER BY created_at,id', [id]);
    expect(actions.some((row) => row.action === 'reserve_reorder' && row.reason === 'поменяли приоритет')).toBe(true);
    expect(actions.some((row) => row.action === 'cancel' && row.reason === 'снял организатор')).toBe(true);
  });

  it('adds published tournaments to the shared player calendar without CASUAL pricing', async () => {
    const id = await createEvening(); await publish(id); await addPlayer('viewer');
    const response = await request(app).get('/api/player/calendar?month=2026-10').set('Cookie', `player_token=${generatePlayerSessionToken('viewer')}`);
    expect(response.status).toBe(200);
    const event = response.body.events.find((item: any) => item.id === id);
    expect(event).toMatchObject({ event_type: 'tournament', format: 'TOURNAMENT', badge: 'Турнир', player_capacity: 10, entry_fee_rub: 500 });
    expect(event).not.toHaveProperty('price');
  });

  it('exposes one stable sanitized registration resource after publication and never exposes organizer payment truth publicly', async () => {
    const id = await createEvening();
    const draft = await db.get<any>('SELECT registration_token FROM tournaments WHERE id=?', [id]);
    const hidden = await request(app).get(`/api/tournaments/registration/${draft.registration_token}`);
    expect(hidden.status).toBe(404);
    await publish(id);
    const shared = await request(app).get(`/api/tournaments/registration/${draft.registration_token}`);
    expect(shared.status).toBe(200);
    expect(shared.body).toMatchObject({ id, format: 'TOURNAMENT', player_capacity: 10, entry_fee_rub: 500 });
    expect(shared.body).not.toHaveProperty('payment_totals');
    expect(shared.body).not.toHaveProperty('confirmed');
    expect(shared.body).not.toHaveProperty('reserves');
  });

  it('routes tournament publication to one canonical external channel per eligible player and excludes the assigned judge', async () => {
    const id = await createEvening();
    await addPlayer('dual-channel');
    const now = new Date().toISOString();
    await db.run('UPDATE players SET telegram_user_id=? WHERE id=?', ['10001', 'dual-channel']);
    await db.run(`INSERT INTO player_external_identities (platform,external_user_id,player_id,screen_name,display_name,linked_at,updated_at)
      VALUES ('vk','20002','dual-channel','dual','Dual',?,?)`, [now, now]);
    await publish(id);
    const delivery = await db.get<any>("SELECT selected_channel,action_path FROM personal_notification_deliveries WHERE player_id=? AND event_type='tournament_published'", ['dual-channel']);
    expect(delivery).toMatchObject({ selected_channel: 'telegram', action_path: `/player/events/${id}` });
    expect((await db.get<any>("SELECT COUNT(*) AS count FROM personal_notification_deliveries WHERE player_id=? AND event_type='tournament_published'", ['dual-channel']))?.count).toBe(1);
    expect((await db.get<any>("SELECT COUNT(*) AS count FROM personal_notification_deliveries WHERE player_id='judge' AND event_type='tournament_published'"))?.count).toBe(0);
    const retry = await notifyTournamentAudience(db, id);
    expect(retry.queued).toBe(0);
    expect((await db.get<any>("SELECT COUNT(*) AS count FROM personal_notification_deliveries WHERE player_id=? AND event_type='tournament_published'", ['dual-channel']))?.count).toBe(1);
  });

  it('does not rewrite historical canonical tournament data when additive schema is ensured', async () => {
    const now = new Date().toISOString();
    await db.run(`INSERT INTO tournaments (id,title,date,venue,stage,status,chief_judge_name,notes,game_count,created_at,updated_at)
      VALUES ('legacy-bogdan','Турнир Богдана 1.08','2026-08-01','legacy','final','completed','Богдан','historical',10,?,?)`, [now, now]);
    await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES ('legacy-participant','legacy-bogdan',NULL,'Исторический игрок',1)`);
    const beforeTournament = await db.get<any>("SELECT title,date,venue,stage,status,chief_judge_name,notes,game_count FROM tournaments WHERE id='legacy-bogdan'");
    const beforeParticipant = await db.get<any>("SELECT * FROM tournament_participants WHERE id='legacy-participant'");
    const { ensureTournamentEveningSchema } = await import('../src/db/ensureTournamentEveningSchema.ts');
    await ensureTournamentEveningSchema(db);
    expect(await db.get<any>("SELECT title,date,venue,stage,status,chief_judge_name,notes,game_count FROM tournaments WHERE id='legacy-bogdan'")).toEqual(beforeTournament);
    expect(await db.get<any>("SELECT * FROM tournament_participants WHERE id='legacy-participant'")).toEqual(beforeParticipant);
  });
});
