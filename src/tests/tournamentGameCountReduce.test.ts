import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

let app: any;
let db: DatabaseWrapper;
let cookie: string;
let tournamentId: string;

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);
  cookie = `organizer_token=${generateOrganizerToken()}`;
  const participants: any[] = [];
  for (let i = 1; i <= 10; i += 1) {
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at) VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`, [`gc-${i}`, `P${i}`, `+7900111000${i}`, now, now]);
    participants.push({ player_id: `gc-${i}`, display_name: `Игрок ${i}` });
  }
  const res = await request(app).post('/api/tournaments').set('Cookie', cookie).send({ title: 'T', date: new Date().toISOString(), participants });
  expect(res.status).toBe(201);
  tournamentId = res.body.id;
});

const setCount = (count: number) => request(app).patch(`/api/tournaments/${tournamentId}/game-count`).set('Cookie', cookie).send({ game_count: count });

describe('shortening a created tournament', () => {
  it('drops the last planned game and updates game_count', async () => {
    const res = await setCount(9);
    expect(res.status).toBe(200);
    expect(res.body.removed_games).toEqual([10]);
    expect(res.body.games).toHaveLength(9);
    expect((await db.get<any>('SELECT game_count FROM tournaments WHERE id = ?', [tournamentId]))?.game_count).toBe(9);
    const seats = await db.get<any>('SELECT COUNT(*) AS c FROM tournament_game_seats WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)', [tournamentId]);
    expect(Number(seats?.c)).toBe(90);
  });

  it('refuses to increase, to drop a played game, or without organizer rights', async () => {
    expect((await setCount(11)).status).toBe(400);
    await db.run("UPDATE tournament_games SET status = 'completed' WHERE tournament_id = ? AND game_number = 10", [tournamentId]);
    const blocked = await setCount(9);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain('№10');
    expect((await request(app).patch(`/api/tournaments/${tournamentId}/game-count`).send({ game_count: 9 })).status).toBeGreaterThanOrEqual(401);
  });

  it('lets an active tournament finish after the shorter distance is played', async () => {
    await setCount(9);
    const games = await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    expect(games).toHaveLength(9);
    const state = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
    expect(state.status).toBe(200);
    expect(state.body.games).toHaveLength(9);
  });

  it('returns a game started by mistake to planned, then lets the distance be shortened', async () => {
    await db.run("UPDATE tournaments SET status = 'active' WHERE id = ?", [tournamentId]);
    const last = await db.get<any>('SELECT id FROM tournament_games WHERE tournament_id = ? AND game_number = 10', [tournamentId]);
    await db.run("UPDATE tournament_games SET status = 'active', started_at = ? WHERE id = ?", [new Date().toISOString(), last.id]);
    expect((await setCount(9)).status).toBe(400);

    const reset = await request(app).post(`/api/tournaments/${tournamentId}/games/${last.id}/reset-to-planned`).set('Cookie', cookie);
    expect(reset.status).toBe(200);
    expect(reset.body.game.status).toBe('planned');
    expect((await setCount(9)).status).toBe(200);
  });

  it('does not reset a game whose protocol is completed', async () => {
    await db.run("UPDATE tournaments SET status = 'active' WHERE id = ?", [tournamentId]);
    const first = await db.get<any>('SELECT id FROM tournament_games WHERE tournament_id = ? AND game_number = 1', [tournamentId]);
    await db.run("UPDATE tournament_games SET status = 'active' WHERE id = ?", [first.id]);
    await db.run("INSERT INTO tournament_game_protocols (id, game_id, status, created_at, updated_at) VALUES ('pr1', ?, 'completed', ?, ?)", [first.id, new Date().toISOString(), new Date().toISOString()]);
    const res = await request(app).post(`/api/tournaments/${tournamentId}/games/${first.id}/reset-to-planned`).set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('lets the judge of a running game be replaced', async () => {
    await db.run("UPDATE tournaments SET status = 'active' WHERE id = ?", [tournamentId]);
    const first = await db.get<any>('SELECT id FROM tournament_games WHERE tournament_id = ? AND game_number = 1', [tournamentId]);
    await db.run("UPDATE tournament_games SET status = 'active' WHERE id = ?", [first.id]);
    const res = await request(app).patch(`/api/tournaments/${tournamentId}/games/${first.id}/judge`).set('Cookie', cookie).send({ judge_name: 'Новый судья' });
    expect(res.status).toBe(200);
  });

  it('corrects a participant after a played game without failing the rating rebuild', async () => {
    await db.run("UPDATE tournaments SET status = 'active' WHERE id = ?", [tournamentId]);
    await db.run("UPDATE tournament_games SET status = 'completed' WHERE tournament_id = ? AND game_number = 1", [tournamentId]);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at) VALUES ('gc-new', 'Новичок', '+79001119999', 'NEW_LEAD', ?, ?)`, [now, now]);
    const participant = await db.get<any>('SELECT id FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number LIMIT 1', [tournamentId]);
    const res = await request(app).patch(`/api/tournaments/${tournamentId}/participants/${participant.id}/correct-player`).set('Cookie', cookie).send({ player_id: 'gc-new' });
    expect(res.status).toBe(200);
    expect((await db.get<any>('SELECT player_id FROM tournament_participants WHERE id = ?', [participant.id]))?.player_id).toBe('gc-new');
  });

  it('cancels a tournament nobody played and refuses once a game was started', async () => {
    const cancelled = await request(app).post(`/api/tournaments/${tournamentId}/cancel`).set('Cookie', cookie);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ success: true, status: 'cancelled', audience: 10 });
    expect((await db.get<any>('SELECT status FROM tournaments WHERE id = ?', [tournamentId]))?.status).toBe('cancelled');
    expect((await request(app).post(`/api/tournaments/${tournamentId}/cancel`).set('Cookie', cookie)).status).toBe(400);
  });

  it('does not cancel a tournament with a started game', async () => {
    await db.run("UPDATE tournaments SET status = 'active' WHERE id = ?", [tournamentId]);
    await db.run("UPDATE tournament_games SET status = 'active' WHERE tournament_id = ? AND game_number = 1", [tournamentId]);
    expect((await request(app).post(`/api/tournaments/${tournamentId}/cancel`).set('Cookie', cookie)).status).toBe(400);
  });
});
