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
          player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
        });

      expect(res.status).toBe(200);
      expect(res.body.protocol.best_move_seats).toEqual(seatsArr);
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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(res.status).toBe(200);
    expect(res.body.protocol.best_move_participant_id).toBe(firstKilledId);
    expect(res.body.protocol.best_move_source).toBe('first_killed');
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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(res.status).toBe(200);
    expect(res.body.protocol.best_move_participant_id).toBe(votedId);
    expect(res.body.protocol.best_move_source).toBe('zero_round_voted');
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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('первоубиенный');
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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });
    expect(res1.status).toBe(200);
    expect(res1.body.protocol.best_move_score).toBe(0.1);

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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });
    expect(res2.status).toBe(200);
    expect(res2.body.protocol.best_move_score).toBe(0.3);

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
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      });
    expect(res3.status).toBe(200);
    expect(res3.body.protocol.best_move_score).toBe(0.6);
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

  // Test 14: After completion, next game can be started
  it('14. Allows starting the next game after the previous game is completed', async () => {
    // Set roles for game 2
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

    // Trying to start game 2 while game 1 is active should fail
    const startGame2Fail = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/start`)
      .set('Cookie', organizerCookie);
    expect(startGame2Fail.status).toBe(400);

    // Complete game 1
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

    // Now starting game 2 should succeed!
    const startGame2Success = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/start`)
      .set('Cookie', organizerCookie);
    expect(startGame2Success.status).toBe(200);
    expect(startGame2Success.body.game.status).toBe('active');
  });
});
