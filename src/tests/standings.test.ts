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
      title: 'Турнир для тестирования Таблицы',
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

  // Start tournament
  const startTRes = await request(app)
    .post(`/api/tournaments/${tournamentId}/start`)
    .set('Cookie', organizerCookie);

  expect(startTRes.status).toBe(200);

  // Set standard roles for game 1
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
  const startGame1Res = await request(app)
    .post(`/api/tournaments/${tournamentId}/games/${game1Id}/start`)
    .set('Cookie', organizerCookie);

  expect(startGame1Res.status).toBe(200);

  // Get seats for game 1
  const detailRes = await request(app)
    .get(`/api/tournaments/${tournamentId}`)
    .set('Cookie', organizerCookie);
  const game1Obj = detailRes.body.games.find((g: any) => g.id === game1Id);
  game1Seats = game1Obj.seats;
});

describe('Tournament Standings Endpoint & Formula Calculations', () => {
  it('GET /api/tournaments/:tournamentId/standings returns 200 with empty completed stats initially', async () => {
    const res = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    expect(res.status).toBe(200);
    expect(res.body.tournament_id).toBe(tournamentId);
    expect(res.body.standings).toBeDefined();
    expect(res.body.standings.length).toBe(10);
    expect(res.body.standings[0].total_points).toBe(0);
    expect(res.body.standings[0].games_played).toBe(0);
  });

  it('returns 404 for non-existent tournament standings', async () => {
    const res = await request(app)
      .get('/api/tournaments/non-existent-id/standings')
      .set('Cookie', organizerCookie);

    expect(res.status).toBe(404);
  });

  it('ignores draft protocols in standings calculations', async () => {
    // Save draft for game 1
    const playerResultsDraft = game1Seats.map((seat) => ({
      participant_id: seat.participant_id,
      role: seat.role || 'citizen',
      exit_type: 'alive',
      regular_fouls: 0,
      technical_fouls: 0,
      protocol_bonus: 0.5,
      judge_bonus: 0.5,
      penalty_points: 0,
      ci_points: 0,
    }));

    await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/draft`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
        },
        player_results: playerResultsDraft,
      });

    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    expect(standingsRes.status).toBe(200);
    // Games played should still be 0 since protocol is draft
    expect(standingsRes.body.standings[0].games_played).toBe(0);
    expect(standingsRes.body.standings[0].total_points).toBe(0);
  });

  it('calculates total_points, additional_total, positive_points, wins correctly on completed game', async () => {
    // Complete game 1 where Red wins
    // seat 0 is Red (win=1), judge_bonus=0.2, protocol_bonus=0.3, penalty_points=0.1
    // positive_points = 0.5, best_move = 0, penalty = 0.1 => additional_total = 0.4
    // total_points = 1 (win) + 0.4 (additional_total) + 0.5 (ci) = 1.9
    const p0Id = game1Seats[0].participant_id;

    const playerResultsComplete = game1Seats.map((seat, idx) => ({
      participant_id: seat.participant_id,
      role: seat.role,
      exit_type: idx === 0 ? 'killed' : 'alive',
      regular_fouls: 0,
      technical_fouls: 0,
      protocol_bonus: idx === 0 ? 0.3 : 0,
      judge_bonus: idx === 0 ? 0.2 : 0,
      penalty_points: idx === 0 ? 0.1 : 0,
      ci_points: idx === 0 ? 0.5 : 0,
    }));

    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: p0Id,
        },
        player_results: playerResultsComplete,
      });

    expect(completeRes.status).toBe(200);

    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    expect(standingsRes.status).toBe(200);

    const p0Standing = standingsRes.body.standings.find(
      (s: any) => s.participant_id === p0Id
    );

    expect(p0Standing).toBeDefined();
    expect(p0Standing.games_played).toBe(1);
    expect(p0Standing.wins).toBe(1);
    expect(p0Standing.positive_points).toBe(0.5);
    expect(p0Standing.penalty_points).toBe(0.1);
    expect(p0Standing.ci_points).toBe(0.5);
    expect(p0Standing.additional_total).toBe(0.4); // 0.5 - 0.1
    expect(p0Standing.total_points).toBe(1.9); // 1 + 0.4 + 0.5 = 1.9
  });

  it('only adds ci_points to first_killed_participant_id and ignores ci_points sent for other players', async () => {
    const p0Id = game1Seats[0].participant_id;
    const p1Id = game1Seats[1].participant_id;

    const playerResultsComplete = game1Seats.map((seat, idx) => ({
      participant_id: seat.participant_id,
      role: seat.role,
      exit_type: idx === 0 ? 'killed' : 'alive',
      regular_fouls: 0,
      technical_fouls: 0,
      protocol_bonus: 0,
      judge_bonus: 0,
      penalty_points: 0,
      ci_points: idx === 0 ? 0.8 : 0, // only send for first killed
    }));

    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: p0Id,
        },
        player_results: playerResultsComplete,
      });

    expect(completeRes.status).toBe(200);

    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    const p0Standing = standingsRes.body.standings.find(
      (s: any) => s.participant_id === p0Id
    );
    const p1Standing = standingsRes.body.standings.find(
      (s: any) => s.participant_id === p1Id
    );

    expect(p0Standing.ci_points).toBe(0.8);
    expect(p1Standing.ci_points).toBe(0);
  });

  it('sorts standings by total_points DESC, additional_total DESC, wins DESC, participant_number ASC', async () => {
    const p0Id = game1Seats[0].participant_id;
    const p1Id = game1Seats[1].participant_id;

    const playerResultsComplete = game1Seats.map((seat, idx) => ({
      participant_id: seat.participant_id,
      role: seat.role,
      exit_type: 'alive',
      regular_fouls: 0,
      technical_fouls: 0,
      protocol_bonus: idx === 0 ? 0.3 : idx === 1 ? 0.2 : 0,
      judge_bonus: idx === 0 ? 0.2 : 0,
      penalty_points: 0,
      ci_points: 0,
    }));

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          winner_team: 'red',
        },
        player_results: playerResultsComplete,
      });

    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    const standings = standingsRes.body.standings;

    // First place should be p0Id with highest total points
    expect(standings[0].participant_id).toBe(p0Id);
    expect(standings[0].place).toBe(1);

    // Second place should be p1Id
    expect(standings[1].participant_id).toBe(p1Id);
    expect(standings[1].place).toBe(2);
  });

  it('reverting protocol to draft updates standings immediately', async () => {
    const playerResultsComplete = game1Seats.map((seat) => ({
      participant_id: seat.participant_id,
      role: seat.role,
      exit_type: 'alive',
      regular_fouls: 0,
      technical_fouls: 0,
      protocol_bonus: 0.4,
      judge_bonus: 0.1,
      penalty_points: 0,
      ci_points: 0,
    }));

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: playerResultsComplete,
      });

    let standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    expect(standingsRes.body.standings[0].games_played).toBe(1);

    // Revert protocol to draft
    const revertRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/revert-to-draft`)
      .set('Cookie', organizerCookie);

    expect(revertRes.status).toBe(200);

    standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    // Standings should be updated (games_played back to 0)
    expect(standingsRes.body.standings[0].games_played).toBe(0);
    expect(standingsRes.body.standings[0].total_points).toBe(0);
  });

  it('includes individual games breakdown in items', async () => {
    const playerResultsComplete = game1Seats.map((seat) => ({
      participant_id: seat.participant_id,
      role: seat.role,
      exit_type: 'alive',
      regular_fouls: 0,
      technical_fouls: 0,
      protocol_bonus: 0.1,
      judge_bonus: 0.1,
      penalty_points: 0,
      ci_points: 0,
    }));

    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { winner_team: 'red' },
        player_results: playerResultsComplete,
      });

    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);

    const p0Item = standingsRes.body.standings.find((s: any) => s.participant_id === game1Seats[0].participant_id);
    expect(p0Item.games).toBeDefined();
    expect(p0Item.games.length).toBe(1);
    expect(p0Item.games[0].game_number).toBe(1);
    expect(p0Item.games[0].win_point).toBe(1);
  });
});
