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
});
