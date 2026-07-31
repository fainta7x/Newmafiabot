import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

let app: any;
let db: DatabaseWrapper;
let organizerCookie: string;
let playerIds: string[] = [];

beforeEach(async () => {
  // Use in-memory SQLite database for testing
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);

  const token = generateOrganizerToken();
  organizerCookie = `organizer_token=${token}`;

  // Create 10 test players in DB
  playerIds = [];
  for (let i = 1; i <= 10; i++) {
    const pid = `test-player-uuid-${i}`;
    await db.run(
      `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
       VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
      [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
    );
    playerIds.push(pid);
  }
});

describe('Tournament Module API Tests', () => {
  // 1. Creation of a tournament with 9 participants is allowed, but start_readiness shows that exactly 10 participants are required to start
  it('1. Creation of a tournament with 9 participants is allowed, but start_readiness shows that exactly 10 participants are required to start', async () => {
    const nineParticipants = playerIds.slice(0, 9).map((id) => ({ player_id: id }));

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тестовый Турнир 9',
        date: new Date().toISOString(),
        participants: nineParticipants,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    const tournamentId = res.body.id;
    const detailRes = await request(app)
      .get(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie);

    expect(detailRes.body.start_readiness).toBeDefined();
    expect(detailRes.body.start_readiness.ready).toBe(false);
    expect(detailRes.body.start_readiness.errors).toContainEqual(
      expect.stringContaining('Необходимо ровно 10 участников')
    );
  });

  // 2. Cannot add duplicate player
  it('2. Reject tournament creation with duplicate players', async () => {
    const duplicateParticipants = [
      ...playerIds.slice(0, 9).map((id) => ({ player_id: id })),
      { player_id: playerIds[0] }, // Duplicate
    ];

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тестовый Турнир Дубли',
        date: new Date().toISOString(),
        participants: duplicateParticipants,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('повторяться');
  });

  // 3. Generation creates 10 games and 100 seats
  it('3. Successfully create tournament with 10 unique players and generate 10 games & 100 seats', async () => {
    const validParticipants = playerIds.map((id, idx) => ({ player_id: id, display_name: `Игрок ${idx + 1}` }));

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Кубок 10 Игроков',
        date: new Date().toISOString(),
        chief_judge_name: 'Судья Главный',
        participants: validParticipants,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('draft');
    expect(res.body.participants.length).toBe(10);
    expect(res.body.games.length).toBe(10);

    let totalSeatsCount = 0;
    for (const game of res.body.games) {
      expect(game.seats.length).toBe(10);
      totalSeatsCount += game.seats.length;
    }
    expect(totalSeatsCount).toBe(100);
  });

  // 4. In each game all 10 participants are present without duplicates
  it('4. Each game has all 10 unique participants seated without duplicates', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Проверка Уникальности Игр',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;
    const detailRes = await request(app)
      .get(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie);

    for (const game of detailRes.body.games) {
      const participantIdsInGame = game.seats.map((s: any) => s.participant_id);
      const uniqueInGame = new Set(participantIdsInGame);
      expect(uniqueInGame.size).toBe(10);

      const seatNumbers = game.seats.map((s: any) => s.seat_number);
      const uniqueSeats = new Set(seatNumbers);
      expect(uniqueSeats.size).toBe(10);
      expect(Math.min(...seatNumbers)).toBe(1);
      expect(Math.max(...seatNumbers)).toBe(10);
    }
  });

  // 5. Swapping changes only the two selected players in the specified game
  it('5. Swapping two seats in a game swaps ONLY those two seats in that game', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тест Перестановки',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;
    const game1 = createRes.body.games[0];
    const game2Before = createRes.body.games[1];

    const seat1Before = game1.seats.find((s: any) => s.seat_number === 1);
    const seat2Before = game1.seats.find((s: any) => s.seat_number === 2);
    const seat3Before = game1.seats.find((s: any) => s.seat_number === 3);

    // Swap seat 1 and seat 2 in Game 1
    const swapRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1.id}/swap-seats`)
      .set('Cookie', organizerCookie)
      .send({
        seat_number_1: 1,
        seat_number_2: 2,
      });

    expect(swapRes.status).toBe(200);

    const updatedSeats = swapRes.body.seats;
    const seat1After = updatedSeats.find((s: any) => s.seat_number === 1);
    const seat2After = updatedSeats.find((s: any) => s.seat_number === 2);
    const seat3After = updatedSeats.find((s: any) => s.seat_number === 3);

    expect(seat1After.participant_id).toBe(seat2Before.participant_id);
    expect(seat2After.participant_id).toBe(seat1Before.participant_id);
    expect(seat3After.participant_id).toBe(seat3Before.participant_id);

    // Verify Game 2 was completely unaffected
    const detailRes = await request(app).get(`/api/tournaments/${tournamentId}`);
    const game2After = detailRes.body.games[1];
    expect(game2After.seats[0].participant_id).toBe(game2Before.seats[0].participant_id);
  });

  // 6. Cannot start game if tournament is in draft status
  it('6. Cannot start a game if tournament status is draft', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Черновик',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;
    const game1Id = createRes.body.games[0].id;

    // Assign valid roles
    const validRoles = [
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
      .send({ roles: validRoles });

    // Attempt to start game while tournament is in draft -> Should fail
    const startGameRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/start`)
      .set('Cookie', organizerCookie);

    expect(startGameRes.status).toBe(400);
    expect(startGameRes.body.error).toContain('активном турнире');
  });

  // 7. Cannot start a second game when one is already active
  it('7. Cannot start a second game when another game is active in the tournament', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Две Игры',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;
    const game1Id = createRes.body.games[0].id;
    const game2Id = createRes.body.games[1].id;

    // Start tournament
    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    const validRoles = [
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

    // Assign roles to game 1 & game 2
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game1Id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: validRoles });

    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game2Id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: validRoles });

    // Start Game 1 -> Succeeds
    const start1 = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/start`)
      .set('Cookie', organizerCookie);
    expect(start1.status).toBe(200);

    // Attempt to start Game 2 while Game 1 is active -> Fails
    const start2 = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/start`)
      .set('Cookie', organizerCookie);
    expect(start2.status).toBe(400);
    expect(start2.body.error).toContain('уже идет другая игра');
  });

  // 8. After game start: roles and judge modifications are blocked
  it('8. Roles and judge changes are blocked after game launch', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Блокировка Игры',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;
    const game1Id = createRes.body.games[0].id;

    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    const validRoles = [
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
      .send({ roles: validRoles });

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/start`)
      .set('Cookie', organizerCookie);

    // Try modifying roles -> Fails
    const roleChange = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game1Id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: validRoles });
    expect(roleChange.status).toBe(400);

    // Try modifying judge -> Fails
    const judgeChange = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game1Id}/judge`)
      .set('Cookie', organizerCookie)
      .send({ judge_name: 'Новый Судья' });
    expect(judgeChange.status).toBe(400);
  });

  // 9. Generic PATCH tournament ignores status field
  it('9. Generic PATCH /api/tournaments/:id ignores status parameter', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Старый Заголовок',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    // Send PATCH trying to directly set status: 'active'
    const patchRes = await request(app)
      .patch(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie)
      .send({
        title: 'Новый Заголовок',
        status: 'active',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe('Новый Заголовок');
    // Status must remain 'draft'
    expect(patchRes.body.status).toBe('draft');
  });

  // 11. start_readiness is returned correctly and validates readiness
  it('11. GET /api/tournaments/:id returns start_readiness object with accurate readiness status', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Проверка Готовности',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;
    const detailRes = await request(app).get(`/api/tournaments/${tournamentId}`);

    expect(detailRes.body.start_readiness).toBeDefined();
    expect(detailRes.body.start_readiness.ready).toBe(true);
    expect(detailRes.body.start_readiness.participants_count).toBe(10);
    expect(detailRes.body.start_readiness.games_count).toBe(10);
    expect(detailRes.body.start_readiness.seats_count).toBe(100);
    expect(detailRes.body.start_readiness.errors.length).toBe(0);
  });

  // 12. Starting tournament locks status to active and prevents double start
  it('12. Starting tournament transitions status to active and rejects second start attempt', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Повторный Запуск',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    const start1 = await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    expect(start1.status).toBe(200);
    expect(start1.body.tournament.status).toBe('active');

    // Second start attempt fails
    const start2 = await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    expect(start2.status).toBe(400);
    expect(start2.body.error).toContain('Турнир не может быть запущен из текущего статуса');
  });

  // 13. Public results, publishing rules, stability, ordering, and private data protection
  it('13. Public results, publishing rules, stability, ordering, and private data protection', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Публичный Турнир',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    // 13a. Attempt to publish a draft tournament should fail
    const pubFail1 = await request(app)
      .post(`/api/tournaments/${tournamentId}/publish`)
      .set('Cookie', organizerCookie);
    expect(pubFail1.status).toBe(400);
    expect(pubFail1.body.error).toContain('завершённых');

    // Manually update status to 'completed' in DB for testing
    await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);

    // 13b. Publish completed tournament with no unresolved ties should succeed
    const pubSuccess = await request(app)
      .post(`/api/tournaments/${tournamentId}/publish`)
      .set('Cookie', organizerCookie);
    
    expect(pubSuccess.status).toBe(200);
    expect(pubSuccess.body.success).toBe(true);
    expect(pubSuccess.body.public_token).toBeDefined();

    const token = pubSuccess.body.public_token;

    // 13c. Access public results anonymously
    const publicRes = await request(app)
      .get(`/api/public/tournaments/results/${token}`);

    expect(publicRes.status).toBe(200);
    expect(publicRes.body.tournament).toBeDefined();
    expect(publicRes.body.tournament.title).toBe('Публичный Турнир');
    expect(publicRes.body.tournament.results_published_at).toBeDefined();

    // 13d. Ensure NO private data is leaked
    const responseString = JSON.stringify(publicRes.body);
    expect(responseString).not.toContain('+7900000000'); // No phones leaked
    expect(responseString).not.toContain('NEW_LEAD'); // No lead status leaked

    // 13e. Unauthorized access with wrong token should fail
    const badTokenRes = await request(app)
      .get(`/api/public/tournaments/results/some_fake_nonexistent_token`);
    expect(badTokenRes.status).toBe(404);
  });

  // 14. Reopening completed tournament for correction and public results hiding
  it('14. Reopening completed tournament for correction, invalidating resolutions, and hiding public results', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир для коррекции',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    // Manually complete and publish tournament
    const publicToken = 'test-token-correction-123';
    await db.run(
      "UPDATE tournaments SET status = 'completed', public_token = ?, results_published_at = ? WHERE id = ?",
      [publicToken, new Date().toISOString(), tournamentId]
    );

    // Insert a dummy resolution into tournament_final_resolutions
    const nowIso = new Date().toISOString();
    await db.run(
      "INSERT INTO tournament_final_resolutions (id, tournament_id, type, participant_ids_json, resolution_method, created_at, updated_at) VALUES ('res-1', ?, 'nomination_tie', '[]', 'draw', ?, ?)",
      [tournamentId, nowIso, nowIso]
    );

    // Verify public endpoint returns 200 before reopening
    const pubResBefore = await request(app).get(`/api/public/tournaments/results/${publicToken}`);
    expect(pubResBefore.status).toBe(200);

    // Endpoint protection checks:
    // Unauthorized check
    const unauthRes = await request(app).post(`/api/tournaments/${tournamentId}/reopen-for-correction`);
    expect(unauthRes.status).toBe(401);

    // Nonexistent tournament check
    const nonExistRes = await request(app)
      .post('/api/tournaments/nonexistent-id/reopen-for-correction')
      .set('Cookie', organizerCookie);
    expect(nonExistRes.status).toBe(404);

    // Successful reopen call
    const reopenRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/reopen-for-correction`)
      .set('Cookie', organizerCookie);

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.success).toBe(true);
    expect(reopenRes.body.tournament_id).toBe(tournamentId);
    expect(reopenRes.body.status).toBe('correction');
    expect(reopenRes.body.public_results_hidden).toBe(true);
    expect(reopenRes.body.invalidated_resolutions_count).toBe(1);

    // Verify DB state
    const tDb = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    expect(tDb.status).toBe('correction');
    expect(tDb.results_published_at).toBeNull();
    expect(tDb.public_token).toBe(publicToken); // Public token preserved

    const resolutions = await db.all<any>('SELECT * FROM tournament_final_resolutions WHERE tournament_id = ?', [tournamentId]);
    expect(resolutions.length).toBe(0); // Resolutions cleared

    // Public endpoint now returns 404 because results are hidden
    const pubResAfter = await request(app).get(`/api/public/tournaments/results/${publicToken}`);
    expect(pubResAfter.status).toBe(404);

    // Repeating call when already in correction fails with 400
    const repeatRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/reopen-for-correction`)
      .set('Cookie', organizerCookie);
    expect(repeatRes.status).toBe(400);
  });

  // 15. Game protocol correction workflow after reopening tournament
  it('15. Full workflow: reopen tournament -> revert completed game to draft -> edit -> re-complete protocol', async () => {
    const validParticipants = playerIds.map((id, idx) => ({ player_id: id, display_name: `Игрок ${idx + 1}` }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Исправления Игр',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    // Start tournament
    await request(app).post(`/api/tournaments/${tournamentId}/start`).set('Cookie', organizerCookie);

    // Get game 1
    const tDetail = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', organizerCookie);
    const game1 = tDetail.body.games.find((g: any) => g.game_number === 1);
    const gameId = game1.id;

    // Set roles BEFORE starting game 1
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
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    // Start game 1
    await request(app).post(`/api/tournaments/${tournamentId}/games/${gameId}/start`).set('Cookie', organizerCookie);

    // Complete game 1 protocol
    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const playerResults = seats.map((s: any) => ({
      participant_id: s.participant_id,
      seat_number: s.seat_number,
      exit_type: 'alive',
      regular_fouls: 1,
      minor_technical_fouls: 0,
      major_technical_fouls: 0,
      protocol_bonus: 0,
    }));

    const completePayload = {
      protocol: {
        winner_team: 'red',
        end_reason: 'normal',
      },
      player_results: playerResults,
      best_moves: [],
    };

    const compRes1 = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send(completePayload);
    expect(compRes1.status).toBe(200);

    // Manually mark tournament completed in DB for test scenario
    await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);

    // Direct revert attempt on completed tournament must fail (400)
    const directRevert = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/revert-to-draft`)
      .set('Cookie', organizerCookie);
    expect(directRevert.status).toBe(400);

    // Step 1: Reopen tournament for correction
    const reopen = await request(app)
      .post(`/api/tournaments/${tournamentId}/reopen-for-correction`)
      .set('Cookie', organizerCookie);
    expect(reopen.status).toBe(200);
    expect(reopen.body.status).toBe('correction');

    // Step 2: Now revert game 1 protocol to draft
    const gameRevert = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/revert-to-draft`)
      .set('Cookie', organizerCookie);
    expect(gameRevert.status).toBe(200);
    expect(gameRevert.body.protocol.status).toBe('draft');
    expect(gameRevert.body.game.status).toBe('active');

    // Step 3: Modify protocol and re-complete
    const updatedResults = [...playerResults];
    updatedResults[0].protocol_bonus = 0.5; // add bonus points

    const completeProtocolRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          end_reason: 'normal',
        },
        player_results: updatedResults,
        best_moves: [],
      });
    expect(completeProtocolRes.status).toBe(200);
  });

  // 16. Correction mode restrictions & editing rules
  it('16. Correction mode: metadata editing, judge/role change rules on completed vs draft game, and re-completion', async () => {
    const validParticipants = playerIds.map((id, idx) => ({ player_id: id, display_name: `Игрок ${idx + 1}` }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Проверки Режима Корректировки',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    // Start tournament
    await request(app).post(`/api/tournaments/${tournamentId}/start`).set('Cookie', organizerCookie);

    // Get game 1
    const tDetail = await request(app).get(`/api/tournaments/${tournamentId}`).set('Cookie', organizerCookie);
    const game1 = tDetail.body.games.find((g: any) => g.game_number === 1);
    const gameId = game1.id;

    // Set roles and start game 1
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
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    await request(app).post(`/api/tournaments/${tournamentId}/games/${gameId}/start`).set('Cookie', organizerCookie);

    // Complete game 1 protocol
    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const playerResults = seats.map((s: any) => ({
      participant_id: s.participant_id,
      seat_number: s.seat_number,
      exit_type: 'alive',
      regular_fouls: 0,
      minor_technical_fouls: 0,
      major_technical_fouls: 0,
      protocol_bonus: 0,
    }));

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red', end_reason: 'normal' },
        player_results: playerResults,
        best_moves: [],
      });

    // Mark tournament completed
    await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);

    // 1. Direct metadata patch in completed status MUST FAIL (400)
    const patchCompleted = await request(app)
      .patch(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie)
      .send({ title: 'Попытка изменения в completed' });
    expect(patchCompleted.status).toBe(400);

    // 2. Reopen tournament for correction
    const reopen = await request(app)
      .post(`/api/tournaments/${tournamentId}/reopen-for-correction`)
      .set('Cookie', organizerCookie);
    expect(reopen.status).toBe(200);
    expect(reopen.body.status).toBe('correction');

    // 3. Metadata patch in correction status MUST SUCCEED (200)
    const patchCorrection = await request(app)
      .patch(`/api/tournaments/${tournamentId}`)
      .set('Cookie', organizerCookie)
      .send({ title: 'Турнир после корректировки' });
    expect(patchCorrection.status).toBe(200);
    expect(patchCorrection.body.title).toBe('Турнир после корректировки');

    // 4. Changing judge/roles on game 1 (game status: completed) MUST FAIL with specific error
    const judgeChangeFail = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/judge`)
      .set('Cookie', organizerCookie)
      .send({ judge_name: 'Новый Судья' });
    expect(judgeChangeFail.status).toBe(400);
    expect(judgeChangeFail.body.error).toContain('Сначала необходимо вернуть протокол игры в черновик');

    const roleChangeFail = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles });
    expect(roleChangeFail.status).toBe(400);
    expect(roleChangeFail.body.error).toContain('Сначала необходимо вернуть протокол игры в черновик');

    // 5. Revert game 1 protocol to draft
    const revertRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/revert-to-draft`)
      .set('Cookie', organizerCookie);
    expect(revertRes.status).toBe(200);

    // 6. Now changing judge and roles MUST SUCCEED
    const judgeChangeSuccess = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/judge`)
      .set('Cookie', organizerCookie)
      .send({ judge_name: 'Судья Корректировки' });
    expect(judgeChangeSuccess.status).toBe(200);
    expect(judgeChangeSuccess.body.judge_name).toBe('Судья Корректировки');

    const newRoles = [...roles];
    newRoles[6] = { seat_number: 7, role: 'don' }; // swap sheriff and don
    newRoles[9] = { seat_number: 10, role: 'sheriff' };

    const roleChangeSuccess = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: newRoles });
    expect(roleChangeSuccess.status).toBe(200);

    // 7. Re-complete protocol, mark all games completed, and re-complete tournament
    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red', end_reason: 'normal' },
        player_results: playerResults,
        best_moves: [],
      });

    // Mark all games and protocols in tournament as completed for test completion readiness
    const allGames = await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    for (const g of allGames) {
      await db.run("UPDATE tournament_games SET status = 'completed' WHERE id = ?", [g.id]);
      const proto = await db.get<any>('SELECT id FROM tournament_game_protocols WHERE game_id = ?', [g.id]);
      if (!proto) {
        await db.run(
          `INSERT INTO tournament_game_protocols (id, game_id, winner_team, end_reason, status, created_at, updated_at, completed_at)
           VALUES (?, ?, 'red', 'normal', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [`proto_${g.id}`, g.id]
        );
        const gSeats = await db.all<any>('SELECT participant_id FROM tournament_game_seats WHERE game_id = ?', [g.id]);
        for (const s of gSeats) {
          await db.run(
            `INSERT INTO tournament_game_player_results (id, game_id, participant_id, exit_type, regular_fouls, minor_technical_fouls, major_technical_fouls, protocol_bonus)
             VALUES (?, ?, ?, 'alive', 0, 0, 0, 0)`,
            [`res_${g.id}_${s.participant_id}`, g.id, s.participant_id]
          );
        }
      } else {
        await db.run("UPDATE tournament_game_protocols SET status = 'completed', winner_team = 'red' WHERE id = ?", [proto.id]);
      }
    }

    const completeTournament = await request(app)
      .post(`/api/tournaments/${tournamentId}/complete`)
      .set('Cookie', organizerCookie);
    expect(completeTournament.status).toBe(200);
    expect(completeTournament.body.status).toBe('completed');
  });
});
