import { it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

let app: any;
let db: DatabaseWrapper;
let organizerCookie: string;
let tournamentId: string;
let gameId: string;
let playerIds: string[] = [];
let gameSeats: any[] = [];

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);
  const token = generateOrganizerToken();
  organizerCookie = `organizer_token=${token}`;

  playerIds = [];
  const participantsInput: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const pid = `test-player-uuid-${i}`;
    await db.run(
      `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at) VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
      [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
    );
    playerIds.push(pid);
    participantsInput.push({ player_id: pid, display_name: `P${i}` });
  }

  const tourRes = await request(app)
    .post('/api/tournaments')
    .set('Cookie', organizerCookie)
    .send({
      title: 'Discipline Tournament',
      date: new Date().toISOString(),
      participants: participantsInput
    });
  tournamentId = tourRes.body.id;

  const seatingRes = await request(app)
    .post(`/api/tournaments/${tournamentId}/generate-seating`)
    .set('Cookie', organizerCookie);
  
  const g = seatingRes.body.games[0];
  gameId = g.id;
  gameSeats = g.seats;
  
  await request(app)
    .post(`/api/tournaments/${tournamentId}/start`)
    .set('Cookie', organizerCookie);

  // Set roles
  const roles = ['citizen', 'citizen', 'citizen', 'sheriff', 'citizen', 'citizen', 'citizen', 'mafia', 'don', 'mafia'];
  const formattedRoles = roles.map((role, idx) => ({ seat_number: idx + 1, role }));
  
  await request(app)
    .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
    .set('Cookie', organizerCookie)
    .send({ roles: formattedRoles });
    
  await request(app)
    .post(`/api/tournaments/${tournamentId}/games/${gameId}/start`)
    .set('Cookie', organizerCookie);

  // Refetch seats
  gameSeats = await db.all<any>("SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC", [gameId]);
  gameSeats = gameSeats.map((s, idx) => ({ ...s, role: roles[idx] }));
});

it('Disciplinary rules test', async () => {
  const p1 = gameSeats[0];

  // 1, 5, 6: Minor + major + removed -> disc 1.9, ignores client disciplinary_penalty_points, GET returns new fields
  const draftRes = await request(app)
    .put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
    .set('Cookie', organizerCookie)
    .send({
      protocol: {
        end_reason: 'normal',
        first_killed_participant_id: gameSeats[1].participant_id
      },
      player_results: gameSeats.map((s) => {
        if (s.participant_id === p1.participant_id) {
          return {
            participant_id: s.participant_id,
            exit_type: 'removed',
            minor_technical_fouls: 1,
            major_technical_fouls: 1,
            regular_fouls: 3,
            removal_reason: '2nd_tech',
            penalty_points: 0.25,
            disciplinary_penalty_points: 0 // Client tries to cheat
          };
        }
        return {
          participant_id: s.participant_id,
          exit_type: s.participant_id === gameSeats[1].participant_id ? 'killed' : 'alive'
        };
      })
    });
  expect(draftRes.status).toBe(200);

  const getRes = await request(app)
    .get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
    .set('Cookie', organizerCookie);
  
  const savedP1 = getRes.body.player_results.find((p: any) => p.participant_id === p1.participant_id);
  expect(savedP1.minor_technical_fouls).toBe(1);
  expect(savedP1.major_technical_fouls).toBe(1);
  expect(savedP1.technical_fouls).toBe(2);
  expect(savedP1.removal_reason).toBe('2nd_tech');
  expect(savedP1.disciplinary_penalty_points).toBe(1.9); // 1*0.3 + 1*0.6 + 1.0
  expect(savedP1.penalty_points).toBe(0.25);
  
  // 4: PPK culprit red -> black wins, gives +1 disc
  const ppkRes = await request(app)
    .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
    .set('Cookie', organizerCookie)
    .send({
      protocol: {
        end_reason: 'ppk',
        ppk_culprit_participant_id: p1.participant_id,
        first_killed_participant_id: gameSeats[1].participant_id
      },
      player_results: gameSeats.map((s) => {
        if (s.participant_id === p1.participant_id) {
          return {
            participant_id: s.participant_id,
            exit_type: 'removed',
            minor_technical_fouls: 1,
            major_technical_fouls: 1,
            regular_fouls: 3,
            removal_reason: '2nd_tech',
            penalty_points: 0.25
          };
        }
        return {
          participant_id: s.participant_id,
          exit_type: s.participant_id === gameSeats[1].participant_id ? 'killed' : 'alive'
        };
      })
    });
  expect(ppkRes.status).toBe(200);

  const finalRes = await request(app)
    .get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
    .set('Cookie', organizerCookie);
  
  expect(finalRes.body.protocol.winner_team).toBe('black'); // Culprit was 'citizen' (red)
  
  const finalP1 = finalRes.body.player_results.find((p: any) => p.participant_id === p1.participant_id);
  expect(finalP1.disciplinary_penalty_points).toBe(2.9); // 1.9 + 1.0 (ppk)

  // 2, 3: Standings check
  const standingsRes = await request(app)
    .get(`/api/tournaments/${tournamentId}/standings`)
    .set('Cookie', organizerCookie);
  
  const sp1 = standingsRes.body.standings.find((s: any) => s.participant_id === p1.participant_id);
  
  // Total penalty: 2.9 + 0.25 = 3.15
  expect(sp1.penalty_points).toBe(3.15);
  expect(sp1.game_penalty_points).toBe(0.25);
  expect(sp1.disciplinary_penalty_points).toBe(2.9);
  
  // Nomination penalty: only subtracts game penalty (0.25), disc penalty doesn't affect nomination
  const p1Game = sp1.games[0];
  expect(p1Game.game_penalty_points).toBe(0.25);
  expect(p1Game.disciplinary_penalty_points).toBe(2.9);
  expect(p1Game.penalty_points).toBe(3.15);

  const nomRes = await request(app)
    .get(`/api/tournaments/${tournamentId}/nominations`)
    .set('Cookie', organizerCookie);
  
  const bestCitizen = nomRes.body.nominations.find((n: any) => n.category === 'best_citizen');
  const nP1 = bestCitizen.candidates.find((c: any) => c.participant_id === p1.participant_id);
  expect(nP1.nomination_points).toBe(-0.25);
});
