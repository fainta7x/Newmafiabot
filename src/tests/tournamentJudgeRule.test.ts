import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

// Owner, 2026-11-03: the tournament's judge conducts every game of a one-table tournament; with two tables a judge is
// bound to a table (today: the judge set on the game). One rule, owned by the «Игра» layer.
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const setup = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO players (id,nickname,club_role,judge_level,host_formats,created_at,updated_at) VALUES
    ('chief','Судья турнира','member','judge','RATING',?,?), ('table2','Судья второго стола','member','judge','RATING',?,?)`, [now, now, now, now]);
  await db.run(`INSERT INTO tournaments (id,title,date,status,judge_player_id,created_at,updated_at) VALUES ('t1','Турнир',?,'active','chief',?,?)`, [now, now, now]);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status,judge_player_id) VALUES ('g1','t1',1,'planned',NULL),('g2','t1',2,'planned','table2')`);
  return { app };
};

describe('judge of a tournament game', () => {
  it('the tournament judge sees and may open the games without their own judge; a table judge keeps theirs', async () => {
    const { app } = await setup();
    const chief = `player_token=${generatePlayerSessionToken('chief')}`;
    const list = await request(app).get('/api/player/judging').set('Cookie', chief);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.tournament_games.map((g: any) => g.id)).toEqual(['g1']);
    const table2 = `player_token=${generatePlayerSessionToken('table2')}`;
    expect((await request(app).get('/api/player/judging').set('Cookie', table2)).body.tournament_games.map((g: any) => g.id)).toEqual(['g2']);
    expect((await request(app).get('/api/tournaments/t1/games/g1/protocol').set('Cookie', chief)).status).not.toBe(401);
    expect((await request(app).get('/api/tournaments/t1/games/g2/protocol').set('Cookie', chief)).status).toBe(401);
  });
});
