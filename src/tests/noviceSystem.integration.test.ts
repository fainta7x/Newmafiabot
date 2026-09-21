import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

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
