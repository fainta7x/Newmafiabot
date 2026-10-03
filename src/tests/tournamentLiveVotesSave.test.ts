import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { mapEngineResult } from '../components/player/TournamentLiveGameModal.tsx';

let app: any;
let db: DatabaseWrapper;
let cookie: string;
let tournamentId: string;
let gameId: string;

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);
  cookie = `organizer_token=${generateOrganizerToken()}`;
  const participants: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const pid = `live-save-player-${i}`;
    await db.run(
      `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at) VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
      [pid, `Player_${i}`, `+7900000001${i}`, new Date().toISOString(), new Date().toISOString()],
    );
    participants.push({ player_id: pid, display_name: `Игрок ${i}` });
  }
  const created = await request(app).post('/api/tournaments').set('Cookie', cookie).send({ title: 'Сохранение игры из движка', date: new Date().toISOString(), participants });
  tournamentId = created.body.id;
  const seating = await request(app).post(`/api/tournaments/${tournamentId}/generate-seating`).set('Cookie', cookie);
  gameId = seating.body.games[0].id;
  await request(app).post(`/api/tournaments/${tournamentId}/start`).set('Cookie', cookie);
  const roles = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'].map((role, index) => ({ seat_number: index + 1, role }));
  await request(app).patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`).set('Cookie', cookie).send({ roles });
  await request(app).post(`/api/tournaments/${tournamentId}/games/${gameId}/start`).set('Cookie', cookie);
});

describe('saving a finished live tournament game with votes from several days', () => {
  it('accepts the voting rounds the engine recorded (its round numbers restart every day)', async () => {
    const loaded = await request(app).get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie);
    expect(loaded.status).toBe(200);
    const engineVotes: any[] = [
      { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [3, 4], vote_counts: { 3: 5, 4: 5 }, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [], parent_round_number: null },
      { round_number: 2, day_number: 1, is_revote: true, nominated_seats: [3, 4], vote_counts: { 3: 7, 4: 3 }, eligible_voters: 10, outcome: 'single_eliminated', eliminated_seats: [3], parent_round_number: 1 },
      { round_number: 1, day_number: 2, is_revote: false, nominated_seats: [5], vote_counts: { 5: 9 }, eligible_voters: 9, outcome: 'single_eliminated', eliminated_seats: [5], parent_round_number: null },
    ];
    const next = mapEngineResult(loaded.body.protocol, loaded.body.player_results, { winning_team: 'Красные', slots: [], votes: engineVotes, shots: [] });
    const saved = await request(app).put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`).set('Cookie', cookie).send(next);
    expect(saved.body.error).toBeUndefined();
    expect(saved.status).toBe(200);
    expect((saved.body.protocol.votes as any[]).map((round) => round.round_number)).toEqual([1, 2, 3]);
  });
});
