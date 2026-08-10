import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { resolveJudgeAssignment } from '../server/services/judgeAssignmentService.ts';

let db: DatabaseWrapper;
let app: Awaited<ReturnType<typeof createApp>>;
const auth = () => ({ Authorization: `Bearer ${generateOrganizerToken()}` });
const now = () => new Date().toISOString();

const addPlayer = async (id: string, nickname: string) => {
  const stamp = now();
  await db.run(
    `INSERT INTO players (id, nickname, contact_status, lifecycle_status, elo, tokens, created_at, updated_at)
     VALUES (?, ?, 'normal', 'normal', 1000, 0, ?, ?)`,
    [id, nickname, stamp, stamp],
  );
};

const seedEvening = async () => {
  const stamp = now();
  await db.run(
    `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
     VALUES ('ev-judge', 'Judge test', ?, 'Europe/Moscow', 'STANDARD', 'active', 20, 0, ?, ?)`,
    [stamp, stamp, stamp],
  );
  for (let index = 1; index <= 10; index += 1) {
    const playerId = `p-${index}`;
    await addPlayer(playerId, `Player ${index}`);
    await db.run(
      `INSERT INTO evening_participants
       (id, evening_id, player_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, created_at, updated_at)
       VALUES (?, 'ev-judge', ?, 'confirmed', 'attended', 'on_time', 'waived', 0, 0, ?, ?)`,
      [`ep-${index}`, playerId, stamp, stamp],
    );
  }
  return Array.from({ length: 10 }, (_, index) => ({ participant_id: `ep-${index + 1}`, seat_number: index + 1 }));
};

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);
});

afterEach(() => db.sqlite.close());

describe('stable judge identity', () => {
  it('never infers a player from matching free text', async () => {
    await addPlayer('judge-1', 'Fandorin');
    const resolved = await resolveJudgeAssignment(db, { judge_name: 'Fandorin', judge_player_id: null });
    expect(resolved).toEqual({ judge_player_id: null, judge_name: 'Fandorin' });
  });

  it('rejects an unknown club judge id before creating a game', async () => {
    const seats = await seedEvening();
    const response = await request(app).post('/api/games/evening/ev-judge').set(auth()).send({ judge_player_id: 'missing', judge_name: 'Player 1', seats });
    expect(response.status).toBe(400);
    expect((await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM games'))?.count).toBe(0);
  });

  it('keeps external club judge unlinked and awards no judge achievement', async () => {
    const seats = await seedEvening();
    const created = await request(app).post('/api/games/evening/ev-judge').set(auth()).send({ judge_player_id: null, judge_name: 'External Judge', seats });
    expect(created.status).toBe(201);
    expect(created.body.judge_player_id).toBeNull();
    expect(created.body.judge_name).toBe('External Judge');
    const protocol = { ...created.body.club_protocol.protocol, status: 'completed', winner_team: 'red' };
    const completed = await request(app).put(`/api/games/${created.body.id}/evening-protocol`).set(auth()).send({ protocol, player_results: created.body.club_protocol.player_results });
    expect(completed.status).toBe(200);
    const count = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM player_achievements WHERE achievement_id = 'first_judge'");
    expect(count?.count).toBe(0);
  });

  it('stores explicit club UUID + nickname snapshot and awards first_judge once', async () => {
    const seats = await seedEvening();
    await addPlayer('judge-club', 'Judge Club');
    const created = await request(app).post('/api/games/evening/ev-judge').set(auth()).send({ judge_player_id: 'judge-club', judge_name: 'Wrong text', seats });
    expect(created.status).toBe(201);
    expect(created.body.judge_player_id).toBe('judge-club');
    expect(created.body.judge_name).toBe('Judge Club');
    const protocol = { ...created.body.club_protocol.protocol, status: 'completed', winner_team: 'red' };
    await request(app).put(`/api/games/${created.body.id}/evening-protocol`).set(auth()).send({ protocol, player_results: created.body.club_protocol.player_results }).expect(200);
    await request(app).put(`/api/games/${created.body.id}/evening-protocol`).set(auth()).send({ protocol, player_results: created.body.club_protocol.player_results }).expect(200);
    const count = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM player_achievements WHERE player_id = 'judge-club' AND achievement_id = 'first_judge'");
    expect(count?.count).toBe(1);
  });

  it('supports explicit tournament judge correction on a completed game and stays idempotent', async () => {
    await addPlayer('judge-tournament', 'Judge Tournament');
    const stamp = now();
    await db.run(
      `INSERT INTO tournaments (id, title, date, status, created_at, updated_at)
       VALUES ('tour-judge', 'Judge tournament', ?, 'correction', ?, ?)`,
      [stamp, stamp, stamp],
    );
    await db.run(
      `INSERT INTO tournament_games (id, tournament_id, game_number, judge_name, status, winner_team, completed_at)
       VALUES ('tg-judge', 'tour-judge', 1, 'Legacy name', 'completed', 'red', ?)`,
      [stamp],
    );
    await db.run(
      `INSERT INTO tournament_game_protocols (id, game_id, status, winner_team, created_at, updated_at, completed_at)
       VALUES ('tgp-judge', 'tg-judge', 'completed', 'red', ?, ?, ?)`,
      [stamp, stamp, stamp],
    );

    const first = await request(app).patch('/api/tournaments/tour-judge/games/tg-judge/judge').set(auth()).send({ judge_player_id: 'judge-tournament', judge_name: 'Wrong text' });
    expect(first.status).toBe(200);
    expect(first.body.judge_player_id).toBe('judge-tournament');
    expect(first.body.judge_name).toBe('Judge Tournament');
    await request(app).patch('/api/tournaments/tour-judge/games/tg-judge/judge').set(auth()).send({ judge_player_id: 'judge-tournament' }).expect(200);
    const count = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM player_achievements WHERE player_id = 'judge-tournament' AND achievement_id = 'first_judge'");
    expect(count?.count).toBe(1);
  });

  it('rejects unknown tournament judge id without changing the completed game', async () => {
    const stamp = now();
    await db.run(`INSERT INTO tournaments (id, title, date, status, created_at, updated_at) VALUES ('tour-unknown', 'Unknown', ?, 'correction', ?, ?)`, [stamp, stamp, stamp]);
    await db.run(`INSERT INTO tournament_games (id, tournament_id, game_number, judge_name, status) VALUES ('tg-unknown', 'tour-unknown', 1, 'Old Judge', 'completed')`);
    const response = await request(app).patch('/api/tournaments/tour-unknown/games/tg-unknown/judge').set(auth()).send({ judge_player_id: 'missing', judge_name: 'New text' });
    expect(response.status).toBe(400);
    const row = await db.get<any>("SELECT judge_name, judge_player_id FROM tournament_games WHERE id = 'tg-unknown'");
    expect(row).toEqual({ judge_name: 'Old Judge', judge_player_id: null });
  });
});
