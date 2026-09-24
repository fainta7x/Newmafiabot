import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';
import { NOVICE_PAID_GAME_PRICE, ensureSlotsForEvening, novicePriceForPlayer, reconcileNoviceEveningCharges, replacePlayerSlotSelection } from '../server/services/eveningSlotPlanningService.ts';
import { getNovicePlayerState } from '../server/services/noviceService.ts';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';

const opened: DatabaseWrapper[] = [];
const makeDb = () => { const db = createDatabaseConnection(':memory:'); opened.push(db); return db; };
const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;
const playerCookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;

afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

describe('NOVICE-001 funnel', () => {
  it('keeps a first-time profile pending until organizer confirmation', async () => {
    const db = makeDb();
    const app = await createApp(db);
    const registered = await registerNewPlayer(db, { telegramUserId: '771', nickname: 'Первая заявка' });
    const id = registered.player.id;
    const initial = await request(app).get('/api/player/novice').set('Cookie', playerCookie(id));
    expect(initial.status).toBe(200);
    expect(initial.body.player).toMatchObject({ club_stage: 'NEW', game_level: 'unrated' });
    expect(initial.body.can_self_register).toBe(false);

    const applied = await request(app).post('/api/player/novice/applications').set('Cookie', playerCookie(id)).send({ entry_route: 'NOVICE' });
    expect(applied.status).toBe(201);
    expect(applied.body.state.player.club_stage).toBe('NEW');

    const queue = await request(app).get('/api/novice/applications').set('Cookie', organizerCookie());
    expect(queue.status).toBe(200);
    expect(queue.body.applications[0]).toMatchObject({ player_id: id, entry_route: 'NOVICE', status: 'NEW' });

    const confirmed = await request(app)
      .patch(`/api/novice/applications/${applied.body.id}`)
      .set('Cookie', organizerCookie())
      .send({ status: 'CONFIRMED' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.state.player).toMatchObject({ club_stage: 'NOVICE_ACTIVE', game_level: 'novice' });
    expect(confirmed.body.state.can_self_register).toBe(true);
  });

  it('raises a novice to club level on transfer but keeps a higher organizer-set level', async () => {
    const db = makeDb();
    const app = await createApp(db);
    const novice = (await registerNewPlayer(db, { telegramUserId: '781', nickname: 'Выпускник' })).player.id;
    const strong = (await registerNewPlayer(db, { telegramUserId: '782', nickname: 'Сильный выпускник' })).player.id;
    await db.run("UPDATE players SET club_stage = 'NOVICE_ACTIVE', game_level = 'novice' WHERE id = ?", [novice]);
    await db.run("UPDATE players SET club_stage = 'NOVICE_ACTIVE', game_level = 'tournament' WHERE id = ?", [strong]);

    for (const id of [novice, strong]) {
      const converted = await request(app).post(`/api/novice/players/${id}/convert`).set('Cookie', organizerCookie());
      expect(converted.status).toBe(200);
    }
    expect(await db.get<any>('SELECT club_stage, game_level FROM players WHERE id = ?', [novice])).toMatchObject({ club_stage: 'CLUB_PLAYER', game_level: 'club' });
    expect(await db.get<any>('SELECT game_level FROM players WHERE id = ?', [strong])).toMatchObject({ game_level: 'tournament' });
  });

  it('surfaces a bot-registered player without an application and lets the organizer admit them', async () => {
    vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '5550001');
    const db = makeDb();
    const app = await createApp(db);
    // Same source the Telegram bot's /api/bot/players/register route passes.
    const { player } = await registerNewPlayer(db, {
      telegramUserId: '778', telegramUsername: 'veteran', nickname: 'Опытный из бота', source: 'telegram_bot_registration',
    });

    const alert = await db.get<any>('SELECT chat_id, text FROM telegram_message_outbox WHERE message_key = ?', [`new-player-registered:${player.id}:5550001`]);
    expect(alert?.text).toContain('Опытный из бота');
    expect(await db.get<any>('SELECT status FROM organizer_tasks WHERE automation_key = ?', [`verified-onboarding:new-player:${player.id}`]))
      .toMatchObject({ status: 'todo' });

    const queue = await request(app).get('/api/novice/applications').set('Cookie', organizerCookie());
    expect(queue.body.awaiting_players).toEqual([expect.objectContaining({ id: player.id, nickname: 'Опытный из бота', telegram_username: 'veteran' })]);

    const admitted = await request(app).post(`/api/novice/players/${player.id}/admit`)
      .set('Cookie', organizerCookie()).send({ entry_route: 'EXPERIENCED' });
    expect(admitted.status).toBe(200);
    expect(admitted.body.state.player.club_stage).toBe('CLUB_PLAYER');
    expect(admitted.body.state.can_self_register).toBe(true);
    expect(await db.get<any>('SELECT status FROM organizer_tasks WHERE automation_key = ?', [`verified-onboarding:new-player:${player.id}`]))
      .toMatchObject({ status: 'done' });

    const after = await request(app).get('/api/novice/applications').set('Cookie', organizerCookie());
    expect(after.body.awaiting_players).toEqual([]);
    const again = await request(app).post(`/api/novice/players/${player.id}/admit`)
      .set('Cookie', organizerCookie()).send({ entry_route: 'NOVICE' });
    expect(again.status).toBe(409);
  });

  it('does not resurface rejected applicants or admit over a player application', async () => {
    const db = makeDb();
    const app = await createApp(db);
    const rejected = (await registerNewPlayer(db, { telegramUserId: '781', nickname: 'Отклонённый' })).player;
    const applied = await request(app).post('/api/player/novice/applications').set('Cookie', playerCookie(rejected.id)).send({ entry_route: 'EXPERIENCED' });
    await request(app).patch(`/api/novice/applications/${applied.body.id}`).set('Cookie', organizerCookie()).send({ status: 'CANCELLED' });

    const racing = (await registerNewPlayer(db, { telegramUserId: '782', nickname: 'Подал сам' })).player;
    const queue = await request(app).get('/api/novice/applications').set('Cookie', organizerCookie());
    expect(queue.body.awaiting_players.map((row: any) => row.id)).toEqual([racing.id]);

    // The player files a novice application after the organizer loaded the card.
    await request(app).post('/api/player/novice/applications').set('Cookie', playerCookie(racing.id)).send({ entry_route: 'NOVICE' });
    const admit = await request(app).post(`/api/novice/players/${racing.id}/admit`).set('Cookie', organizerCookie()).send({ entry_route: 'EXPERIENCED' });
    expect(admit.status).toBe(409);
    expect(await db.get<any>('SELECT club_stage FROM players WHERE id = ?', [racing.id])).toMatchObject({ club_stage: 'NEW' });
  });

  it('alerts CRM organizers without env configuration and lists level decisions on the Today screen', async () => {
    vi.stubEnv('ORGANIZER_NOTIFICATION_IDS', '');
    vi.stubEnv('ORGANIZER_CHAT_ID', '');
    const db = makeDb();
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id, telegram_user_id, nickname, source, created_at, updated_at, club_stage)
       VALUES (?, '5550009', 'Владелец', 'test', ?, ?, 'CLUB_PLAYER')`,
      [PRIMARY_ORGANIZER_PLAYER_ID, now, now],
    );
    // No explicit organizer-access setup: the recipient fallback must initialize it.

    const { player } = await registerNewPlayer(db, { telegramUserId: '791', nickname: 'Без заявки', source: 'telegram_bot_registration' });
    expect(await db.get<any>('SELECT chat_id FROM telegram_message_outbox WHERE message_key = ?', [`new-player-registered:${player.id}:5550009`]))
      .toMatchObject({ chat_id: '5550009' });

    const applicant = (await registerNewPlayer(db, { telegramUserId: '792', nickname: 'С заявкой' })).player;
    await request(app).post('/api/player/novice/applications').set('Cookie', playerCookie(applicant.id)).send({ entry_route: 'NOVICE' });

    const overview = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie());
    expect(overview.status).toBe(200);
    expect(overview.body.summary.levelDecisionsCount).toBe(2);
    expect(overview.body.actionLists.levelDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'registration', player_id: player.id, nickname: 'Без заявки' }),
      expect.objectContaining({ kind: 'application', player_id: applicant.id, entry_route: 'NOVICE' }),
    ]));
  });

  it('temporarily reserves an evening place for a pending novice application', async () => {
    const db = makeDb();
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at)
       VALUES ('reservation-evening','Тестовая бронь',?,'NOVICE','published',100,?,?)`,
      [new Date(Date.now() + 86400000).toISOString(), now, now],
    );
    await ensureSlotsForEvening(db, 'reservation-evening');
    await db.run('UPDATE evening_slot_settings SET ready_players_per_slot = 1 WHERE evening_id = ?', ['reservation-evening']);

    const first = await registerNewPlayer(db, { telegramUserId: '774', nickname: 'Первый новичок' });
    const second = await registerNewPlayer(db, { telegramUserId: '775', nickname: 'Второй новичок' });

    const applied = await request(app)
      .post('/api/player/novice/applications')
      .set('Cookie', playerCookie(first.player.id))
      .send({ entry_route: 'NOVICE', evening_id: 'reservation-evening' });
    expect(applied.status).toBe(201);
    expect(applied.body.reservation).toMatchObject({ reserved: true, reserved_count: 1, capacity: 1, available_places: 0 });
    expect(applied.body.state.applications[0]).toMatchObject({ status: 'NEW', reservation_status: 'reserved' });

    const blocked = await request(app)
      .post('/api/player/novice/applications')
      .set('Cookie', playerCookie(second.player.id))
      .send({ entry_route: 'NOVICE', evening_id: 'reservation-evening' });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'evening_full' });

    const released = await request(app)
      .patch(`/api/novice/applications/${applied.body.id}`)
      .set('Cookie', organizerCookie())
      .send({ status: 'CANCELLED' });
    expect(released.status).toBe(200);

    const retried = await request(app)
      .post('/api/player/novice/applications')
      .set('Cookie', playerCookie(second.player.id))
      .send({ entry_route: 'NOVICE', evening_id: 'reservation-evening' });
    expect(retried.status).toBe(201);
    expect(retried.body.reservation).toMatchObject({ reserved: true, reserved_count: 1, available_places: 0 });
  });

  it('keeps an experienced visitor separate from a mafia novice', async () => {
    const db = makeDb();
    const app = await createApp(db);
    const registered = await registerNewPlayer(db, { telegramUserId: '772', nickname: 'Опытный гость' });
    const applied = await request(app).post('/api/player/novice/applications').set('Cookie', playerCookie(registered.player.id)).send({ entry_route: 'EXPERIENCED' });
    const confirmed = await request(app).patch(`/api/novice/applications/${applied.body.id}`).set('Cookie', organizerCookie()).send({ status: 'CONFIRMED' });
    expect(confirmed.body.state.player).toMatchObject({ club_stage: 'CLUB_PLAYER', game_level: 'unrated' });
  });

  it('uses two free novice visits and then charges 200 rubles per selected game', async () => {
    const db = makeDb();
    await createApp(db);
    const registered = await registerNewPlayer(db, { telegramUserId: '773', nickname: 'Ученик' });
    const playerId = registered.player.id;
    await db.run("UPDATE players SET club_stage='NOVICE_ACTIVE', game_level='novice' WHERE id=?", [playerId]);
    const now = new Date().toISOString();
    for (let index = 1; index <= 3; index += 1) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES (?,?,?,'NOVICE',?,200,?,?)`, [`nv${index}`, `Новички ${index}`, new Date(Date.now() + index * 86400000).toISOString(), index < 3 ? 'completed' : 'published', now, now]);
      if (index < 3) {
        await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,?,?,'going','going','attended','on_time','waived',0,0,?,?)`, [`ep${index}`, `nv${index}`, playerId, now, now]);
      }
    }
    const plan = await ensureSlotsForEvening(db, 'nv3');
    const selected = plan.slots.slice(0, 2).map((slot: any) => String(slot.id));
    const result = await replacePlayerSlotSelection(db, 'nv3', playerId, selected);
    expect(result.selection).toMatchObject({ games: 2, total: 400 });
    const participant = await db.get<any>('SELECT amount_due, payment_status FROM evening_participants WHERE evening_id=? AND player_id=?', ['nv3', playerId]);
    expect(participant).toMatchObject({ amount_due: 400, payment_status: 'unpaid' });
  });

  it('prices each novice evening by the visits before it, even when attendance is marked on it or it was booked early', async () => {
    const db = makeDb();
    await createApp(db);
    const { player } = await registerNewPlayer(db, { telegramUserId: '774', nickname: 'Ранняя запись' });
    await db.run("UPDATE players SET club_stage='NOVICE_ACTIVE', game_level='novice' WHERE id=?", [player.id]);
    const now = new Date().toISOString();
    for (let index = 1; index <= 3; index += 1) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES (?,?,?,'NOVICE','published',200,?,?)`, [`nb${index}`, `Новички ${index}`, new Date(Date.now() + index * 86400000).toISOString(), now, now]);
    }
    // First visit already happened; evenings 2 and 3 are both booked in advance.
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('eb1','nb1',?,'going','going','attended','on_time','waived',0,0,?,?)`, [player.id, now, now]);
    for (const eveningId of ['nb2', 'nb3']) {
      const plan = await ensureSlotsForEvening(db, eveningId);
      await replacePlayerSlotSelection(db, eveningId, player.id, plan.slots.slice(0, 2).map((slot: any) => String(slot.id)));
    }
    const due = (eveningId: string) => db.get<any>('SELECT amount_due, payment_status FROM evening_participants WHERE evening_id=? AND player_id=?', [eveningId, player.id]);
    expect(await due('nb3')).toMatchObject({ amount_due: 0, payment_status: 'waived' }); // estimate made before visit 2

    // Visit 2 is marked: it stays free, and evening 3 becomes the paid third visit.
    await db.run("UPDATE evening_participants SET attendance_status='attended' WHERE evening_id='nb2' AND player_id=?", [player.id]);
    await reconcileNoviceEveningCharges(db, 'nb2');
    await reconcileNoviceEveningCharges(db, 'nb3');
    expect(await due('nb2')).toMatchObject({ amount_due: 0, payment_status: 'waived' });
    expect(await due('nb3')).toMatchObject({ amount_due: 400, payment_status: 'unpaid' });
  });

  it('gives free novice visits only to real novices; an experienced guest pays from the first game', async () => {
    const db = makeDb();
    await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES ('ng1','Новички',?,'NOVICE','published',200,?,?)`, [new Date(Date.now() + 86400000).toISOString(), now, now]);
    await db.run(`INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('fresh','Новичок','novice',?,?), ('guest','Гость из Казани','club',?,?)`, [now, now, now, now]);
    expect(await novicePriceForPlayer(db, 'fresh', 'ng1')).toBe(0);
    expect(await novicePriceForPlayer(db, 'guest', 'ng1')).toBe(NOVICE_PAID_GAME_PRICE);
    // The «free evenings left» banner follows the same rule as the price.
    await db.run("UPDATE players SET club_stage = 'NOVICE_ACTIVE' WHERE id IN ('fresh', 'guest')");
    expect((await getNovicePlayerState(db, 'fresh'))?.free_visits_remaining).toBe(2);
    expect((await getNovicePlayerState(db, 'guest'))?.free_visits_remaining).toBe(0);
  });

  it('charges a whole-evening «иду» without an exact plan and keeps a prepayment as paid', async () => {
    const db = makeDb();
    await createApp(db);
    const { player } = await registerNewPlayer(db, { telegramUserId: '775', nickname: 'Весь вечер' });
    await db.run("UPDATE players SET club_stage='NOVICE_ACTIVE', game_level='novice' WHERE id=?", [player.id]);
    const now = new Date().toISOString();
    for (let index = 1; index <= 3; index += 1) {
      await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES (?,?,?,'NOVICE',?,200,?,?)`, [`nw${index}`, `Новички ${index}`, new Date(Date.now() + (index - 3) * 86400000).toISOString(), index < 3 ? 'completed' : 'published', now, now]);
    }
    for (const index of [1, 2]) {
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,?,?,'going','going','attended','on_time','waived',0,0,?,?)`, [`ew${index}`, `nw${index}`, player.id, now, now]);
    }
    const plan = await ensureSlotsForEvening(db, 'nw3');
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('ew3','nw3',?,'going','going','pending','unknown','waived',0,0,?,?)`, [player.id, now, now]);
    await reconcileNoviceEveningCharges(db, 'nw3');
    expect(await db.get<any>("SELECT amount_due, payment_status FROM evening_participants WHERE id='ew3'")).toMatchObject({ amount_due: 200 * plan.slots.length, payment_status: 'unpaid' });

    // An earlier visit is corrected away after the player prepaid: the evening is free again, the payment stays paid.
    await db.run("UPDATE evening_participants SET amount_paid = 400 WHERE id='ew3'");
    await db.run("UPDATE evening_participants SET attendance_status='no_show' WHERE id='ew2'");
    await reconcileNoviceEveningCharges(db, 'nw3');
    expect(await db.get<any>("SELECT amount_due, amount_paid, payment_status FROM evening_participants WHERE id='ew3'")).toMatchObject({ amount_due: 0, amount_paid: 400, payment_status: 'paid' });
  });

  it('marks only a newcomer\'s free visit as «вечер новичка» in the payments list', async () => {
    const db = makeDb();
    const app = await createApp(db);
    const { player: novice } = await registerNewPlayer(db, { telegramUserId: '776', nickname: 'Ученица' });
    const { player: host } = await registerNewPlayer(db, { telegramUserId: '777', nickname: 'Ведущий' });
    await db.run("UPDATE players SET game_level='novice', club_stage='NOVICE_ACTIVE' WHERE id=?", [novice.id]);
    await db.run("UPDATE players SET game_level='club', club_role='organizer', club_stage='CLUB_PLAYER' WHERE id=?", [host.id]);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES ('np1','Школа',?,'NOVICE','active',200,?,?)`, [now, now, now]);
    for (const [id, playerId] of [['epn', novice.id], ['eph', host.id]]) {
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,'np1',?,'going','going','attended','on_time','waived',0,0,?,?)`, [id, playerId, now, now]);
    }
    const response = await request(app).get('/api/evenings/np1/payments').set('Cookie', organizerCookie());
    expect(response.status).toBe(200);
    const byId = Object.fromEntries(response.body.participants.map((row: any) => [row.id, row.novice_free]));
    expect(byId).toEqual({ epn: true, eph: false });

    // The evening's assigned organizer is flagged so the list does not read as a pending CASUAL charge.
    await db.run('INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at) VALUES (?,?,?,?)', ['np1', host.id, now, now]);
    const withStaff = await request(app).get('/api/evenings/np1/payments').set('Cookie', organizerCookie());
    expect(Object.fromEntries(withStaff.body.participants.map((row: any) => [row.id, row.staff_exempt]))).toEqual({ epn: false, eph: true });
  });

  it('migrates the established roster to CLUB_PLAYER without changing skill level', async () => {
    const db = makeDb();
    const now = new Date().toISOString();
    await ensureInviteAudienceSchema(db);
    await db.run(`INSERT INTO players (id,nickname,game_level,created_at,updated_at) VALUES ('old','Старый игрок','tournament',?,?)`, [now, now]);
    await createApp(db);
    const player = await db.get<any>('SELECT club_stage, game_level FROM players WHERE id=\'old\'');
    expect(player).toEqual({ club_stage: 'CLUB_PLAYER', game_level: 'tournament' });
  });
});
