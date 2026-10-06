import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

// Owner rule 2026-10-06: nominations count the judge's extra points plus protocol points;
// best move (ЛХ), disciplinary minuses, ПУ and CI never count.
describe('tournament nomination points', () => {
  it('adds protocol points to the judge points and ignores penalties and CI', async () => {
    const db = createDatabaseConnection(':memory:');
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = new Date().toISOString();
    const playerIds: string[] = [];
    for (let index = 1; index <= 10; index += 1) {
      playerIds.push(`nom-${index}`);
      await db.run(`INSERT INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, created_at, updated_at)
        VALUES (?, ?, 'normal', 'normal', 'test', 1000, 0, ?, ?)`, [`nom-${index}`, `Игрок ${index}`, now, now]);
    }
    const create = await request(app).post('/api/tournaments').set('Cookie', cookie)
      .send({ title: 'Номинации', date: now, participants: playerIds.map((player_id) => ({ player_id })) });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const tournamentId = create.body.id as string;
    await db.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    const participants = await db.all<any>('SELECT id FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC', [tournamentId]);
    const [judgeOnly, judgeAndProtocol] = [participants[0].id as string, participants[1].id as string];

    await db.run(`INSERT INTO tournament_games (id, tournament_id, game_number, status, winner_team) VALUES ('g1', ?, 1, 'completed', 'red')`, [tournamentId]);
    await db.run(`INSERT INTO tournament_game_protocols (id, game_id, status, winner_team, best_move_seats_json, created_at, updated_at)
      VALUES ('p1', 'g1', 'completed', 'red', '[]', ?, ?)`, [now, now]);
    // judge, protocol, penalty, CI per citizen
    const rows: Array<[string, number, number, number, number]> = [[judgeOnly, 0.5, 0, 0, 0.4], [judgeAndProtocol, 0.3, 0.4, -1, 0]];
    for (const [index, [participantId, judge, protocol, penalty, ci]] of rows.entries()) {
      await db.run(`INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role) VALUES (?, 'g1', ?, ?, 'citizen')`, [`s${index}`, participantId, index + 1]);
      await db.run(`INSERT INTO tournament_game_player_results (id, game_id, participant_id, exit_type, regular_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, ci_points)
        VALUES (?, 'g1', ?, 'alive', 0, 0, ?, ?, ?, ?)`, [`r${index}`, participantId, judge, protocol, penalty, ci]);
    }

    const response = await request(app).get(`/api/tournaments/${tournamentId}/nominations`).set('Cookie', cookie);
    expect(response.status).toBe(200);
    const citizen = response.body.nominations.find((item: any) => item.category === 'best_citizen');
    expect(citizen.winner_participant_id).toBe(judgeAndProtocol);
    expect(citizen.candidates.map((item: any) => [item.participant_id, item.points])).toEqual([[judgeAndProtocol, 0.7], [judgeOnly, 0.5]]);
    expect(citizen.candidates[0]).toMatchObject({ judge_bonus: 0.3, protocol_bonus: 0.4, nomination_points: 0.7 });
  });
});
