import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const stamp = '2026-09-08T10:00:00.000Z';

describe('premium player profile API', () => {
  let db: DatabaseWrapper;
  let app: any;
  let p1Cookie: string;
  let p2Cookie: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (
      id,nickname,full_name,telegram_user_id,telegram_username,phone,contact_status,lifecycle_status,game_level,club_role,elo,tokens,created_at,updated_at,profile_visibility_json
    ) VALUES
      ('p1','Очень длинный ник игрока для мобильного профиля','Private Name','111','private_tg','+7 999 000-00-01','normal','normal','club','captain',1100,0,?,?,'{}'),
      ('p2','Viewer',NULL,'222','viewer',NULL,'normal','normal','club','member',1000,0,?,?,'{}')`, [stamp, stamp, stamp, stamp]);
    p1Cookie = `player_token=${generatePlayerSessionToken('p1')}`;
    p2Cookie = `player_token=${generatePlayerSessionToken('p2')}`;
  });

  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('requires a linked player session and exposes private identity only to the owner', async () => {
    expect((await request(app).get('/api/player/profiles/p1/summary')).status).toBe(401);

    const own = await request(app).get('/api/player/profiles/p1/summary').set('Cookie', p1Cookie);
    expect(own.status).toBe(200);
    expect(own.body.viewer.is_self).toBe(true);
    expect(own.body.player.full_name).toBe('Private Name');
    expect(own.body.player.telegram_username).toBe('private_tg');

    const other = await request(app).get('/api/player/profiles/p1/summary').set('Cookie', p2Cookie);
    expect(other.status).toBe(200);
    expect(other.body.viewer.is_self).toBe(false);
    expect(other.body.player.full_name).toBeNull();
    expect(other.body.player.telegram_username).toBeNull();
    expect(other.body.player.phone).toBeNull();
  });

  it('respects explicit public identity visibility without leaking phone by default', async () => {
    await db.run(`UPDATE players SET profile_visibility_json=? WHERE id='p1'`, [JSON.stringify({ real_name: true, telegram_username: true })]);
    const response = await request(app).get('/api/player/profiles/p1/summary').set('Cookie', p2Cookie);
    expect(response.status).toBe(200);
    expect(response.body.player.full_name).toBe('Private Name');
    expect(response.body.player.telegram_username).toBe('private_tg');
    expect(response.body.player.phone).toBeNull();
  });

  it('returns intentional empty game, role and Elo states for a new player', async () => {
    const games = await request(app).get('/api/player/profiles/p1/games?limit=5').set('Cookie', p1Cookie);
    expect(games.status).toBe(200);
    expect(games.body).toMatchObject({ total: 0, limit: 5, next_offset: null });
    expect(games.body.games).toEqual([]);

    const roles = await request(app).get('/api/player/profiles/p1/roles').set('Cookie', p1Cookie);
    expect(roles.status).toBe(200);
    expect(roles.body.overall.games).toBe(0);
    expect(roles.body.roles).toHaveLength(4);
    expect(roles.body.fingerprint.versatility.roles_used).toBe(0);

    const elo = await request(app).get('/api/player/profiles/p1/elo?range=month').set('Cookie', p1Cookie);
    expect(elo.status).toBe(200);
    expect(elo.body.points).toEqual([]);
    expect(elo.body.current_elo).toBe(1100);
    expect(elo.body.legacy_missing_snapshots).toBe(true);
  });

  it('counts the statistics block over one chosen season and evening format', async () => {
    const period = (id: string, title: string, from: string, to: string) => db.run(
      `INSERT INTO rating_periods (id,title,type,starts_at,ends_at,status,auto_include,created_at,updated_at) VALUES (?,?,'RATING',?,?,'completed',1,?,?)`,
      [id, title, from, to, from, from]);
    await period('spring', 'Весна 2026', '2026-03-01T00:00:00.000Z', '2026-05-31T23:59:59.000Z');
    await period('autumn', 'Осень 2026', '2026-09-01T00:00:00.000Z', '2026-11-30T23:59:59.000Z');
    const addGame = async (n: number, format: string, date: string, role: string) => {
      await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES (?,?,?,'completed',?,?,?)`, [`ev${n}`, `Вечер ${n}`, date, format, date, date]);
      const payload = { kind: 'club_evening_protocol', player_results: [{ role, seat_number: 1, player_id: 'p1', participant_id: `s${n}` }],
        protocol: { status: 'completed', winner_team: 'red', completed_at: date, events: [] } };
      await db.run(`INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (?,?,?,?,'red','Red',?,'[]',?)`,
        [n, `ev${n}`, n, date, JSON.stringify(payload), date]);
    };
    await addGame(1, 'RATING', '2026-09-10T18:00:00.000Z', 'citizen'); // autumn, win
    await addGame(2, 'CASUAL', '2026-09-17T18:00:00.000Z', 'mafia');   // autumn, loss
    await addGame(3, 'RATING', '2026-05-12T18:00:00.000Z', 'citizen'); // spring, win
    const get = async (query = '') => (await request(app).get(`/api/player/profiles/p1/summary${query}`).set('Cookie', p1Cookie)).body;

    const all = await get();
    expect(all.stats).toMatchObject({ games: 3, wins: 2 });
    expect(all.filters).toMatchObject({ period: 'all', format: 'all', period_label: 'Всё время', format_label: 'Все форматы' });
    expect(all.filters.seasons.map((item: any) => [item.label, item.games])).toEqual([['Осень 2026', 2], ['Весна 2026', 1]]);
    expect(all.filters.formats.map((item: any) => [item.key, item.games])).toEqual([['CASUAL', 1], ['RATING', 2]]);

    const autumn = await get('?period=period:autumn');
    expect(autumn.stats).toMatchObject({ games: 2, wins: 1, current_streak: 0, best_streak: 1 });
    expect(autumn.filters.period_label).toBe('Осень 2026');
    expect(autumn.filters.formats.map((item: any) => [item.key, item.games])).toEqual([['CASUAL', 1], ['RATING', 1]]);

    const rating = await get('?format=RATING');
    expect(rating.stats).toMatchObject({ games: 2, wins: 2 });
    expect(rating.filters.format_label).toBe('Рейтинговый');

    const both = await get('?period=period:autumn&format=CASUAL');
    expect(both.stats).toMatchObject({ games: 1, wins: 0, red: { games: 0 }, black: { games: 1 } });
    expect(both.recent_games).toHaveLength(1);

    // Unknown values fall back to the whole history instead of failing.
    expect((await get('?period=nope&format=nope')).stats.games).toBe(3);
  });
});
