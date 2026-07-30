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
  // 1. Cannot save other than 10 participants
  it('1. Reject tournament creation with less or more than 10 participants', async () => {
    const nineParticipants = playerIds.slice(0, 9).map((id) => ({ player_id: id }));

    const res = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тестовый Турнир 9',
        date: new Date().toISOString(),
        participants: nineParticipants,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('10 участников');
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

  // 10. Failed roster update leaves previous participants intact (Transaction Rollback)
  it('10. Roster update failure rolls back without clearing existing participants', async () => {
    const validParticipants = playerIds.map((id) => ({ player_id: id }));
    const createRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Турнир Откат Транзакции',
        date: new Date().toISOString(),
        participants: validParticipants,
      });

    const tournamentId = createRes.body.id;

    // Attempt to update roster with non-existent player ID -> Fails
    const badUpdate = await request(app)
      .put(`/api/tournaments/${tournamentId}/participants`)
      .set('Cookie', organizerCookie)
      .send({
        participants: [
          ...playerIds.slice(0, 9).map((id) => ({ player_id: id })),
          { player_id: 'non-existent-player-uuid' },
        ],
      });

    expect(badUpdate.status).toBe(400);

    // Verify original 10 participants are still intact
    const detailRes = await request(app).get(`/api/tournaments/${tournamentId}`);
    expect(detailRes.body.participants.length).toBe(10);
  });
});
