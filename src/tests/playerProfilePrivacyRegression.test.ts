import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const privateVisibility = JSON.stringify({
  real_name: false,
  birthday_day_month: false,
  birth_year: false,
  telegram_username: false,
  phone: false,
  game_statistics: false,
  connections: false,
});

const publicVisibility = JSON.stringify({
  real_name: true,
  birthday_day_month: true,
  birth_year: true,
  telegram_username: false,
  phone: false,
  game_statistics: true,
  connections: true,
});

describe('player profile privacy regression', () => {
  let db: DatabaseWrapper;
  let app: any;
  let cookie: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO players (
        id,nickname,full_name,phone,telegram_username,game_level,contact_status,lifecycle_status,judge_level,
        elo,tokens,birth_day,birth_month,birth_year,birthday_visibility,profile_visibility_json,created_at,updated_at
      ) VALUES ('privacy-player','Приватный','Скрытое Имя','+79990000000','hidden_user','club','normal','normal','none',1420,100,8,9,1995,'full',?,?,?)
    `,[privateVisibility,now,now]);
    cookie = `player_token=${generatePlayerSessionToken('privacy-player')}`;
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('does not expose private identity, birthday or game rating through unauthenticated public profile', async () => {
    const response = await request(app).get('/api/public/players/privacy-player/profile');
    expect(response.status).toBe(200);
    expect(response.body.player).toMatchObject({
      id: 'privacy-player',
      nickname: 'Приватный',
      full_name: null,
      elo: null,
      birthday: null,
    });
    expect(response.body.player.phone).toBeUndefined();
    expect(response.body.player.telegram_username).toBeUndefined();
  });

  it('exposes only fields explicitly enabled by the canonical visibility mask', async () => {
    await db.run('UPDATE players SET profile_visibility_json=? WHERE id=?',[publicVisibility,'privacy-player']);
    const response = await request(app).get('/api/public/players/privacy-player/profile');
    expect(response.status).toBe(200);
    expect(response.body.player.full_name).toBe('Скрытое Имя');
    expect(response.body.player.elo).toBe(1420);
    expect(response.body.player.birthday).toEqual({ day: 8, month: 9, year: 1995 });
    expect(response.body.player.phone).toBeUndefined();
    expect(response.body.player.telegram_username).toBeUndefined();
  });

  it('keeps legacy birthday_visibility synchronized with canonical settings', async () => {
    const response = await request(app)
      .patch('/api/player/privacy-settings')
      .set('Cookie', cookie)
      .send({ visibility: { birthday_day_month: true, birth_year: false } });
    expect(response.status).toBe(200);
    const row = await db.get<any>('SELECT birthday_visibility,profile_visibility_json FROM players WHERE id=?',['privacy-player']);
    expect(row.birthday_visibility).toBe('day_month');
    expect(JSON.parse(row.profile_visibility_json).birth_year).toBe(false);
  });

  it('does not leak Elo/rank from another player summary when game statistics are private', async () => {
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,game_level,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at) VALUES ('viewer','Зритель','club','normal','normal','none',1000,100,?,?)`,[now,now]);
    const viewerCookie = `player_token=${generatePlayerSessionToken('viewer')}`;
    const response = await request(app)
      .get('/api/player/profiles/privacy-player/summary')
      .set('Cookie', viewerCookie);
    expect(response.status).toBe(200);
    expect(response.body.player.elo).toBeNull();
    expect(response.body.player.rating_position).toBeNull();
    expect(response.body.player.rating_movement_30d).toBeNull();
    expect(response.body.stats).toBeNull();
  });
});
