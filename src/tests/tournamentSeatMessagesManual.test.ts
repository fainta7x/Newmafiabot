import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { ensurePersonalNotificationRoutingSchema } from '../db/ensurePersonalNotificationRoutingSchema.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t','Кубок',?,'draft',?,?)`, [new Date(Date.now() + 6 * 3_600_000).toISOString(), stamp, stamp]);
  for (let i = 1; i <= 10; i += 1) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p${i}`, `Игрок ${i}`, stamp, stamp]);
    await db.run('INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?,?,?,?,?)', [`pt${i}`, 't', `p${i}`, `Игрок ${i}`, i]);
  }
  for (const [number, status] of [[1, 'planned'], [2, 'planned']] as const) {
    await db.run('INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES (?,?,?,?)', [`g${number}`, 't', number, status]);
    for (let i = 1; i <= 10; i += 1) await db.run('INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number) VALUES (?,?,?,?)', [`s${number}-${i}`, `g${number}`, `pt${i}`, ((i - 1 + (number - 1) * 3) % 10) + 1]);
  }
  return { db, app, cookie: `organizer_token=${generateOrganizerToken()}` };
}

const messages = async (db: DatabaseWrapper) => { await ensurePersonalNotificationRoutingSchema(db); return db.all<any>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'tournament_game_seat'"); };

describe('organizer sends the seats by hand', () => {
  it('sends the next game to be played now, once, whatever the clock says', async () => {
    const { db, app, cookie } = await setup();
    const first = await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ game_number: 1, players: 10, new_sent: 10, reached: 0, unreachable: 10 });
    expect((await messages(db)).find((row) => row.player_id === 'p1')?.text).toContain('игра №1 из 2 — ты сидишь на месте №1');

    const again = await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    expect(again.body).toMatchObject({ game_number: 1, new_sent: 0 });
    expect(await messages(db)).toHaveLength(10);

    await db.run("UPDATE tournament_games SET status = 'completed' WHERE id = 'g1'");
    const next = await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    expect(next.body).toMatchObject({ game_number: 2, new_sent: 10 });
    expect((await messages(db)).find((row) => row.player_id === 'p1' && row.text.includes('игра №2'))?.text).toContain('месте №4');
  });

  it('reports who can actually be reached, and works while the game is already open', async () => {
    const { db, app, cookie } = await setup();
    // Four players have Telegram, one of them switched personal messages off.
    for (const id of ['p1', 'p2', 'p3', 'p4']) await db.run('UPDATE players SET telegram_user_id = ? WHERE id = ?', [`10${id.slice(1)}`, id]);
    await ensurePersonalNotificationRoutingSchema(db);
    await db.run("INSERT INTO player_notification_preferences (player_id, preferred_channel, personal_enabled, updated_at) VALUES ('p4','auto',0,?)", [new Date().toISOString()]);
    await db.run("UPDATE tournament_games SET status = 'active' WHERE id = 'g1'");

    const sent = await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body).toMatchObject({ game_number: 1, players: 10, new_sent: 10, reached: 3, unreachable: 7 });
    const again = await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    expect(again.body).toMatchObject({ new_sent: 0, reached: 3, unreachable: 7 });
  });

  it('is organizer-only and says so when nothing is left to play or the tournament is unknown', async () => {
    const { db, app, cookie } = await setup();
    expect((await request(app).post('/api/tournaments/t/seat-messages')).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).post('/api/tournaments/nope/seat-messages').set('Cookie', cookie)).status).toBe(404);
    await db.run("UPDATE tournament_games SET status = 'completed'");
    expect((await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie)).status).toBe(409);
  });

  it('tells the players again when two seats were swapped after the first send', async () => {
    const { db, app, cookie } = await setup();
    await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    await db.run("UPDATE tournament_game_seats SET seat_number = 99 WHERE id = 's1-1'");
    await db.run("UPDATE tournament_game_seats SET seat_number = 1 WHERE id = 's1-2'");
    await db.run("UPDATE tournament_game_seats SET seat_number = 2 WHERE id = 's1-1'");
    const again = await request(app).post('/api/tournaments/t/seat-messages').set('Cookie', cookie);
    expect(again.body).toMatchObject({ game_number: 1, new_sent: 2 });
  });
});
