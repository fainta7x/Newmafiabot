import { afterEach, beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

let db: DatabaseWrapper;
let app: Awaited<ReturnType<typeof createApp>>;
beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);
  const now = '2026-10-07T18:00:00Z';
  for (const id of ['a', 'b', 'c', 'd', 'viewer']) {
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at,profile_visibility_json) VALUES (?,?,'normal','normal',1000,0,?,?,?)`, [id, id, now, now, JSON.stringify({ connections: id !== 'b' && id !== 'd' })]);
  }
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,default_price,created_at,updated_at) VALUES ('e','Вечер',?,'Europe/Moscow','STANDARD','active',0,?,?)`, [now, now, now]);
  const results = ['a','b','c','d'].map((id, i) => ({ player_id: id, display_name: id, role: ['citizen','sheriff','mafia','don'][i], seat_number: i + 1 }));
  const protocol = JSON.stringify({ kind: 'club_evening_protocol', protocol: { status: 'completed', winner_team: 'red' }, player_results: results });
  await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('e',1,?,'red','Красные',?,'[]',?)`, [now, protocol, now]);
});
afterEach(() => { db.sqlite.close(); });
const cookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;
it('enforces current connection privacy at the authenticated relationships endpoint', async () => {
  expect((await request(app).get('/api/player/relationships')).status).toBe(401);
  const viewer = await request(app).get('/api/player/relationships').set('Cookie', cookie('a'));
  expect(viewer.status).toBe(200);
  expect(viewer.body.club_first_games).toEqual({ red: [], black: [] });
  expect(viewer.body.teammates).toEqual([]);
  expect(viewer.body.rivals.map((p: { player_id: string }) => p.player_id)).toEqual(['c']);
  expect(viewer.body.recent_event.teammates).toEqual([]);
  const own = await request(app).get('/api/player/relationships').set('Cookie', cookie('b'));
  expect(own.status).toBe(200);
  expect(own.body.club_first_games.red[0]).toMatchObject({ a_id: 'a', b_id: 'b', games: 1 });
  const outsider = await request(app).get('/api/player/relationships').set('Cookie', cookie('viewer'));
  expect(outsider.body.club_first_games.red).toEqual([]);
  await db.run(`UPDATE players SET profile_visibility_json='{}' WHERE id='b'`);
  const publicAgain = await request(app).get('/api/player/relationships').set('Cookie', cookie('viewer'));
  expect(publicAgain.body.club_first_games.red[0]).toMatchObject({ a_id: 'a', b_id: 'b' });
  expect(publicAgain.body.recent_event).toBeNull();
});
