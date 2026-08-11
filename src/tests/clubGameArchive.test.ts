import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('club evening game archive', () => {
  let app: any;
  let db: DatabaseWrapper;
  let cookie: string;
  const eveningId = 'archive-evening';

  beforeAll(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, default_price, created_at, updated_at)
       VALUES (?, ?, ?, 'Europe/Moscow', 'STANDARD', 'active', 0, ?, ?)`,
      [eveningId, 'Архивный вечер', now, now, now],
    );
    const protocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { game_id: '1', status: 'completed', winner_team: 'red' },
      player_results: [],
    };
    await db.run(
      `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at)
       VALUES (?, 101, ?, 'Красные', 'Победа Красные', ?, '[]', ?)`,
      [eveningId, now, JSON.stringify(protocol), now],
    );
  });

  it('archives, hides, restores and permanently deletes a completed club game', async () => {
    const initial = await request(app).get(`/api/games?evening_id=${eveningId}`);
    expect(initial.status).toBe(200);
    expect(initial.body).toHaveLength(1);
    const gameId = initial.body[0].id;

    const archive = await request(app).post(`/api/games/${gameId}/archive`).set('Cookie', cookie);
    expect(archive.status, JSON.stringify(archive.body)).toBe(200);
    expect(archive.body.archived_at).toBeTruthy();
    expect(archive.body.status).toBe('completed');

    const activeList = await request(app).get(`/api/games?evening_id=${eveningId}`);
    expect(activeList.body).toHaveLength(0);
    const archivedList = await request(app).get(`/api/games?evening_id=${eveningId}&archived=1`);
    expect(archivedList.body).toHaveLength(1);

    const editWhileArchived = await request(app)
      .put(`/api/games/${gameId}/evening-protocol`)
      .set('Cookie', cookie)
      .send({ protocol: { status: 'draft' }, player_results: Array(10).fill({}) });
    expect(editWhileArchived.status).toBe(409);

    const restore = await request(app).post(`/api/games/${gameId}/archive/restore`).set('Cookie', cookie);
    expect(restore.status, JSON.stringify(restore.body)).toBe(200);
    expect(restore.body.archived_at).toBeNull();
    expect((await request(app).get(`/api/games?evening_id=${eveningId}`)).body).toHaveLength(1);

    const archiveAgain = await request(app).post(`/api/games/${gameId}/archive`).set('Cookie', cookie);
    expect(archiveAgain.status, JSON.stringify(archiveAgain.body)).toBe(200);
    const permanent = await request(app).delete(`/api/games/${gameId}/archive`).set('Cookie', cookie);
    expect(permanent.status, JSON.stringify(permanent.body)).toBe(200);
    expect(permanent.body.success).toBe(true);
    expect((await request(app).get(`/api/games?evening_id=${eveningId}&archived=1`)).body).toHaveLength(0);
  });
});
