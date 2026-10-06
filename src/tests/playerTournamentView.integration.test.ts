import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) { try { opened.pop()?.sqlite.close(); } catch { /* closed */ } } });
const NOW = '2026-10-03T12:00:00.000Z';
const playerCookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;
const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;

const seed = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  for (const [id, nickname] of [['p1', 'Аня'], ['p2', 'Боря'], ['p3', 'Вика'], ['viewer', 'Зритель']]) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, nickname, NOW, NOW]);
  }
  await db.run(`INSERT INTO tournaments (id,title,date,venue,status,game_count,created_at,updated_at,tournament_evening_flow,player_capacity)
    VALUES ('live','Идущий турнир','2026-10-03T16:00:00Z','Бар','active',2,?,?,1,10),
           ('done','Прошлый турнир','2026-08-01T16:00:00Z',NULL,'completed',1,?,?,1,10),
           ('open','Будущий турнир','2026-11-01T16:00:00Z',NULL,'draft',10,?,?,1,10),
           ('hidden','Черновик','2026-11-08T16:00:00Z',NULL,'draft',10,?,?,1,10)`, [NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW]);
  await db.run("UPDATE tournaments SET published_at=? WHERE id='open'", [NOW]);
  for (const [n, id] of [[1, 'p1'], [2, 'p2'], [3, 'p3']] as const) {
    await db.run('INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?,?,?,?,?)', [`tp${n}`, 'live', id, id, n]);
  }
  await db.run("INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,registered_at,updated_at) VALUES ('r1','open','viewer','confirmed',1,?,?)", [NOW, NOW]);
  await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status,winner_team,judge_name) VALUES ('g1','live',1,'completed','red','Судья'),('g2','live',2,'active',NULL,'Судья')");
  await db.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES
    ('s1','g1','tp1',1,'mafia'),('s2','g1','tp2',2,'citizen'),('s3','g1','tp3',3,'sheriff'),
    ('s4','g2','tp1',1,'don'),('s5','g2','tp2',2,'citizen')`);
  return { db, app };
};

describe('player tournament view (owner, 2026-10-06)', () => {
  it('lists tournaments for any player: live first, upcoming, then finished; unpublished drafts stay hidden', async () => {
    const { app } = await seed();
    const response = await request(app).get('/api/player/tournaments').set('Cookie', playerCookie('viewer'));
    expect(response.status).toBe(200);
    expect(response.body.tournaments.map((item: any) => [item.id, item.phase])).toEqual([['live', 'live'], ['open', 'registration'], ['done', 'finished']]);
    expect(response.body.tournaments.find((item: any) => item.id === 'open').my_registration).toBe('confirmed');
    expect((await request(app).get('/api/player/tournaments')).status).toBe(401);
  });

  it('shows roster and games to a player who does not play; roles only of finished games', async () => {
    const { app } = await seed();
    const response = await request(app).get('/api/player/tournaments/live').set('Cookie', playerCookie('viewer'));
    expect(response.status).toBe(200);
    expect(response.body.registration.participated).toBe(false);
    expect(response.body.roster.map((item: any) => item.nickname)).toEqual(['Аня', 'Боря', 'Вика']);
    const [finished, running] = response.body.games;
    expect(finished).toMatchObject({ game_number: 1, status: 'completed', winner_team: 'red' });
    expect(finished.seats.map((seat: any) => seat.role)).toEqual(['mafia', 'citizen', 'sheriff']);
    expect(running.status).toBe('active');
    expect(running.seats.map((seat: any) => seat.role)).toEqual([null, null]);
    expect(response.body.provisional).toBe(true);
  });

  it('shows the live table and nominations, and hides them while the organizer has closed the table', async () => {
    const { app } = await seed();
    const open = (await request(app).get('/api/player/tournaments/live').set('Cookie', playerCookie('viewer'))).body;
    expect(open.table_hidden).toBe(false);
    expect(Array.isArray(open.standings)).toBe(true);
    expect(Array.isArray(open.nominations)).toBe(true);

    expect((await request(app).post('/api/tournaments/live/standings-hidden').set('Cookie', playerCookie('viewer')).send({ hidden: true })).status).toBe(401);
    const closed = await request(app).post('/api/tournaments/live/standings-hidden').set('Cookie', organizerCookie()).send({ hidden: true });
    expect(closed.body).toEqual({ hidden: true });
    const hidden = (await request(app).get('/api/player/tournaments/live').set('Cookie', playerCookie('viewer'))).body;
    expect(hidden).toMatchObject({ table_hidden: true, standings: null, nominations: null });
    expect(hidden.roster).toHaveLength(3);
    expect(hidden.games).toHaveLength(2);

    await request(app).post('/api/tournaments/live/standings-hidden').set('Cookie', organizerCookie()).send({ hidden: false });
    expect((await request(app).get('/api/player/tournaments/live').set('Cookie', playerCookie('viewer'))).body.table_hidden).toBe(false);
  });

  it('shows registration to a player and keeps a never-published draft private', async () => {
    const { app } = await seed();
    const open = (await request(app).get('/api/player/tournaments/open').set('Cookie', playerCookie('viewer'))).body;
    expect(open.tournament.phase).toBe('registration');
    expect(open.registration).toMatchObject({ open: true, confirmed_count: 1, mine: { status: 'confirmed', slot: 1 } });
    expect(open.standings).toBeNull();
    expect((await request(app).get('/api/player/tournaments/hidden').set('Cookie', playerCookie('viewer'))).status).toBe(404);
    expect((await request(app).get('/api/player/tournaments/missing').set('Cookie', playerCookie('viewer'))).status).toBe(404);
  });
});
