import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

describe('terminal tournament nomination equality', () => {
  it('does not require a manual winner and does not block final readiness after standings are resolved', async () => {
    const db = createDatabaseConnection(':memory:');
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = new Date().toISOString();

    const playerIds: string[] = [];
    for (let index = 1; index <= 10; index += 1) {
      const playerId = `terminal-tie-player-${index}`;
      playerIds.push(playerId);
      await db.run(
        `INSERT INTO players (id, nickname, contact_status, lifecycle_status, source, elo, tokens, created_at, updated_at)
         VALUES (?, ?, 'normal', 'normal', 'test', 1000, 0, ?, ?)`,
        [playerId, `Terminal Tie ${index}`, now, now],
      );
    }

    const create = await request(app)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({
        title: 'Terminal tie tournament',
        date: now,
        participants: playerIds.map((player_id) => ({ player_id })),
      });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const tournamentId = create.body.id as string;

    // Replace generated distance with a tiny deterministic completed fixture used
    // only by nominations/final-readiness. Two Sheriffs have identical results and
    // were on the same team, so head-to-head cannot split them.
    await db.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    const participants = await db.all<any>(
      'SELECT id FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number ASC',
      [tournamentId],
    );
    const first = participants[0].id as string;
    const second = participants[1].id as string;
    const gameId = 'terminal-tie-game';

    await db.run(
      `INSERT INTO tournament_games (id, tournament_id, game_number, status, winner_team)
       VALUES (?, ?, 1, 'completed', 'red')`,
      [gameId, tournamentId],
    );
    await db.run(
      `INSERT INTO tournament_game_protocols (id, game_id, status, winner_team, best_move_seats_json, created_at, updated_at)
       VALUES (?, ?, 'completed', 'red', '[]', ?, ?)`,
      ['terminal-tie-protocol', gameId, now, now],
    );

    for (const [index, participantId] of [first, second].entries()) {
      await db.run(
        `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
         VALUES (?, ?, ?, ?, 'sheriff')`,
        [`terminal-tie-seat-${index + 1}`, gameId, participantId, index + 1],
      );
      await db.run(
        `INSERT INTO tournament_game_player_results
          (id, game_id, participant_id, exit_type, regular_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, ci_points)
         VALUES (?, ?, ?, 'alive', 0, 0, 0, 1, 0, 0)`,
        [`terminal-tie-result-${index + 1}`, gameId, participantId],
      );
    }
    await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);

    const nominations = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', cookie);
    expect(nominations.status).toBe(200);
    const sheriff = nominations.body.nominations.find((item: any) => item.category === 'best_sheriff');
    expect(sheriff.winner_participant_id).toBeNull();
    expect(sheriff.decisive_criterion).toBe('exact_tie');
    expect(sheriff.has_tie).toBe(false);

    const manual = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/nominations/best_sheriff`)
      .set('Cookie', cookie)
      .send({ winner_participant_id: first, resolution_method: 'chief_judge_decision' });
    expect(manual.status).toBe(410);

    const readiness = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-readiness`)
      .set('Cookie', cookie);
    expect(readiness.status).toBe(200);
    expect(readiness.body.unresolved_nomination_ties).toEqual([]);
    expect(readiness.body.unresolved_standings_ties).toHaveLength(1);
    expect(readiness.body.ready).toBe(false);

    const standingsTie = readiness.body.unresolved_standings_ties[0];
    const resolveStandings = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/standings/${standingsTie.tie_group_id}`)
      .set('Cookie', cookie)
      .send({
        ordered_participant_ids: standingsTie.participant_ids,
        resolution_method: 'chief_judge_decision',
      });
    expect(resolveStandings.status, JSON.stringify(resolveStandings.body)).toBe(200);

    const finalReadiness = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-readiness`)
      .set('Cookie', cookie);
    expect(finalReadiness.status).toBe(200);
    expect(finalReadiness.body.unresolved_standings_ties).toEqual([]);
    expect(finalReadiness.body.unresolved_nomination_ties).toEqual([]);
    expect(finalReadiness.body.ready).toBe(true);
  });
});