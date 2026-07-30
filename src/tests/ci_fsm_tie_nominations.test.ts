import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  calculateCiThreshold,
  calculateCiRate,
  calculateGameCi
} from '../server/utils/ciHelper.ts';

// Helper to simulate a completed game with results
async function addMockCompletedGame(
  db: DatabaseWrapper,
  tournamentId: string,
  gameNumber: number,
  winnerTeam: 'red' | 'black',
  playerStats: Array<{
    playerId: string;
    role: 'citizen' | 'sheriff' | 'mafia' | 'don';
    isWinner: boolean;
    judgeBonus?: number;
    protocolBonus?: number;
    penalty?: number;
    ciPoints?: number;
    isFirstKilled?: boolean;
    isLhBestMove?: boolean;
  }>
) {
  const gameId = `mock_g_${gameNumber}_${Math.random().toString(36).substr(2, 9)}`;
  
  await db.run(
    `INSERT INTO tournament_games (id, tournament_id, game_number, status, winner_team)
     VALUES (?, ?, ?, 'completed', ?)`,
    [gameId, tournamentId, gameNumber, winnerTeam]
  );

  await db.run(
    `INSERT INTO tournament_game_protocols (id, game_id, status, winner_team, best_move_seats_json, created_at, updated_at)
     VALUES (?, ?, 'completed', ?, '[]', ?, ?)`,
    [`gp_${gameId}`, gameId, winnerTeam, new Date().toISOString(), new Date().toISOString()]
  );

  for (let i = 0; i < playerStats.length; i++) {
    const ps = playerStats[i];
    const seatId = `seat_${gameId}_${ps.playerId}`;
    await db.run(
      `INSERT INTO tournament_game_seats (id, game_id, participant_id, seat_number, role)
       VALUES (?, ?, ?, ?, ?)`,
      [seatId, gameId, ps.playerId, i + 1, ps.role]
    );

    const jb = ps.judgeBonus || 0;
    const pb = ps.protocolBonus || 0;
    const pen = ps.penalty || 0;
    const ci = ps.ciPoints || 0;

    const resId = `res_${gameId}_${ps.playerId}`;
    await db.run(
      `INSERT INTO tournament_game_player_results (id, game_id, participant_id, exit_type, regular_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, ci_points)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      [resId, gameId, ps.playerId, ps.isFirstKilled ? 'killed' : 'alive', jb, pb, pen, ci]
    );
  }

  let firstKilledId: string | null = null;
  let bestMoveId: string | null = null;
  for (const ps of playerStats) {
    if (ps.isFirstKilled) firstKilledId = ps.playerId;
    if (ps.isLhBestMove) bestMoveId = ps.playerId;
  }
  if (firstKilledId || bestMoveId) {
    await db.run(
      `UPDATE tournament_game_protocols
       SET first_killed_participant_id = ?, best_move_participant_id = ?
       WHERE game_id = ?`,
      [firstKilledId, bestMoveId, gameId]
    );
  }
}

describe('Theme 1: FSM 2022 Ci расчет', () => {
  it('1. calculateCiThreshold for distance 10 should return 4', () => {
    expect(calculateCiThreshold(10)).toBe(4);
  });

  it('2. calculateCiThreshold for distance 5 should return 2', () => {
    expect(calculateCiThreshold(5)).toBe(2);
  });

  it('3. calculateCiThreshold for distance 0 should return 0', () => {
    expect(calculateCiThreshold(0)).toBe(0);
  });

  it('4. calculateCiThreshold for distance 12 should return 5', () => {
    expect(calculateCiThreshold(12)).toBe(5);
  });

  it('5. calculateCiRate with 0 first-kills should return 0', () => {
    expect(calculateCiRate(0, 4)).toBe(0);
  });

  it('6. calculateCiRate with varying first-kills and threshold 4', () => {
    expect(calculateCiRate(1, 4)).toBe(0.1);
    expect(calculateCiRate(2, 4)).toBe(0.2);
    expect(calculateCiRate(3, 4)).toBe(0.3);
    expect(calculateCiRate(4, 4)).toBe(0.4);
    expect(calculateCiRate(5, 4)).toBe(0.4);
    expect(calculateCiRate(10, 4)).toBe(0.4);
  });

  it('7. calculateCiRate with 0 threshold should return 0', () => {
    expect(calculateCiRate(1, 0)).toBe(0);
  });

  it('8. calculateGameCi for win should return 0', () => {
    expect(calculateGameCi({
      isFirstKilled: true,
      role: 'citizen',
      winnerTeam: 'red',
      bestMoveParticipantId: null,
      participantId: 'p1',
      hasBlackInBestMove: false,
      playerRate: 0.5
    }).gameCi).toBe(0);
  });

  it('9. calculateGameCi for mafia loss should return 0', () => {
    expect(calculateGameCi({
      isFirstKilled: true,
      role: 'mafia',
      winnerTeam: 'red',
      bestMoveParticipantId: null,
      participantId: 'p1',
      hasBlackInBestMove: false,
      playerRate: 0.5
    }).gameCi).toBe(0);
  });

  it('10. calculateGameCi for red citizen loss first killed without best move points should return full rate', () => {
    expect(calculateGameCi({
      isFirstKilled: true,
      role: 'citizen',
      winnerTeam: 'black',
      bestMoveParticipantId: null,
      participantId: 'p1',
      hasBlackInBestMove: false,
      playerRate: 0.5
    }).gameCi).toBe(0.5);
  });
});

describe('Theme 2: Готовность к завершению турнира', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let tournamentId: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    for (let i = 1; i <= 10; i++) {
      const pid = `player-uuid-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
    }

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тестовый турнир',
        date: new Date().toISOString(),
        participants: Array.from({ length: 10 }, (_, i) => ({
          player_id: `player-uuid-${i + 1}`,
          display_name: `Игрок ${i + 1}`,
        })),
      });
    tournamentId = res.body.id;
  });

  it('11. Tournament with unplayed games should not be ready to complete', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie);

    expect(res.body.complete_readiness.isReady).toBe(false);
    expect(res.body.complete_readiness.errors.some((e: string) => e.includes('не сыграно'))).toBe(true);
  });

  it('12. Tournament with no participants should show start readiness errors and not be ready to complete', async () => {
    const freshRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Пустой турнир',
        date: new Date().toISOString(),
        participants: [],
      });
    const freshId = freshRes.body.id;

    const res = await request(app)
      .get(`/api/tournaments/${freshId}`)
      .set('Cookie', organizerCookie);

    expect(res.body.complete_readiness.isReady).toBe(false);
  });

  it('13. Tournament with no generated games is not ready to complete', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie);

    expect(res.body.complete_readiness.isReady).toBe(false);
    expect(res.body.complete_readiness.errors).toContain('В турнире ещё нет запланированных игр');
  });

  it('14. Complete readiness returns errors list detailing active games', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie);

    expect(res.body.complete_readiness.errors.length).toBeGreaterThan(0);
  });

  it('15. Game night 1 target_seat mismatch with first_killed role citizen triggers first-killed validation error on saving protocol', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    const gamesRes = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', organizerCookie);
    const game = gamesRes.body.games[0];

    const roles = [
      { seat_number: 1, role: 'citizen' },
      { seat_number: 2, role: 'citizen' },
      { seat_number: 3, role: 'citizen' },
      { seat_number: 4, role: 'citizen' },
      { seat_number: 5, role: 'citizen' },
      { seat_number: 6, role: 'citizen' },
      { seat_number: 7, role: 'sheriff' },
      { seat_number: 8, role: 'mafia' },
      { seat_number: 9, role: 'mafia' },
      { seat_number: 10, role: 'don' },
    ];
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game.id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game.id}/start`)
      .set('Cookie', organizerCookie);

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [game.id]);
    const player_results = seats.map((s) => ({
      participant_id: s.participant_id,
      exit_type: s.seat_number === 4 ? 'killed' : 'alive',
    }));

    const saveRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game.id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: null,
          shots: [{ night_number: 1, target_seat: 4, result: 'killed' }],
        },
        player_results,
      });

    expect(saveRes.status).toBe(400);
    expect(saveRes.body.error).toContain('первоубиенный не выбран');
  });

  it('16. Valid first_killed citizen matching night 1 target passes validation', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    const gamesRes = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', organizerCookie);
    const game = gamesRes.body.games[0];

    const roles = [
      { seat_number: 1, role: 'citizen' },
      { seat_number: 2, role: 'citizen' },
      { seat_number: 3, role: 'citizen' },
      { seat_number: 4, role: 'citizen' },
      { seat_number: 5, role: 'citizen' },
      { seat_number: 6, role: 'citizen' },
      { seat_number: 7, role: 'sheriff' },
      { seat_number: 8, role: 'mafia' },
      { seat_number: 9, role: 'mafia' },
      { seat_number: 10, role: 'don' },
    ];
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game.id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game.id}/start`)
      .set('Cookie', organizerCookie);

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [game.id]);
    const player_results = seats.map((s) => ({
      participant_id: s.participant_id,
      exit_type: s.seat_number === 3 ? 'killed' : 'alive',
    }));

    const saveRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game.id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: seats[2].participant_id,
          shots: [{ night_number: 1, target_seat: 3, result: 'killed' }],
        },
        player_results,
      });

    expect(saveRes.status).toBe(200);
  });

  it('17. First killed mafia role triggers validation error', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    const gamesRes = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', organizerCookie);
    const game = gamesRes.body.games[0];

    const roles = [
      { seat_number: 1, role: 'citizen' },
      { seat_number: 2, role: 'citizen' },
      { seat_number: 3, role: 'citizen' },
      { seat_number: 4, role: 'citizen' },
      { seat_number: 5, role: 'citizen' },
      { seat_number: 6, role: 'citizen' },
      { seat_number: 7, role: 'sheriff' },
      { seat_number: 8, role: 'mafia' },
      { seat_number: 9, role: 'mafia' },
      { seat_number: 10, role: 'don' },
    ];
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game.id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game.id}/start`)
      .set('Cookie', organizerCookie);

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [game.id]);
    const player_results = seats.map((s) => ({
      participant_id: s.participant_id,
      exit_type: s.seat_number === 8 ? 'killed' : 'alive',
    }));

    const saveRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game.id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: seats[7].participant_id,
          shots: [{ night_number: 1, target_seat: 8, result: 'killed' }],
        },
        player_results,
      });

    expect(saveRes.status).toBe(400);
    expect(saveRes.body.error).toContain('мирный житель или Шериф');
  });

  it('18. complete protocol endpoint blocks with same first-killed validation', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);

    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    const gamesRes = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', organizerCookie);
    const game = gamesRes.body.games[0];

    const roles = [
      { seat_number: 1, role: 'citizen' },
      { seat_number: 2, role: 'citizen' },
      { seat_number: 3, role: 'citizen' },
      { seat_number: 4, role: 'citizen' },
      { seat_number: 5, role: 'citizen' },
      { seat_number: 6, role: 'citizen' },
      { seat_number: 7, role: 'sheriff' },
      { seat_number: 8, role: 'mafia' },
      { seat_number: 9, role: 'mafia' },
      { seat_number: 10, role: 'don' },
    ];
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game.id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game.id}/start`)
      .set('Cookie', organizerCookie);

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [game.id]);
    const player_results = seats.map((s) => ({
      participant_id: s.participant_id,
      exit_type: s.seat_number === 8 ? 'killed' : 'alive',
    }));

    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game.id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: seats[7].participant_id,
          shots: [{ night_number: 1, target_seat: 8, result: 'killed' }],
        },
        player_results,
      });

    expect(completeRes.status).toBe(400);
  });

  it('19. active/draft games count toward complete_readiness errors', async () => {
    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie);

    expect(res.body.complete_readiness.isReady).toBe(false);
  });

  it('20. clean tournament status completed blocks any modification', async () => {
    await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);
    const res = await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    expect(res.status).toBe(400);
  });
});

describe('Theme 3: Официальные финальные тай-брейки', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let tournamentId: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    for (let i = 1; i <= 10; i++) {
      const pid = `player-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
    }

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Тай-брейки',
        date: new Date().toISOString(),
        participants: Array.from({ length: 10 }, (_, i) => ({
          player_id: `player-${i + 1}`,
          display_name: `Игрок ${i + 1}`,
        })),
      });
    tournamentId = res.body.id;

    // Repopulate tournament_participants with clean predictable IDs
    await db.run("DELETE FROM tournament_participants WHERE tournament_id = ?", [tournamentId]);
    await db.run(`INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number) VALUES 
      ('tp1', ?, 'player-1', 'Player 1', 1),
      ('tp2', ?, 'player-2', 'Player 2', 2),
      ('tp3', ?, 'player-3', 'Player 3', 3),
      ('tp4', ?, 'player-4', 'Player 4', 4)`,
      [tournamentId, tournamentId, tournamentId, tournamentId]
    );
  });

  it('21. Standings sort descending by total_points', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
      { playerId: 'tp3', role: 'mafia', isWinner: false },
    ]);
    await addMockCompletedGame(db, tournamentId, 2, 'red', [
      { playerId: 'tp1', role: 'mafia', isWinner: false },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
      { playerId: 'tp3', role: 'mafia', isWinner: false },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].participant_id).toBe('tp2');
    expect(res.body.standings[1].participant_id).toBe('tp1');
    expect(res.body.standings[2].participant_id).toBe('tp3');
  });

  it('22. Standings tie-break: higher additional_total wins', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    // tp1: total = 1.0 (win) + 0.1 (pb) + 0.4 (ci) = 1.5, add_total = 0.1
    // tp2: total = 1.0 (win) + 0.5 (pb) = 1.5, add_total = 0.5
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true, protocolBonus: 0.1, ciPoints: 0.4 },
      { playerId: 'tp2', role: 'citizen', isWinner: true, protocolBonus: 0.5 },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].participant_id).toBe('tp2');
  });

  it('23. Standings tie-break: higher wins count wins', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    // tp1: 2 wins. total = 2.0
    // tp2: 1 win, but judge bonus in losing game = 1.0. total = 2.0, wins = 1
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);
    await addMockCompletedGame(db, tournamentId, 2, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'mafia', isWinner: false, judgeBonus: 1.0 },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].participant_id).toBe('tp2');
  });

  it('24. Standings tie-break: higher don_wins + sheriff_wins wins', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    // both have 2 wins. tp2 won one as don.
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);
    await addMockCompletedGame(db, tournamentId, 2, 'black', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'don', isWinner: true },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].participant_id).toBe('tp2');
  });

  it('25. Standings tie-break: higher first_killed_count wins', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    // tp2 has 1 first killed count
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true, isFirstKilled: true },
    ]);
    await addMockCompletedGame(db, tournamentId, 2, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].participant_id).toBe('tp2');
  });

  it('26. Standings tie-break: lower participant_number wins as final tie-break stable sort', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].participant_id).toBe('tp1');
  });

  it('27. tie_requires_draw is false if all positions uniquely resolved', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'mafia', isWinner: false },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.tie_requires_draw).toBe(false);
  });

  it('28. tie_requires_draw is true if two participants have identical tie-break stats', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.tie_requires_draw).toBe(true);
  });

  it('29. tie_requires_draw clears to false if tie is broken', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'mafia', isWinner: false },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.tie_requires_draw).toBe(false);
  });

  it('30. Equal tie-break players share the same place (place number)', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    expect(res.body.standings[0].place).toBe(1);
    expect(res.body.standings[1].place).toBe(1);
  });
});

describe('Theme 4: Расчёт номинаций', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let tournamentId: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    for (let i = 1; i <= 10; i++) {
      const pid = `player-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
    }
    for (const pid of ['p1', 'p2', 'p3']) {
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, pid, `+790000000099`, new Date().toISOString(), new Date().toISOString()]
      );
    }

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Номинации',
        date: new Date().toISOString(),
        participants: Array.from({ length: 10 }, (_, i) => ({
          player_id: `player-${i + 1}`,
          display_name: `Игрок ${i + 1}`,
        })),
      });
    tournamentId = res.body.id;

    await db.run("DELETE FROM tournament_participants WHERE tournament_id = ?", [tournamentId]);
    await db.run(`INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number) VALUES 
      ('tp1', ?, 'player-1', 'Player 1', 1),
      ('tp2', ?, 'player-2', 'Player 2', 2),
      ('tp3', ?, 'player-3', 'Player 3', 3)`,
      [tournamentId, tournamentId, tournamentId]
    );
  });

  it('31. MVP category ranks participants by total_points', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);

    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true, judgeBonus: 11.5 },
      { playerId: 'tp2', role: 'citizen', isWinner: true, judgeBonus: 14.2 },
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const mvp = res.body.nominations.find((n: any) => n.category === 'mvp');
    expect(mvp.candidates[0].participant_id).toBe('tp2');
    expect(mvp.candidates[0].nomination_points).toBe(14.2);
    expect(mvp.candidates[1].participant_id).toBe('tp1');
    expect(mvp.candidates[1].nomination_points).toBe(11.5);
  });

  it('32. Nominations secure auth rule: returns 401 if token missing', async () => {
    const res = await request(app).get(`/api/tournaments/${tournamentId}/nominations`);
    expect(res.status).toBe(401);
  });

  it('33. best_citizen ranks by citizen and sheriff games total score', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true, protocolBonus: 0.1 },
      { playerId: 'tp2', role: 'citizen', isWinner: true, protocolBonus: 0.0 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestCitizen = res.body.nominations.find((n: any) => n.category === 'best_citizen');
    expect(bestCitizen.candidates[0].participant_id).toBe('tp1');
    expect(bestCitizen.candidates[0].nomination_points).toBe(0.1); // in the route, win point is NOT added to nomination points, only judge+protocol+bm-penalty is added
  });

  it('34. best_sheriff ranks by sheriff games only', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'sheriff', isWinner: true, protocolBonus: 0.5 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestSheriff = res.body.nominations.find((n: any) => n.category === 'best_sheriff');
    expect(bestSheriff.candidates[0].nomination_points).toBe(0.5);
  });

  it('35. best_mafia ranks by mafia games only', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'black', [
      { playerId: 'tp1', role: 'mafia', isWinner: true, protocolBonus: 0.4 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestMafia = res.body.nominations.find((n: any) => n.category === 'best_mafia');
    expect(bestMafia.candidates[0].nomination_points).toBe(0.4);
  });

  it('36. best_don ranks by don games only', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'black', [
      { playerId: 'tp1', role: 'don', isWinner: true, protocolBonus: 0.3 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestDon = res.body.nominations.find((n: any) => n.category === 'best_don');
    expect(bestDon.candidates[0].nomination_points).toBe(0.3);
  });

  it('37. nominations has_tie is true when two candidates share maximum score', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'sheriff', isWinner: true, protocolBonus: 0.5 },
      { playerId: 'tp2', role: 'sheriff', isWinner: true, protocolBonus: 0.5 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestSheriff = res.body.nominations.find((n: any) => n.category === 'best_sheriff');
    expect(bestSheriff.has_tie).toBe(true);
  });

  it('38. nominations candidates are fully sorted descending', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'black', [
      { playerId: 'tp1', role: 'don', isWinner: true, protocolBonus: 0.1 },
      { playerId: 'tp2', role: 'don', isWinner: true, protocolBonus: 0.5 },
      { playerId: 'tp3', role: 'don', isWinner: true, protocolBonus: 0.3 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestDon = res.body.nominations.find((n: any) => n.category === 'best_don');
    expect(bestDon.candidates[0].participant_id).toBe('tp2');
    expect(bestDon.candidates[1].participant_id).toBe('tp3');
    expect(bestDon.candidates[2].participant_id).toBe('tp1');
  });

  it('39. nominations without games registered returns 0 points for candidates', async () => {
    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const mvp = res.body.nominations.find((n: any) => n.category === 'mvp');
    expect(mvp.candidates.length).toBe(0);
  });

  it('40. has_tie is false when the leader has strict advantage over others', async () => {
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    
    await addMockCompletedGame(db, tournamentId, 1, 'black', [
      { playerId: 'tp1', role: 'don', isWinner: true, protocolBonus: 0.5 },
      { playerId: 'tp2', role: 'don', isWinner: true, protocolBonus: 0.1 }
    ]);

    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestDon = res.body.nominations.find((n: any) => n.category === 'best_don');
    expect(bestDon.has_tie).toBe(false);
  });
});

describe('Theme 5: Разрешение равенств после завершения турнира', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let tournamentId: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    for (let i = 1; i <= 10; i++) {
      const pid = `player-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
    }

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир для Решений',
        date: new Date().toISOString(),
        participants: Array.from({ length: 10 }, (_, i) => ({
          player_id: `player-${i + 1}`,
          display_name: `Игрок ${i + 1}`,
        })),
      });
    tournamentId = res.body.id;

    await db.run("DELETE FROM tournament_participants WHERE tournament_id = ?", [tournamentId]);

    // Insert known participant IDs for predictability
    await db.run(`INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number) VALUES 
      ('tp1', ?, 'player-1', 'Player 1', 1),
      ('tp2', ?, 'player-2', 'Player 2', 2),
      ('tp3', ?, 'player-3', 'Player 3', 3),
      ('tp4', ?, 'player-4', 'Player 4', 4),
      ('tp5', ?, 'player-5', 'Player 5', 5),
      ('tp6', ?, 'player-6', 'Player 6', 6),
      ('tp7', ?, 'player-7', 'Player 7', 7),
      ('tp8', ?, 'player-8', 'Player 8', 8),
      ('tp9', ?, 'player-9', 'Player 9', 9),
      ('tp10', ?, 'player-10', 'Player 10', 10)`,
      [
        tournamentId, tournamentId, tournamentId, tournamentId, tournamentId,
        tournamentId, tournamentId, tournamentId, tournamentId, tournamentId
      ]
    );

    // Make the tournament completed
    await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);
  });

  it('41. GET /api/tournaments/:id/final-resolutions returns empty list initially', async () => {
    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-resolutions`)
      .set('Cookie', organizerCookie);

    expect(res.status).toBe(200);
    expect(res.body.tournament_id).toBe(tournamentId);
    expect(res.body.resolutions).toEqual([]);
  });

  it('42. PUT standing tie-break fails if tournament is not completed', async () => {
    await db.run("UPDATE tournaments SET status = 'active' WHERE id = ?", [tournamentId]);

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/standings/tg_any`)
      .set('Cookie', organizerCookie)
      .send({
        ordered_participant_ids: ['tp1', 'tp2'],
        resolution_method: 'draw',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Решения разрешены только для completed-турнира');
  });

  it('43. PUT standing tie-break fails for non-existent tie group', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/standings/tg_nonexistent`)
      .set('Cookie', organizerCookie)
      .send({
        ordered_participant_ids: ['tp1', 'tp2'],
        resolution_method: 'draw',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Группа равенства не найдена или неактивна');
  });

  it('44. PUT standing tie-break successfully resolves a tie group and updates standings places', async () => {
    // Generate a tie between tp1 and tp2 by adding a completed game
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'citizen', isWinner: true },
      { playerId: 'tp2', role: 'citizen', isWinner: true },
    ]);

    // Fetch standings to discover tieGroupId
    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    expect(standingsRes.body.tie_groups.length).toBe(1);
    const tg = standingsRes.body.tie_groups[0];
    const tieGroupId = tg.tie_group_id;

    // Attempt PUT resolution with wrong participant list
    const badPut = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/standings/${tieGroupId}`)
      .set('Cookie', organizerCookie)
      .send({
        ordered_participant_ids: ['tp1', 'tp3'], // tp3 is not in tie group
        resolution_method: 'chief_judge_decision',
      });
    expect(badPut.status).toBe(400);

    // Correct PUT resolution (favor tp2 over tp1)
    const goodPut = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/standings/${tieGroupId}`)
      .set('Cookie', organizerCookie)
      .send({
        ordered_participant_ids: ['tp2', 'tp1'],
        resolution_method: 'chief_judge_decision',
        comment: 'Chief judge prefers Player 2',
      });
    expect(goodPut.status).toBe(200);

    // Verify GET /final-resolutions
    const resolutionsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-resolutions`)
      .set('Cookie', organizerCookie);
    expect(resolutionsRes.body.resolutions.length).toBe(1);
    expect(resolutionsRes.body.resolutions[0].type).toBe('standings_tie');
    expect(resolutionsRes.body.resolutions[0].ordered_participant_ids).toEqual(['tp2', 'tp1']);

    // Check updated standings places
    const updatedStandings = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    const tp2Row = updatedStandings.body.standings.find((s: any) => s.participant_id === 'tp2');
    const tp1Row = updatedStandings.body.standings.find((s: any) => s.participant_id === 'tp1');

    expect(tp2Row.official_place).toBe(1);
    expect(tp1Row.official_place).toBe(2);
  });

  it('45. PUT nomination tie-break successfully resolves and updates nominations winner', async () => {
    // Generate a tie in best_sheriff between tp1 and tp2
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'sheriff', isWinner: true, protocolBonus: 1.5 },
      { playerId: 'tp2', role: 'sheriff', isWinner: true, protocolBonus: 1.5 },
    ]);

    // Check that best_sheriff has a tie
    const nomsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const bestSheriff = nomsRes.body.nominations.find((n: any) => n.category === 'best_sheriff');
    expect(bestSheriff.has_tie).toBe(true);

    // PUT nomination tie-break with wrong winner (not a tied leader)
    const badPut = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/nominations/best_sheriff`)
      .set('Cookie', organizerCookie)
      .send({
        winner_participant_id: 'tp3', // tp3 is not a leader
        resolution_method: 'draw',
      });
    expect(badPut.status).toBe(400);

    // Correct PUT nomination tie-break (choosing tp1)
    const goodPut = await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/nominations/best_sheriff`)
      .set('Cookie', organizerCookie)
      .send({
        winner_participant_id: 'tp1',
        resolution_method: 'draw',
        comment: 'Drawn out of hat',
      });
    expect(goodPut.status).toBe(200);

    // Check nominations now shows tp1 as the official winner
    const updatedNoms = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);

    const updatedSheriff = updatedNoms.body.nominations.find((n: any) => n.category === 'best_sheriff');
    expect(updatedSheriff.winner_participant_id).toBe('tp1');
    expect(updatedSheriff.resolution_method).toBe('draw');
    expect(updatedSheriff.comment).toBe('Drawn out of hat');
  });

  it('46. GET /api/tournaments/:id/final-readiness reports accurate unresolved ties', async () => {
    // Create dual ties: standings tie between tp1 and tp2, sheriff nomination tie between tp1 and tp2
    await db.run("DELETE FROM tournament_games WHERE tournament_id = ?", [tournamentId]);
    await addMockCompletedGame(db, tournamentId, 1, 'red', [
      { playerId: 'tp1', role: 'sheriff', isWinner: true, protocolBonus: 1.0 },
      { playerId: 'tp2', role: 'sheriff', isWinner: true, protocolBonus: 1.0 },
    ]);

    // Check readiness (should be false because of both ties)
    const readinessRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-readiness`)
      .set('Cookie', organizerCookie);

    expect(readinessRes.status).toBe(200);
    expect(readinessRes.body.ready).toBe(false);
    expect(readinessRes.body.unresolved_standings_ties.length).toBe(1);
    expect(readinessRes.body.unresolved_nomination_ties.length).toBe(2); // Ties in best_sheriff and mvp

    // Resolve standings tie
    const tgId = readinessRes.body.unresolved_standings_ties[0].tie_group_id;
    await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/standings/${tgId}`)
      .set('Cookie', organizerCookie)
      .send({
        ordered_participant_ids: ['tp1', 'tp2'],
        resolution_method: 'draw',
      });

    // Check readiness again (still false because of 2 nomination ties)
    const readinessRes2 = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-readiness`)
      .set('Cookie', organizerCookie);

    expect(readinessRes2.body.ready).toBe(false);
    expect(readinessRes2.body.unresolved_standings_ties.length).toBe(0);
    expect(readinessRes2.body.unresolved_nomination_ties.length).toBe(2);

    // Resolve best_sheriff nomination tie
    await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/nominations/best_sheriff`)
      .set('Cookie', organizerCookie)
      .send({
        winner_participant_id: 'tp2',
        resolution_method: 'chief_judge_decision',
      });

    // Check readiness again (still false because of 1 nomination tie left - mvp)
    const readinessRes2_5 = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-readiness`)
      .set('Cookie', organizerCookie);

    expect(readinessRes2_5.body.ready).toBe(false);
    expect(readinessRes2_5.body.unresolved_nomination_ties.length).toBe(1);
    expect(readinessRes2_5.body.unresolved_nomination_ties[0].category).toBe('mvp');

    // Resolve mvp nomination tie
    await request(app)
      .put(`/api/tournaments/${tournamentId}/final-resolutions/nominations/mvp`)
      .set('Cookie', organizerCookie)
      .send({
        winner_participant_id: 'tp1',
        resolution_method: 'chief_judge_decision',
      });

    // Check readiness again (should be true now)
    const readinessRes3 = await request(app)
      .get(`/api/tournaments/${tournamentId}/final-readiness`)
      .set('Cookie', organizerCookie);

    expect(readinessRes3.body.ready).toBe(true);
    expect(readinessRes3.body.unresolved_standings_ties.length).toBe(0);
    expect(readinessRes3.body.unresolved_nomination_ties.length).toBe(0);
  });
});

