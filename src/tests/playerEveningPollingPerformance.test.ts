import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

describe('player cabinet polling stays lightweight without recent game results', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  const cookie = (playerId: string) => ({ Cookie: `player_token=${generatePlayerSessionToken(playerId)}` });

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    const now = new Date().toISOString();
    for (const [id, level] of [['regular','club'], ['novice','novice']]) {
      await db.run(
        `INSERT INTO players (id, nickname, game_level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, id, level, now, now],
      );
    }
  });
  afterEach(() => { vi.restoreAllMocks(); db.sqlite.close(); });

  it('does not read historical games or Elo when no evening has ended recently', async () => {
    const dbAll = vi.spyOn(db, 'all');
    const response = await request(app).get('/api/player/evening-journey').set(cookie('regular'));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.journey.phase).toBe('idle');
    expect(dbAll.mock.calls.some(([sql]) => /(?:FROM games g|FROM tournament_games|FROM tournament_game_seats)/i.test(String(sql)))).toBe(false);
  });

  it('live status checks eligible active evenings without reading game protocols', async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, created_at, updated_at)
       VALUES ('active-1','Клубный вечер', ?, 'Europe/Moscow','CASUAL','active',?,?)`,
      [now, now, now],
    );
    const dbAll = vi.spyOn(db, 'all');
    const regular = await request(app).get('/api/player/evening-live-status').set(cookie('regular'));
    const novice = await request(app).get('/api/player/evening-live-status').set(cookie('novice'));
    const anonymous = await request(app).get('/api/player/evening-live-status');
    expect(regular.status).toBe(200);
    expect(regular.body).toEqual({ live: true });
    expect(novice.status).toBe(200);
    expect(novice.body).toEqual({ live: false });
    expect(anonymous.status).toBe(401);
    expect(dbAll.mock.calls.some(([sql]) => /(?:FROM games g|FROM tournament_games|protocol_text)/i.test(String(sql)))).toBe(false);
  });

  it('still shows the recap for a recently completed evening the player attended', async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, settled_at, created_at, updated_at)
       VALUES ('finished','Итоги', ?, 'Europe/Moscow','CASUAL','completed',?,?,?)`,
      [now, now, now, now],
    );
    await db.run(
      `INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,created_at,updated_at)
       VALUES ('attendance','finished','regular','attended',?,?)`,
      [now, now],
    );
    const response = await request(app).get('/api/player/evening-journey').set(cookie('regular'));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.journey.phase).toBe('recap');
    expect(response.body.journey.recap.id).toBe('finished');
  });
});
