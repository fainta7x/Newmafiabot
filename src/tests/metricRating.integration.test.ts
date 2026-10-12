import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const stamp = '2026-09-08T10:00:00.000Z';

describe('rankings by one figure of the statistics', () => {
  let db: DatabaseWrapper;
  let app: any;
  const cookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;
  const get = async (query: string, as = 'p1') => (await request(app).get(`/api/rating/metrics${query}`).set('Cookie', cookie(as))).body;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,game_level,elo,tokens,created_at,updated_at,profile_visibility_json) VALUES
      ('p1','Анна','1','normal','normal','club',1000,0,?,?,'{}'),
      ('p2','Борис','2','normal','normal','club',1000,0,?,?,'{"game_statistics":false}'),
      ('p3','Вера','3','normal','normal','club',1000,0,?,?,'{}')`, [stamp, stamp, stamp, stamp, stamp, stamp]);
    const period = (id: string, title: string, from: string, to: string) => db.run(
      `INSERT INTO rating_periods (id,title,type,starts_at,ends_at,status,auto_include,created_at,updated_at) VALUES (?,?,'RATING',?,?,'completed',1,?,?)`, [id, title, from, to, from, from]);
    await period('spring', 'Весна 2026', '2026-03-01T00:00:00.000Z', '2026-05-31T23:59:59.000Z');
    await period('autumn', 'Осень 2026', '2026-09-01T00:00:00.000Z', '2026-11-30T23:59:59.000Z');
    const addGame = async (n: number, format: string, date: string, winner: 'red' | 'black', seats: Array<[string, string]>, extra: Record<string, unknown> = {}) => {
      await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES (?,?,?,'completed',?,?,?)`, [`ev${n}`, `Вечер ${n}`, date, format, date, date]);
      const payload = {
        kind: 'club_evening_protocol',
        player_results: seats.map(([playerId, role], i) => ({ role, seat_number: i + 1, player_id: playerId, participant_id: `${playerId}-${n}`, display_name: playerId })),
        protocol: { status: 'completed', winner_team: winner, completed_at: date, events: [], ...extra },
      };
      await db.run(`INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (?,?,?,?,?,?,?,'[]',?)`,
        [n, `ev${n}`, n, date, winner, winner, JSON.stringify(payload), date]);
    };
    // May (spring, RATING): red wins; p1 first killed.  Sept (autumn, RATING): red wins; p3 best move.  Sept (autumn, CASUAL): black wins.
    await addGame(1, 'RATING', '2026-05-12T18:00:00.000Z', 'red', [['p1', 'citizen'], ['p2', 'mafia'], ['p3', 'sheriff']], { first_killed_participant_id: 'p1-1' });
    await addGame(2, 'RATING', '2026-09-10T18:00:00.000Z', 'red', [['p1', 'citizen'], ['p2', 'mafia'], ['p3', 'sheriff']], { best_moves: [{ participant_id: 'p3-2', source: 'first_killed' }] });
    await addGame(3, 'CASUAL', '2026-09-17T18:00:00.000Z', 'black', [['p1', 'citizen'], ['p2', 'mafia']]);
  });

  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('requires a signed-in club user', async () => {
    expect((await request(app).get('/api/rating/metrics')).status).toBe(401);
  });

  it('ranks by wins, shares a place on equal values and hides players who hid their statistics', async () => {
    const body = await get('?metric=wins');
    expect(body.metric).toMatchObject({ key: 'wins', unit: 'count' });
    // p2 hid the statistics: not listed for others; p1 and p3 both have 2 wins (the higher win rate is listed first).
    expect(body.rows.map((row: any) => [row.nickname, row.value, row.rank])).toEqual([['Вера', 2, 1], ['Анна', 2, 1]]);
    expect(body.rows.find((row: any) => row.is_me).nickname).toBe('Анна');
    const own = await get('?metric=wins', 'p2');
    expect(own.rows.map((row: any) => row.nickname)).toContain('Борис');
  });

  it('counts over the chosen season and evening format, and ignores unknown values', async () => {
    const autumn = await get('?metric=wins&period=period:autumn');
    expect(autumn.filters.period_label).toBe('Осень 2026');
    expect(autumn.games_in_scope).toBe(2);
    expect(autumn.rows.map((row: any) => [row.nickname, row.value])).toEqual([['Вера', 1], ['Анна', 1]]);
    const casual = await get('?metric=wins&format=CASUAL');
    expect(casual.filters.format_label).toBe('Клубный');
    expect(casual.rows.map((row: any) => [row.nickname, row.value])).toEqual([['Анна', 0]]);
    expect((await get('?metric=nope&period=nope&format=nope')).metric.key).toBe('wins');
  });

  it('ranks streaks, roles and the highlights of a game', async () => {
    expect((await get('?metric=best_streak')).rows[0]).toMatchObject({ nickname: 'Вера', value: 2 });
    expect((await get('?metric=sheriff_wins')).rows[0]).toMatchObject({ nickname: 'Вера', value: 2 });
    expect((await get('?metric=first_killed')).rows[0]).toMatchObject({ nickname: 'Анна', value: 1 });
    expect((await get('?metric=best_moves')).rows[0]).toMatchObject({ nickname: 'Вера', value: 1 });
  });

  it('keeps percentage rankings behind a minimum number of games', async () => {
    const rate = await get('?metric=win_rate');
    expect(rate.metric.min_games).toBe(5);
    expect(rate.rows).toEqual([]);
  });

  it('uses only the Elo gain or loss over the chosen games, never the rating itself', async () => {
    // Elo needs a full protocol: ten players (seven red, three black) in a version-1 protocol.
    const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
    const ids = roles.map((_, i) => `e${i + 1}`);
    for (const id of ids) {
      await db.run(`INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,game_level,elo,tokens,created_at,updated_at,profile_visibility_json) VALUES (?,?,?,'normal','normal','club',1000,0,?,?,'{}')`, [id, `Игрок ${id}`, id, stamp, stamp]);
    }
    const date = '2026-09-24T18:00:00.000Z';
    await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES ('evE','Полный','${date}','completed','RATING','${date}','${date}')`);
    const payload = {
      version: 1, kind: 'club_evening_protocol',
      player_results: roles.map((role, i) => ({ role, seat_number: i + 1, player_id: ids[i], participant_id: `${ids[i]}-x`, display_name: ids[i] })),
      protocol: { status: 'completed', winner_team: 'red', completed_at: date, events: [] },
    };
    await db.run(`INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (99,'evE',99,?,'red','Red',?,'[]',?)`, [date, JSON.stringify(payload), date]);

    const gain = await get('?metric=elo_gain&period=period:autumn');
    expect(gain.metric).toMatchObject({ key: 'elo_gain', unit: 'elo' });
    const values = gain.rows.map((row: any) => row.value);
    expect(values.length).toBe(10);
    expect([...values].sort((a: number, b: number) => b - a)).toEqual(values);
    // Winners (red) gained, losers (black) lost; the text carries the sign.
    expect(gain.rows[0].value_text).toMatch(/^\+/);
    expect(gain.rows.at(-1).value_text).toMatch(/^−/);
    expect(gain.rows.at(-1).value).toBeLessThan(0);
    // The ranking is the change, not the rating (everybody started from 1000): the numbers are small.
    expect(gain.rows.every((row: any) => Math.abs(row.value) < 100)).toBe(true);
    // Outside that game's season there is no Elo change for these players.
    expect((await get('?metric=elo_gain&period=period:spring')).rows.some((row: any) => row.nickname.startsWith('Игрок e'))).toBe(false);
  });
});
