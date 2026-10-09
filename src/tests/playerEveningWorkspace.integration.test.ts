import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';

const stamp = '2026-10-09T15:00:00.000Z';

describe('player evening workspace permissions and multi-table data', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  const cookie = (id: string) => ({ Cookie: `player_token=${generatePlayerSessionToken(id)}` });

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    for (const [id, nickname, level] of [
      ['viewer', 'Viewer', 'club'],
      ['other', 'Other', 'club'],
      ['visitor', 'Visitor', 'club'],
      ['novice', 'Novice', 'novice'],
    ]) {
      await db.run(
        `INSERT INTO players (id, nickname, game_level, club_stage, created_at, updated_at)
         VALUES (?, ?, ?, 'CLUB_PLAYER', ?, ?)`,
        [id, nickname, level, stamp, stamp],
      );
    }
    await db.run(
      `INSERT INTO game_evenings
         (id, title, starts_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
       VALUES ('eve', 'Friday', ?, 'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'active', 20, 100, ?, ?)`,
      [stamp, stamp, stamp],
    );
    for (const [id, name] of [['a', 'Стол А'], ['b', 'Стол Б']]) {
      await db.run(
        `INSERT INTO evening_tables
          (id, evening_id, name, format, capacity, created_at, updated_at)
         VALUES (?, 'eve', ?, 'CASUAL', 10, ?, ?)`,
        [id, name, stamp, stamp],
      );
    }
    for (const [id, person, tableId] of [['part-viewer', 'viewer', 'a'], ['part-other', 'other', 'b']]) {
      await db.run(
        `INSERT INTO evening_participants
          (id, evening_id, player_id, table_id, response_status, registration_status, attendance_status, created_at, updated_at)
         VALUES (?, 'eve', ?, ?, 'going', 'confirmed', 'attended', ?, ?)`,
        [id, person, tableId, stamp, stamp],
      );
    }

    const draft = (personId: string, nickname: string) => JSON.stringify({
      kind: 'club_evening_protocol',
      protocol: { status: 'draft', winner_team: 'black', sheriff_checks: [{ secret: 'DON_NOT_EXPOSE' }] },
      player_results: [{
        seat_number: 4, player_id: personId, participant_id: `part-${personId}`,
        display_name: nickname, role: 'don', judge_bonus: 0.3, private_notes: 'HIDDEN',
      }],
    });
    for (const [id, tableId, text] of [[1, 'a', draft('viewer', 'Viewer')], [2, 'b', draft('other', 'Other')]] as const) {
      await db.run(
        `INSERT INTO games
          (id, evening_id, evening_table_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at)
         VALUES (?, 'eve', ?, ?, ?, 'red', 'Красные', ?, '[]', ?)`,
        [id, tableId, id, stamp, text, stamp],
      );
    }
  });

  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('returns read-only tables, roster and two draft games without hidden data', async () => {
    const response = await request(app).get('/api/player/evenings/eve/overview').set(cookie('viewer'));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.tables).toHaveLength(2);
    expect(response.body.roster).toHaveLength(2);
    expect(response.body.games).toHaveLength(2);
    expect(response.body.games.map((game: any) => game.self_seat)).toEqual([4, null]);
    expect(response.body.games.every((game: any) => game.game_key === null)).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/DON_NOT_EXPOSE|HIDDEN|sheriff_checks|"role":"don"|judge_bonus/);
    expect(response.body.score).toMatchObject({ red: 0, black: 0, completed: 0, running: 2 });
  });

  it('requires a valid player session and eligible evening format', async () => {
    const anonymous = await request(app).get('/api/player/evenings/eve/overview');
    expect(anonymous.status).toBe(401);
    const restricted = await request(app).get('/api/player/evenings/eve/overview').set(cookie('novice'));
    expect(restricted.status).toBe(403);
    const absent = await request(app).get('/api/player/evenings/nonexistent/overview').set(cookie('viewer'));
    expect(absent.status).toBe(404);
  });

  it('makes completed protocols linkable but keeps archived/unfinished parts private', async () => {
    const result = await db.get<any>('SELECT protocol_text FROM games WHERE id = 1');
    const payload = JSON.parse(result.protocol_text);
    payload.protocol.status = 'completed';
    payload.protocol.winner_team = 'red';
    await db.run('UPDATE games SET protocol_text = ? WHERE id = 1', [JSON.stringify(payload)]);

    const response = await request(app).get('/api/player/evenings/eve/overview').set(cookie('viewer'));
    expect(response.status).toBe(200);
    expect(response.body.games[0]).toMatchObject({ game_key: 'club:1', status: 'completed', winner_team: 'red' });
    expect(response.body.games[1]).toMatchObject({ game_key: null, status: 'draft', winner_team: null });
    expect(response.body.score).toMatchObject({ red: 1, black: 0, completed: 1, running: 1 });
  });

  it('does not expose completed evenings to unrelated players', async () => {
    await db.run("UPDATE game_evenings SET status='completed', settled_at=? WHERE id='eve'", [stamp]);
    const unrelated = await request(app).get('/api/player/evenings/eve/overview').set(cookie('visitor'));
    expect(unrelated.status).toBe(403);
    const mine = await request(app).get('/api/player/evenings/eve/overview').set(cookie('viewer'));
    expect(mine.status).toBe(200);
    expect(mine.body.evening.status).toBe('completed');
  });
});
