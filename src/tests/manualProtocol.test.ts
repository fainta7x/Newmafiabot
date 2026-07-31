import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

let app: any;
let db: DatabaseWrapper;
let organizerCookie: string;
let playerIds: string[] = [];
let tournamentId: string;
let game1Id: string;
let game2Id: string;
let game1Seats: any[] = [];

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);

  const token = generateOrganizerToken();
  organizerCookie = `organizer_token=${token}`;

  // Create 10 test players
  playerIds = [];
  const participantsInput: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const pid = `test-player-uuid-${i}`;
    await db.run(
      `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
       VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
      [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
    );
    playerIds.push(pid);
    participantsInput.push({ player_id: pid, display_name: `Игрок ${i}` });
  }

  // Create tournament
  const createRes = await request(app)
    .post('/api/tournaments')
    .set('Cookie', organizerCookie)
    .send({
      title: 'Турнир Ручного Протокола',
      date: new Date().toISOString(),
      participants: participantsInput,
    });

  expect(createRes.status).toBe(201);
  tournamentId = createRes.body.id;

  // Generate seating
  const seatingRes = await request(app)
    .post(`/api/tournaments/${tournamentId}/generate-seating`)
    .set('Cookie', organizerCookie);

  expect(seatingRes.status).toBe(200);
  game1Id = seatingRes.body.games[0].id;
  game2Id = seatingRes.body.games[1].id;

  // Start tournament
  const startTRes = await request(app)
    .post(`/api/tournaments/${tournamentId}/start`)
    .set('Cookie', organizerCookie);
  expect(startTRes.status).toBe(200);

  // Set standard game roles for game 1 (6 citizens, 1 sheriff, 2 mafia, 1 don)
  // Seats 1..6 = citizen, 7 = sheriff, 8,9 = mafia, 10 = don
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
    .patch(`/api/tournaments/${tournamentId}/games/${game1Id}/roles`)
    .set('Cookie', organizerCookie)
    .send({ roles });

  // Start game 1
  const startGameRes = await request(app)
    .post(`/api/tournaments/${tournamentId}/games/${game1Id}/start`)
    .set('Cookie', organizerCookie);
  expect(startGameRes.status).toBe(200);

  // Get seats for game 1
  game1Seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [game1Id]);
});

describe('Manual Mobile Protocol Test Suite', () => {
  // Test 1: Draft is updated repeatedly without duplicating records
  it('1. Updates draft protocol multiple times without duplicating records', async () => {
    const payload1 = {
      protocol: {
        winner_team: 'red',
        judge_notes: 'Черновик 1',
      },
      player_results: game1Seats.map((s) => ({
        participant_id: s.participant_id,
        regular_fouls: 1,
        exit_type: 'alive',
      })),
    };

    const res1 = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send(payload1);

    expect(res1.status).toBe(200);
    expect(res1.body.protocol.status).toBe('draft');
    expect(res1.body.protocol.winner_team).toBe('red');

    // Update again
    const payload2 = {
      protocol: {
        winner_team: 'black',
        judge_notes: 'Черновик 2',
      },
      player_results: game1Seats.map((s) => ({
        participant_id: s.participant_id,
        regular_fouls: 2,
        exit_type: 'alive',
      })),
    };

    const res2 = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send(payload2);

    expect(res2.status).toBe(200);
    expect(res2.body.protocol.winner_team).toBe('black');
    expect(res2.body.protocol.judge_notes).toBe('Черновик 2');

    // Verify DB count
    const countP = await db.get<any>('SELECT COUNT(*) as cnt FROM tournament_game_protocols WHERE game_id = ?', [game1Id]);
    expect(countP.cnt).toBe(1);

    const countR = await db.get<any>('SELECT COUNT(*) as cnt FROM tournament_game_player_results WHERE game_id = ?', [game1Id]);
    expect(countR.cnt).toBe(10);
  });

  // Test 2: Best move can be empty
  it('2. Accepts empty best move seats and null recipient', async () => {
    const payload = {
      protocol: {
        best_move_seats: [],
        best_move_participant_id: null,
      },
      player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
    };

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.protocol.best_move_seats).toEqual([]);
    expect(res.body.protocol.best_move_participant_id).toBeNull();
    expect(res.body.protocol.best_move_score).toBe(0);
  });

  // Test 3: Can specify 1, 2, or 3 Best Move numbers
  it('3. Accepts 1, 2, or 3 numbers in Best Move', async () => {
    const firstKilledId = game1Seats[0].participant_id;

    for (const seatsArr of [[2], [2, 5], [2, 5, 8]]) {
      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send({
          protocol: {
            first_killed_participant_id: firstKilledId,
            best_move_participant_id: firstKilledId,
            best_move_seats: seatsArr,
          },
          player_results: game1Seats.map((s) => ({
            participant_id: s.participant_id,
            exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive',
          })),
        });

      expect(res.status).toBe(200);
      expect(res.body.protocol.best_moves[0].seat_numbers).toEqual(seatsArr);
    }
  });

  // Test 4: Cannot specify > 3 numbers in Best Move
  it('4. Rejects > 3 numbers in Best Move', async () => {
    const firstKilledId = game1Seats[0].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: firstKilledId,
          best_move_seats: [1, 2, 3, 4],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive'
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('больше 3');
  });

  // Test 5: Cannot duplicate numbers in Best Move
  it('5. Rejects duplicate numbers in Best Move', async () => {
    const firstKilledId = game1Seats[0].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: firstKilledId,
          best_move_seats: [2, 2, 5],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive'
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('повторяться');
  });

  // Test 6: First killed participant can receive Best Move
  it('6. Allows first killed participant to receive Best Move', async () => {
    const firstKilledId = game1Seats[0].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: firstKilledId,
          best_move_seats: [8, 9, 10],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive',
        })),
      });

    expect(res.status).toBe(200);
    expect(res.body.protocol.best_moves[0].participant_id).toBe(firstKilledId);
    expect(res.body.protocol.best_moves[0].source).toBe('first_killed');
  });

  // Test 7: Zero round voted participant can receive Best Move
  it('7. Allows zero round voted participant to receive Best Move', async () => {
    const votedId = game1Seats[1].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          zero_round_voted_participant_id: votedId,
          best_move_participant_id: votedId,
          best_move_seats: [8, 9],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === votedId ? 'voted_zero_round' : 'alive',
        })),
      });

    expect(res.status).toBe(200);
    expect(res.body.protocol.best_moves[0].participant_id).toBe(votedId);
    expect(res.body.protocol.best_moves[0].source).toBe('zero_round_voted');
  });

  // Test 8: Other player cannot receive Best Move
  it('8. Rejects Best Move recipient if player was neither first killed nor zero-round voted', async () => {
    const firstKilledId = game1Seats[0].participant_id;
    const randomPlayerId = game1Seats[5].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: randomPlayerId, // INVALID
          best_move_seats: [8, 9],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive',
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('совпадать');
  });

  // Test 9, 10, 11: Best move scores calculation (1 black -> 0.1, 2 black -> 0.3, 3 black -> 0.6)
  // Note: Seats 8, 9 are mafia, seat 10 is don. Seat 1 is citizen.
  it('9, 10, 11. Calculates correct Best Move points: 1 guessed -> 0.1, 2 guessed -> 0.3, 3 guessed -> 0.6', async () => {
    const firstKilledId = game1Seats[0].participant_id;

    // 1 guessed black (Seat 8)
    const res1 = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: firstKilledId,
          best_move_seats: [8, 1, 2], // 8 is mafia, 1 & 2 are citizen
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive',
        })),
      });
    expect(res1.status).toBe(200);
    expect(res1.body.protocol.best_moves[0].bonus_points).toBe(0.1);

    // 2 guessed black (Seats 8, 9)
    const res2 = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: firstKilledId,
          best_move_seats: [8, 9, 1], // 8 & 9 are mafia
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive',
        })),
      });
    expect(res2.status).toBe(200);
    expect(res2.body.protocol.best_moves[0].bonus_points).toBe(0.3);

    // 3 guessed black (Seats 8, 9, 10)
    const res3 = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: firstKilledId,
          best_move_participant_id: firstKilledId,
          best_move_seats: [8, 9, 10], // 8, 9, 10 are mafia/don
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === firstKilledId ? 'killed' : 'alive',
        })),
      });
    expect(res3.status).toBe(200);
    expect(res3.body.protocol.best_moves[0].bonus_points).toBe(0.6);
  });

  // Test 12: Color protocol of killed player can be empty
  it('12. Accepts empty color protocol for killed player', async () => {
    const killedId = game1Seats[0].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: killedId,
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === killedId ? 'killed' : 'alive',
          color_protocol: [], // Empty
        })),
      });

    expect(res.status).toBe(200);
    const killedResult = res.body.player_results.find((pr: any) => pr.participant_id === killedId);
    expect(killedResult.color_protocol).toEqual([]);
  });

  // Test 13: Completed game protocol cannot be edited via PUT
  it('13. Rejects PUT edit on completed game protocol', async () => {
    // Complete game protocol first
    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.protocol.status).toBe('completed');

    // Attempt PUT edit
    const editRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'black',
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(editRes.status).toBe(400);
    expect(editRes.text).toContain('без возврата в черновик');
  });

  // Test 15: Planned game cannot be saved or completed
  it('15. Rejects saving or completing a planned game', async () => {
    // game2Id is currently planned
    const saveRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game2Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(saveRes.status).toBe(400);
    expect(saveRes.body.error).toContain('Нельзя сохранить запланированную игру');

    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(completeRes.status).toBe(400);
    expect(completeRes.body.error).toContain('Нельзя завершить запланированную игру');
  });

  // Test 16: GET protocol requires organizer auth
  it('16. Requires organizer authorization for GET protocol', async () => {
    const unauthRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`);

    expect(unauthRes.status).toBe(401);

    const authRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie);

    expect(authRes.status).toBe(200);
  });

  // Test 17: Cannot revert completed game if another game is active
  it('17. Prevents reverting completed game if another game is active', async () => {
    // Complete game 1
    const complete1 = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });
    expect(complete1.status).toBe(200);

    // Set roles and start game 2 (making game 2 active)
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
      .patch(`/api/tournaments/${tournamentId}/games/${game2Id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/start`)
      .set('Cookie', organizerCookie);

    // Try reverting game 1 to draft
    const revertRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/revert-to-draft`)
      .set('Cookie', organizerCookie);

    expect(revertRes.status).toBe(400);
    expect(revertRes.body.error).toContain('уже есть другая активная игра');
  });

  // Test 18: Rejects invalid player results count or exit_type
  it('18. Rejects invalid player results count or exit_type', async () => {
    // Less than 10 results
    const shortRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: game1Seats.slice(0, 5).map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error).toContain('ровно 10');

    // Invalid exit_type
    const invalidExitRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: game1Seats.map((s, idx) => ({
          participant_id: s.participant_id,
          exit_type: idx === 0 ? 'exploded' : 'alive',
        })),
      });

    expect(invalidExitRes.status).toBe(400);
    expect(invalidExitRes.body.error).toContain('Недопустимый тип ухода');
  });

  // Test 19: Validates LH numbers and recipient exit_type
  it('19. Validates LH numbers and recipient exit_type', async () => {
    const p1Id = game1Seats[0].participant_id;

    // LH numbers provided but empty participant
    const noRecipientRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: p1Id,
          best_moves: [{
             participant_id: '',
             source: 'first_killed',
             seat_numbers: [1, 2, 3]
          }]
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === p1Id ? 'killed' : 'alive'
        })),
      });

    expect(noRecipientRes.status).toBe(400);
    expect(noRecipientRes.body.error).toContain('participant_id должен быть строкой');

    // LH recipient is alive
    const aliveLHRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: p1Id,
          best_moves: [{
             participant_id: p1Id,
             source: 'first_killed',
             seat_numbers: [1, 2, 3]
          }]
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive', // Should be 'killed' or 'voted_zero_round'
        })),
      });

    expect(aliveLHRes.status).toBe(400);
    expect(aliveLHRes.body.error).toContain('Первоубиенный игрок должен иметь тип ухода');
  });

  // Test 20: Missing player_results on PUT or POST complete returns 400
  it('20. Rejects PUT and POST complete without player_results with 400', async () => {
    const putRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
      });

    expect(putRes.status).toBe(400);
    expect(putRes.body.error).toContain('player_results');

    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
      });

    expect(completeRes.status).toBe(400);
    expect(completeRes.body.error).toContain('player_results');
  });

  // Test 21: Rejects first killed player with exit_type != 'killed' even without Best Move
  it('21. Rejects first killed player with exit_type != killed even without Best Move', async () => {
    const p1Id = game1Seats[0].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: p1Id,
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Первоубиенный игрок должен иметь тип ухода "killed"');
  });

  // Test 22: Rejects zero-round voted player with exit_type != 'voted_zero_round'
  it('22. Rejects zero-round voted player with incorrect exit_type', async () => {
    const p2Id = game1Seats[1].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          zero_round_voted_participant_id: p2Id,
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === p2Id ? 'voted_day' : 'alive',
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Заголосованный в нулевой круг игрок должен иметь тип ухода "voted_zero_round"');
  });

  // Test 23: Rejects same player for first killed and zero-round voted
  it('23. Rejects same player for first killed and zero-round voted', async () => {
    const p1Id = game1Seats[0].participant_id;

    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          first_killed_participant_id: p1Id,
          zero_round_voted_participant_id: p1Id,
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === p1Id ? 'killed' : 'alive',
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('не могут быть одним и тем же игроком');
  });

  // Test 24: Rejects color protocol for non-killed player or invalid seats
  it('24. Rejects color protocol for non-killed player or invalid seats', async () => {
    const p1Id = game1Seats[0].participant_id;

    // Color protocol on alive player
    const nonKilledRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {},
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
          color_protocol: s.participant_id === p1Id ? [{ seat_numbers: [1, 2], mark: 'red' }] : [],
        })),
      });

    expect(nonKilledRes.status).toBe(400);
    expect(nonKilledRes.body.error).toContain('убитого игрока');

    // Color protocol with seat > 10
    const invalidSeatRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {},
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === p1Id ? 'killed' : 'alive',
          color_protocol: s.participant_id === p1Id ? [{ seat_numbers: [11], mark: 'red' }] : [],
        })),
      });

    expect(invalidSeatRes.status).toBe(400);
    expect(invalidSeatRes.body.error).toContain('от 1 до 10');
  });

  // Test 25: Validates votes nominated candidates without duplicates
  it('25. Rejects duplicate candidates in votes', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          votes: [{ round_number: 1, is_revote: false, nominated_seats: [1, 1], vote_counts: { 1: 5 } }],
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('не могут повторяться');
  });

  // Test 25a: Draft allows empty round
  it('25a. Allows empty round in draft', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          votes: [{ round_number: 1, is_revote: false, nominated_seats: [], vote_counts: {} }],
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(res.status).toBe(200);
  });

  // Test 25b: Complete rejects empty round
  it('25b. Rejects empty round on complete', async () => {
    const res = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          votes: [{ round_number: 1, is_revote: false, nominated_seats: [], vote_counts: {} }],
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Запрещено завершать протокол с пустым кругом голосования');
  });

  // Test 26: Saves decimal bonuses and replacement block
  it('26. Accepts decimal bonuses and replacement data', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          replacement: {
            replaced_seat: 1,
            replacement_name_or_comment: 'Замена Иванова',
            replacement_time: 'День 2',
            notes: 'По состоянию здоровья',
          },
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
          protocol_bonus: 0.5,
          judge_bonus: 0.25,
          penalty_points: 0.5,
        })),
      });

    expect(res.status).toBe(200);
    expect(res.body.protocol.replacement.replacement_name_or_comment).toBe('Замена Иванова');
    expect(res.body.player_results[0].protocol_bonus).toBe(0.5);
    expect(res.body.player_results[0].judge_bonus).toBe(0.25);
    expect(res.body.player_results[0].penalty_points).toBe(0.5);
  });

  // BEST MOVES TESTS
  describe('Multiple Best Moves tests', () => {
    let basePayload: any;
    beforeEach(() => {
      basePayload = {
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: game1Seats[0].participant_id, // Seat 1, citizen
          zero_round_voted_participant_id: game1Seats[1].participant_id, // Seat 2, citizen
          shots: [{ night_number: 1, target_seat: 1, result: 'killed' }],
          best_moves: []
        },
        player_results: game1Seats.map((s, idx) => ({
          participant_id: s.participant_id,
          exit_type: idx === 0 ? 'killed' : (idx === 1 ? 'voted_zero_round' : 'alive'),
          exit_order: idx === 0 ? 1 : (idx === 1 ? 2 : null)
        }))
      };
    });

    it('should save two independent best moves, including empty ones, and preserve them in GET, PUT, and revert', async () => {
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [] },
        { participant_id: game1Seats[1].participant_id, source: 'zero_round_voted', seat_numbers: [8, 9] }
      ];

      // PUT
      const putRes = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);
      expect(putRes.status).toBe(200);

      // GET
      let getRes = await request(app).get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie);
      expect(getRes.body.protocol.best_moves.length).toBe(2);
      expect(getRes.body.protocol.best_moves.find((bm: any) => bm.source === 'first_killed').seat_numbers).toEqual([]);
      expect(getRes.body.protocol.best_moves.find((bm: any) => bm.source === 'zero_round_voted').seat_numbers).toEqual([8, 9]);

      // Complete
      const compRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);
      expect(compRes.status).toBe(200);

      // Revert to draft
      const revertRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/revert-to-draft`)
        .set('Cookie', organizerCookie);
      expect(revertRes.status).toBe(200);

      // GET again
      getRes = await request(app).get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie);
      expect(getRes.body.protocol.best_moves.length).toBe(2);
      expect(getRes.body.protocol.best_moves.find((bm: any) => bm.source === 'first_killed').seat_numbers).toEqual([]);
      expect(getRes.body.protocol.best_moves.find((bm: any) => bm.source === 'zero_round_voted').seat_numbers).toEqual([8, 9]);
    });

    it('should reject invalid seat numbers (4 numbers, duplicates, strings, out of bounds)', async () => {
      // 4 numbers
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [1, 2, 3, 4] }
      ];
      let res = await request(app).put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie).send(basePayload);
      expect(res.status).toBe(400);

      // Duplicates
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [1, 2, 2] }
      ];
      res = await request(app).put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie).send(basePayload);
      expect(res.status).toBe(400);

      // Strings (schema will reject due to strict typings/coerce)
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: ['1'] as any }
      ];
      res = await request(app).put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie).send(basePayload);
      expect(res.status).toBe(400);

      // Out of bounds
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [11] }
      ];
      res = await request(app).put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie).send(basePayload);
      expect(res.status).toBe(400);
    });

    it('should save two independent best moves', async () => {
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [8, 9, 10] }, // Guessed 3
        { participant_id: game1Seats[1].participant_id, source: 'zero_round_voted', seat_numbers: [8, 2] } // Guessed 1
      ];

      const compRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);
      expect(compRes.status).toBe(200);

      const dbBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game1Id]);
      expect(dbBms.length).toBe(2);

      const standings = await request(app).get(`/api/tournaments/${tournamentId}/standings`).set('Cookie', organizerCookie);
      const fkPlayerStats = standings.body.standings.find((s: any) => s.participant_id === game1Seats[0].participant_id);
      const zrPlayerStats = standings.body.standings.find((s: any) => s.participant_id === game1Seats[1].participant_id);

      expect(fkPlayerStats.best_move_points).toBe(0.6); // Guessed 3 (8,9,10)
      expect(zrPlayerStats.best_move_points).toBe(0.1); // Guessed 1 (8)
    });

    it('should validate correctly that best_moves has max 2 elements', async () => {
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [8] },
        { participant_id: game1Seats[1].participant_id, source: 'zero_round_voted', seat_numbers: [9] },
        { participant_id: game1Seats[2].participant_id, source: 'first_killed', seat_numbers: [10] }
      ];

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('В игре не может быть более двух ЛХ');
    });

    it('should fall back to legacy best_move_participant_id if best_moves is undefined', async () => {
      delete basePayload.protocol.best_moves;
      basePayload.protocol.best_move_participant_id = game1Seats[0].participant_id;
      basePayload.protocol.best_move_seats = [8, 9];

      const compRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);
      expect(compRes.status).toBe(200);

      const dbBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game1Id]);
      expect(dbBms.length).toBe(1);
      expect(dbBms[0].participant_id).toBe(game1Seats[0].participant_id);
      expect(JSON.parse(dbBms[0].seat_numbers_json)).toEqual([8, 9]);

      const getRes = await request(app).get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`).set('Cookie', organizerCookie);
      expect(getRes.body.protocol.best_moves.length).toBe(1);
      expect(getRes.body.protocol.best_moves[0].participant_id).toBe(game1Seats[0].participant_id);
      expect(getRes.body.protocol.best_moves[0].seat_numbers).toEqual([8, 9]);
    });

    it('should not double points if legacy fields and best_moves are sent together', async () => {
      basePayload.protocol.best_moves = [
        { participant_id: game1Seats[0].participant_id, source: 'first_killed', seat_numbers: [8, 9, 10] } // 0.6 pts
      ];
      basePayload.protocol.best_move_participant_id = game1Seats[0].participant_id;
      basePayload.protocol.best_move_seats = [8, 9, 10];

      const compRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);
      expect(compRes.status).toBe(200);

      const dbBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game1Id]);
      // The API should only process best_moves if provided, ignoring the legacy fields to prevent duplicates.
      expect(dbBms.length).toBe(1);

      const standings = await request(app).get(`/api/tournaments/${tournamentId}/standings`).set('Cookie', organizerCookie);
      const fkPlayerStats = standings.body.standings.find((s: any) => s.participant_id === game1Seats[0].participant_id);
      expect(fkPlayerStats.best_move_points).toBe(0.6); // Not 1.2
    });
  });

  // Night Shots Validations
  it('28. Rejects duplicate night numbers', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          shots: [
            { night_number: 1, target_seat: 5, result: 'killed' },
            { night_number: 1, target_seat: 6, result: 'miss' }
          ]
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' }))
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('подряд');
  });

  it('29. Rejects gap in night numbers', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          shots: [
            { night_number: 1, target_seat: 5, result: 'killed' },
            { night_number: 3, target_seat: 6, result: 'miss' }
          ]
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' }))
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('подряд');
  });

  it('30. Rejects invalid target seat', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          shots: [
            { night_number: 1, target_seat: 15, result: 'killed' }
          ]
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' }))
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('от 1 до 10');
  });

  it('31. Rejects invalid result', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          shots: [
            { night_number: 1, target_seat: 5, result: 'unknown_result' }
          ]
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' }))
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Недопустимый результат');
  });

  it('32. Accepts empty shots array', async () => {
    const res = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          shots: []
        },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' }))
      });
    expect(res.status).toBe(200);
  });

  // Comprehensive Voting Protocols, Validation, and Constraint Tests (16 Mandatory Scenarios)
  describe('Mandatory Voting Protocols and Constraints Tests', () => {
    let basePayload: any;

    beforeEach(() => {
      basePayload = {
        protocol: {
          winner_team: 'red',
          votes: [],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
        })),
      };
    });

    // 1. Day 0 round accepts eligible_voters of 10.
    it('1. Accepts day_number = 0 when eligible_voters is exactly 10', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 0,
          eligible_voters: 10,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 5, 2: 5 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[0].eligible_voters).toBe(10);
    });

    // 2. Day 0 round rejects eligible_voters other than 10 (e.g. 9) during PUT.
    it('2. Rejects day_number = 0 during PUT if eligible_voters is not 10', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 0,
          eligible_voters: 9, // INVALID for day 0
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 5 },
          is_confirmed: true,
          outcome: 'single_eliminated',
          eliminated_seats: [2],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('количество голосующих в нулевом круге должно быть строго равно 10');
    });

    // 3. Day 0 round rejects eligible_voters other than 10 on complete POST.
    it('3. Rejects day_number = 0 during completion POST if eligible_voters is not 10', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 0,
          eligible_voters: 8, // INVALID
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('количество голосующих в нулевом круге должно быть строго равно 10');
    });

    // 4. Revote inherits day number from parent.
    it('4. Accepts revote round when it correctly inherits the day_number from parent round', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 2,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [3, 4],
          vote_counts: { 3: 4, 4: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 2, // Matches parent day_number
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [3, 4],
          vote_counts: { 3: 4, 4: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
    });

    // 5. Revote rejects mismatched day number.
    it('5. Rejects revote round if day_number does not match parent round day_number', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 2,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [3, 4],
          vote_counts: { 3: 4, 4: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 3, // MISMATCH with parent day_number 2
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [3, 4],
          vote_counts: { 3: 4, 4: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('должен совпадать с днём родительского голосования');
    });

    // 6. Revote inherits eligible voters from parent.
    it('6. Accepts revote round when it correctly inherits eligible_voters from parent round', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8, // Matches parent voter count
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 1,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
    });

    // 7. Revote rejects mismatched eligible voters.
    it('7. Rejects revote round if eligible_voters does not match parent round eligible_voters', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 6, // MISMATCH with parent eligible_voters 8
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 3, 2: 3 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('количество голосующих');
    });

    // 8. Revote tie-break requires explicit table_leave_votes.
    it('8. Rejects completion of revote tie-break if table_leave_votes is null or undefined', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 }, // Tie!
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: null, // Missing explicit vote count!
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('не указаны голоса за уход всех спорных игроков при переголосовании');
    });

    // 9. Revote tie-break accepts explicit table_leave_votes = 0.
    it('9. Accepts revote tie-break with table_leave_votes explicitly set to 0', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0, // Explicitly 0
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[1].table_leave_votes).toBe(0);
    });

    // 10. Revote tie-break with table_leave_votes below majority -> outcome is no_elimination.
    it('10. Resolves outcome to no_elimination when table_leave_votes is below majority (e.g. 4 of 8)', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 4, // 4 out of 8 is not a majority (majority is 5)
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[1].outcome).toBe('no_elimination');
    });

    // 11. Revote tie-break with table_leave_votes >= majority -> outcome is all_tied_eliminated.
    it('11. Resolves outcome to all_tied_eliminated when table_leave_votes is >= majority (e.g. 5 of 8)', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'all_tied_eliminated',
          table_leave_votes: 5, // 5 out of 8 is a majority
          eliminated_seats: [1, 2],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[1].outcome).toBe('all_tied_eliminated');
      expect(res.body.protocol.votes[1].eliminated_seats).toEqual([1, 2]);
    });

    // 12. Single winner outcome is single_eliminated without needing table_leave_votes.
    it('12. Resolves normal round with single majority winner to single_eliminated without needing table_leave_votes', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 5, 2: 3 }, // Single majority winner
          is_confirmed: true,
          outcome: 'single_eliminated',
          eliminated_seats: [1],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[0].outcome).toBe('single_eliminated');
    });

    // 13. Revote with single winner does not require table_leave_votes.
    it('13. Resolves revote with single winner to single_eliminated without requiring table_leave_votes', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 6, 2: 2 }, // Single majority winner on revote
          is_confirmed: true,
          outcome: 'single_eliminated',
          table_leave_votes: null, // No tie, so table_leave_votes is optional/null
          eliminated_seats: [1],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[1].outcome).toBe('single_eliminated');
    });

    // 14. Normal tie-break without revote results in tie_revote outcome.
    it('14. Resolves normal round tie to tie_revote without requiring table_leave_votes', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 }, // Tie!
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.votes[0].outcome).toBe('tie_revote');
    });

    // 15. Validation errors return exact failing round index/indices in the response.
    it('15. Returns exact error indices in PUT response when voting constraints are violated', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 0,
          eligible_voters: 8, // VIOLATION: Must be 10 for day 0!
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('количество голосующих в нулевом круге должно быть строго равно 10');
    });

    // 16. Validation errors on complete POST block transitioning and return detailed reports.
    it('16. Blocks transition to completed status and returns details on validation errors during POST complete', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: null, // VIOLATION
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('не указаны голоса за уход всех спорных игроков при переголосовании');

      // Verify game is still in draft / not completed
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getRes.body.protocol.status).toBe('draft');
    });

    // 17. Rejects revote without parent_round_number.
    it('17. Rejects revote round if is_revote is true but parent_round_number is missing', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('переголосование обязано содержать явный parent_round_number');
    });

    // 18. Rejects revote referencing a parent round that does not exist.
    it('18. Rejects revote round if parent_round_number references a non-existent round', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 99, // NON-EXISTENT
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('родительское голосование #99 не найдено');
    });

    // 19. Rejects revote with parent round after the revote round (wrong order).
    it('19. Rejects revote round if parent round is ordered after the revote round', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 2, // PARENT IS LATER (round #2)
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('родительское голосование должно предшествовать переголосованию');
    });

    // 20. Rejects revote with parent round that is also a revote.
    it('20. Rejects revote round if parent round is itself a revote round', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote', // Acts as intermediate tie
          table_leave_votes: 4,
          eliminated_seats: [],
        },
        {
          round_number: 3,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 2, // INVALID: Round 2 is also a revote
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('родительское голосование не может само являться переголосованием');
    });

    // 21. Rejects revote with parent round that does not have outcome 'tie_revote'.
    it('21. Rejects revote round if parent round outcome is not tie_revote', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 5, 2: 3 }, // Single majority winner
          is_confirmed: true,
          outcome: 'single_eliminated',
          eliminated_seats: [1],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1, // INVALID: Parent round 1 has outcome 'single_eliminated', not 'tie_revote'
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('родительское голосование должно иметь исход tie_revote');
    });

    // 22. Rejects duplicate revotes for the same parent round.
    it('22. Rejects saving a protocol if multiple revote rounds reference the same parent_round_number', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
        {
          round_number: 3,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1, // DUPLICATE REFERENCING ROUND 1
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('обнаружено дублирующееся переголосование для раунда #1');
    });

    // 23. Rejects completion of protocol if a tie has no linked child revote.
    it('23. Rejects completion of protocol if a round is tie_revote but there is no subsequent child revote round referencing it', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2],
          vote_counts: { 1: 4, 2: 4 },
          is_confirmed: true,
          outcome: 'tie_revote', // Tie but no revote round is added to the array!
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('раунд #1 завершился ничьей, но для него отсутствует связанное переголосование');
    });

    // 24. Rejects revote if nominated seats do not match the tied winners of parent round.
    it('24. Rejects revote if nominated_seats do not match the tied winners of parent round', async () => {
      basePayload.protocol.votes = [
        {
          round_number: 1,
          day_number: 1,
          eligible_voters: 8,
          is_revote: false,
          nominated_seats: [1, 2, 3],
          vote_counts: { 1: 3, 2: 3, 3: 2 }, // Tied winners are [1, 2]
          is_confirmed: true,
          outcome: 'tie_revote',
          eliminated_seats: [],
        },
        {
          round_number: 2,
          day_number: 1,
          eligible_voters: 8,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [1, 3], // WRONG NOMINEES: Should be [1, 2]
          vote_counts: { 1: 4, 3: 4 },
          is_confirmed: true,
          outcome: 'no_elimination',
          table_leave_votes: 0,
          eliminated_seats: [],
        },
      ];

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(basePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('список кандидатов переголосования (1, 3) не соответствует спорным игрокам предыдущего раунда (1, 2)');
    });
  });
});
