import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';
import { ensureSlotsForEvening, replacePlayerSlotSelection } from '../server/services/eveningSlotPlanningService.ts';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';

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
