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
let game2Seats: any[] = [];

beforeEach(async () => {
  // Always use an isolated in-memory database
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);

  const token = generateOrganizerToken();
  organizerCookie = `organizer_token=${token}`;

  // Create 10 isolated test players
  playerIds = [];
  const participantsInput: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const pid = `day-readiness-player-uuid-${i}`;
    await db.run(
      `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
       VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
      [pid, `ТестИгрок_${i}`, `+7900111223${i}`, new Date().toISOString(), new Date().toISOString()]
    );
    playerIds.push(pid);
    participantsInput.push({ player_id: pid, display_name: `Участник ${i}` });
  }

  // Create test tournament with unique title
  const createRes = await request(app)
    .post('/api/tournaments')
    .set('Cookie', organizerCookie)
    .send({
      title: 'Предтурнирный Интеграционный Прогон 1.08',
      date: new Date().toISOString(),
      venue: 'Зал Тестовый',
      stage: 'Финал',
      participants: participantsInput,
    });

  expect(createRes.status).toBe(201);
  tournamentId = createRes.body.id;

  // Generate seating (creates 10 games)
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

  // Set standard roles for game 1:
  // Seats 1..6 = citizen, Seat 7 = sheriff, Seats 8..9 = mafia, Seat 10 = don
  const standardRoles = [
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
    .send({ roles: standardRoles });

  await request(app)
    .patch(`/api/tournaments/${tournamentId}/games/${game2Id}/roles`)
    .set('Cookie', organizerCookie)
    .send({ roles: standardRoles });

  // Start game 1
  const startGame1Res = await request(app)
    .post(`/api/tournaments/${tournamentId}/games/${game1Id}/start`)
    .set('Cookie', organizerCookie);
  expect(startGame1Res.status).toBe(200);

  const detailRes = await request(app)
    .get(`/api/tournaments/${tournamentId}`)
    .set('Cookie', organizerCookie);

  const g1Obj = detailRes.body.games.find((g: any) => g.id === game1Id);
  game1Seats = g1Obj.seats;

  const g2Obj = detailRes.body.games.find((g: any) => g.id === game2Id);
  game2Seats = g2Obj.seats;
});

describe('Tournament Day Readiness - Critical User Scenario Integration Audit', () => {

  // ==========================================
  // 1. Обычное заполнение протокола
  // ==========================================
  describe('1. Обычное заполнение протокола', () => {
    it('сохраняет черновик, загружает его без потерь и завершает победой красных', async () => {
      // 1-3. Game is ready, 10 seats assigned, 3 black roles assigned
      const draftPayload = {
        protocol: {
          winner_team: 'red',
          judge_notes: 'Черновик первой игры',
        },
        player_results: game1Seats.map((s, idx) => ({
          participant_id: s.participant_id,
          exit_type: idx === 0 ? 'killed' : 'alive',
          regular_fouls: idx === 1 ? 1 : 0,
        })),
      };

      // 4. Save protocol as draft
      const saveRes = await request(app)
        .put(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie)
        .send(draftPayload);

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.protocol.status).toBe('draft');
      expect(saveRes.body.protocol.winner_team).toBe('red');

      // 5. GET request returns all entered data without loss
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.protocol.status).toBe('draft');
      expect(getRes.body.protocol.winner_team).toBe('red');
      expect(getRes.body.protocol.judge_notes).toBe('Черновик первой игры');
      expect(getRes.body.player_results).toHaveLength(10);
      const pr1 = getRes.body.player_results.find((p: any) => p.participant_id === game1Seats[1].participant_id);
      expect(pr1.regular_fouls).toBe(1);

      // 6. Complete game with ordinary red victory
      const completeRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(draftPayload);

      expect(completeRes.status).toBe(200);

      // 8. Check game status, winner_team, roles and player results are saved
      const getCompletedRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getCompletedRes.body.protocol.status).toBe('completed');
      expect(getCompletedRes.body.protocol.winner_team).toBe('red');
      expect(getCompletedRes.body.game.status).toBe('completed');

      // 9. Tournament standings table recalculated exactly once
      const standingsRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      expect(standingsRes.status).toBe(200);
      expect(standingsRes.body.completed_games_count).toBe(1);
      expect(standingsRes.body.standings).toHaveLength(10);
    });

    it('завершает игру победой чёрных в отдельном тесте', async () => {
      const payloadBlackWin = {
        protocol: {
          winner_team: 'black',
          judge_notes: 'Победа чёрных по регламенту',
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
        })),
      };

      const completeRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(payloadBlackWin);

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.protocol.winner_team).toBe('black');
      expect(completeRes.body.game.winner_team).toBe('black');

      const standingsRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      expect(standingsRes.body.completed_games_count).toBe(1);
    });
  });

  // ==========================================
  // 2. PPK and Disciplinary Sanctions
  // ==========================================
  describe('2. ППК и дисциплинарные санкции', () => {
    it('автоматически назначает победу чёрным при ППК красного игрока и даёт штраф -1', async () => {
      const redParticipantId = game1Seats[0].participant_id; // Seat 1 is citizen (red)

      const ppkPayload = {
        protocol: {
          end_reason: 'ppk',
          ppk_culprit_participant_id: redParticipantId,
          judge_notes: 'ППК красного игрока',
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === redParticipantId ? 'alive' : 'alive',
        })),
      };

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(ppkPayload);

      expect(res.status).toBe(200);
      // Winner automatically assigned as black
      expect(res.body.protocol.winner_team).toBe('black');
      expect(res.body.protocol.end_reason).toBe('ppk');
      expect(res.body.protocol.ppk_culprit_participant_id).toBe(redParticipantId);

      // Culprit gets 1.0 disciplinary penalty
      const culpritResult = res.body.player_results.find((p: any) => p.participant_id === redParticipantId);
      expect(culpritResult.disciplinary_penalty_points).toBe(1.0);

      // GET verification
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getRes.body.protocol.end_reason).toBe('ppk');
      expect(getRes.body.protocol.ppk_culprit_participant_id).toBe(redParticipantId);
      expect(getRes.body.protocol.winner_team).toBe('black');
    });

    it('автоматически назначает победу красным при ППК чёрного игрока', async () => {
      const blackParticipantId = game1Seats[7].participant_id; // Seat 8 is mafia (black)

      const ppkPayload = {
        protocol: {
          end_reason: 'ppk',
          ppk_culprit_participant_id: blackParticipantId,
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
        })),
      };

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(ppkPayload);

      expect(res.status).toBe(200);
      expect(res.body.protocol.winner_team).toBe('red');
      expect(res.body.protocol.ppk_culprit_participant_id).toBe(blackParticipantId);

      const culpritResult = res.body.player_results.find((p: any) => p.participant_id === blackParticipantId);
      expect(culpritResult.disciplinary_penalty_points).toBe(1.0);
    });

    it('суммирует дисциплинарный штраф -2 (-1 за удаление + -1 за ППК) для виновника с exit_type = removed', async () => {
      const redCulpritId = game1Seats[0].participant_id;

      const payload = {
        protocol: {
          end_reason: 'ppk',
          ppk_culprit_participant_id: redCulpritId,
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === redCulpritId ? 'removed' : 'alive',
          removal_reason: s.participant_id === redCulpritId ? 'direct' : null,
        })),
      };

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(payload);

      expect(res.status).toBe(200);
      const culpritResult = res.body.player_results.find((p: any) => p.participant_id === redCulpritId);
      // 1.0 (removal) + 1.0 (PPK) = 2.0
      expect(culpritResult.disciplinary_penalty_points).toBe(2.0);

      // Verify GET reloads intact
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      const reloadedCulprit = getRes.body.player_results.find((p: any) => p.participant_id === redCulpritId);
      expect(reloadedCulprit.exit_type).toBe('removed');
      expect(reloadedCulprit.removal_reason).toBe('direct');
      expect(reloadedCulprit.disciplinary_penalty_points).toBe(2.0);
    });
  });

  // ==========================================
  // 3. Technical Fouls and Removal
  // ==========================================
  describe('3. Технические фолы и удаление', () => {
    it('рассчитывает малый техфол (-0.3), большой техфол (-0.6), удаление за 2 техфола (-1.6) и прямое удаление (-1.0)', async () => {
      const p1Id = game1Seats[0].participant_id; // 1 minor tech foul
      const p2Id = game1Seats[1].participant_id; // 1 major tech foul
      const p3Id = game1Seats[2].participant_id; // 2 minor tech fouls causing removal
      const p4Id = game1Seats[3].participant_id; // direct removal by judge

      const payload = {
        protocol: {
          winner_team: 'red',
        },
        player_results: game1Seats.map((s) => {
          if (s.participant_id === p1Id) {
            return { participant_id: s.participant_id, minor_technical_fouls: 1, exit_type: 'alive' };
          }
          if (s.participant_id === p2Id) {
            return { participant_id: s.participant_id, major_technical_fouls: 1, exit_type: 'alive' };
          }
          if (s.participant_id === p3Id) {
            return {
              participant_id: s.participant_id,
              minor_technical_fouls: 2,
              exit_type: 'removed',
              removal_reason: '2nd_tech',
            };
          }
          if (s.participant_id === p4Id) {
            return {
              participant_id: s.participant_id,
              exit_type: 'removed',
              removal_reason: 'direct',
            };
          }
          return { participant_id: s.participant_id, exit_type: 'alive' };
        }),
      };

      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(payload);

      expect(res.status).toBe(200);

      const pr1 = res.body.player_results.find((p: any) => p.participant_id === p1Id);
      const pr2 = res.body.player_results.find((p: any) => p.participant_id === p2Id);
      const pr3 = res.body.player_results.find((p: any) => p.participant_id === p3Id);
      const pr4 = res.body.player_results.find((p: any) => p.participant_id === p4Id);

      expect(pr1.disciplinary_penalty_points).toBe(0.3);
      expect(pr2.disciplinary_penalty_points).toBe(0.6);
      // 0.3 + 0.3 + 1.0 (removal) = 1.6
      expect(pr3.disciplinary_penalty_points).toBe(1.6);
      expect(pr4.disciplinary_penalty_points).toBe(1.0);

      // GET reload verification
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      const reload3 = getRes.body.player_results.find((p: any) => p.participant_id === p3Id);
      expect(reload3.minor_technical_fouls).toBe(2);
      expect(reload3.exit_type).toBe('removed');
      expect(reload3.removal_reason).toBe('2nd_tech');
      expect(reload3.disciplinary_penalty_points).toBe(1.6);
    });
  });

  // ==========================================
  // 4. Separation of Game and Disciplinary Penalties
  // ==========================================
  describe('4. Разделение игровых и дисциплинарных штрафов', () => {
    it('разделяет penalty_points и disciplinary_penalty_points без взаимного подмешивания в standings и nominations', async () => {
      const p1Id = game1Seats[0].participant_id;

      const payload = {
        protocol: {
          winner_team: 'red',
        },
        player_results: game1Seats.map((s) => {
          if (s.participant_id === p1Id) {
            return {
              participant_id: s.participant_id,
              penalty_points: 0.2, // Игровой штраф (влияет на дополнительный балл и номинации)
              minor_technical_fouls: 1, // Дисциплинарный штраф 0.3
              exit_type: 'alive',
            };
          }
          return { participant_id: s.participant_id, exit_type: 'alive' };
        }),
      };

      const completeRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(payload);

      expect(completeRes.status).toBe(200);

      const pr1 = completeRes.body.player_results.find((p: any) => p.participant_id === p1Id);
      expect(pr1.judge_bonus).toBe(-0.2);
      expect(pr1.penalty_points).toBe(0);
      expect(pr1.disciplinary_penalty_points).toBe(0.3);

      // 1. Check Standings
      const standingsRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      const st1 = standingsRes.body.standings.find((s: any) => s.participant_id === p1Id);
      expect(st1.game_penalty_points).toBe(0.2);
      expect(st1.disciplinary_penalty_points).toBe(0.3);
      expect(st1.penalty_points).toBe(0.5); // sum of both penalties: 0.2 (game) + 0.3 (disciplinary)
      expect(st1.additional_total).toBe(-0.5); // -0.2 (judge_bonus) - 0.3 (disciplinary)
      expect(st1.total_points).toBe(0.5);

      // 2. Check Nominations API
      const nominationsRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/nominations`)
        .set('Cookie', organizerCookie);

      expect(nominationsRes.status).toBe(200);

      const bestCitizenCategory = nominationsRes.body.nominations.find((n: any) => n.category === 'best_citizen');
      expect(bestCitizenCategory).toBeDefined();

      const candidateP1 = bestCitizenCategory.candidates.find((c: any) => c.participant_id === p1Id);
      expect(candidateP1).toBeDefined();

      // Check candidate's judge_bonus is -0.2
      expect(candidateP1.judge_bonus).toBe(-0.2);
      // nomination_points = -0.2
      expect(candidateP1.nomination_points).toBe(-0.2);

      // Check breakdown
      expect(candidateP1.breakdown).toHaveLength(1);
      expect(candidateP1.breakdown[0].judge_bonus).toBe(-0.2);
      expect(candidateP1.breakdown[0].nomination_points).toBe(-0.2);
    });
  });

  // ==========================================
  // 5. Best Moves
  // ==========================================
  describe('5. Лучшие ходы (best_moves)', () => {
    it('сохраняет один лучший ход и правильно его рассчитывает', async () => {
      const pFirstKilled = game1Seats[0].participant_id;

      const singleBmPayload = {
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: pFirstKilled,
          best_moves: [
            {
              participant_id: pFirstKilled,
              source: 'first_killed',
              seat_numbers: [8, 9, 10], // 3 guessed blacks = 0.6 bonus
            },
          ],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === pFirstKilled ? 'killed' : 'alive',
        })),
      };

      const completeRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(singleBmPayload);

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.protocol.best_moves).toHaveLength(1);
      expect(completeRes.body.protocol.best_moves[0].bonus_points).toBe(0.6);

      const dbBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game1Id]);
      expect(dbBms).toHaveLength(1);
    });

    it('сохраняет два лучших хода, исключает дублирование в БД и таблице после повторного завершения игры', async () => {
      const pFirstKilled = game1Seats[0].participant_id; // Seat 1
      const pZeroRoundVoted = game1Seats[1].participant_id; // Seat 2

      // Best move 1: first killed player picks seats 8, 9, 10 => 3 guessed blacks = 0.6 bonus
      // Best move 2: zero round voted player picks seats 8, 9 => 2 guessed blacks = 0.3 bonus
      const payload = {
        protocol: {
          winner_team: 'red',
          first_killed_participant_id: pFirstKilled,
          zero_round_voted_participant_id: pZeroRoundVoted,
          best_moves: [
            {
              participant_id: pFirstKilled,
              source: 'first_killed',
              seat_numbers: [8, 9, 10],
            },
            {
              participant_id: pZeroRoundVoted,
              source: 'zero_round_voted',
              seat_numbers: [8, 9],
            },
          ],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type:
            s.participant_id === pFirstKilled
              ? 'killed'
              : s.participant_id === pZeroRoundVoted
              ? 'voted_zero_round'
              : 'alive',
        })),
      };

      // 1. Initial completion
      const completeRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(payload);

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.protocol.best_moves).toHaveLength(2);

      // 2. Revert to draft
      const revertRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/revert-to-draft`)
        .set('Cookie', organizerCookie);
      expect(revertRes.status).toBe(200);

      // 3. Re-complete game with identical best_moves
      const reCompleteRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(payload);

      expect(reCompleteRes.status).toBe(200);

      // 4. Check direct DB records (must be exactly 2 rows, not 4)
      const dbBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game1Id]);
      expect(dbBms).toHaveLength(2);

      // 5. Check GET protocol API
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getRes.body.protocol.best_moves).toHaveLength(2);

      // 6. Check Standings API (points must be 0.6 and 0.3, not doubled to 1.2 and 0.6)
      const standingsRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      const stFK = standingsRes.body.standings.find((s: any) => s.participant_id === pFirstKilled);
      const stZR = standingsRes.body.standings.find((s: any) => s.participant_id === pZeroRoundVoted);

      expect(stFK.best_move_points).toBe(0.6);
      expect(stZR.best_move_points).toBe(0.3);
    });
  });

  // ==========================================
  // 6. Correction of Completed Game & Tournament
  // ==========================================
  describe('6. Исправление завершённой игры и турнира', () => {
    it('позволяет вернуть игру в черновик, исправить данные, завершить повторно и не дублирует баллы', async () => {
      // 1-2. Complete initial game with Red victory
      const initialPayload = {
        protocol: { winner_team: 'red' },
        player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
      };

      await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(initialPayload);

      const standings1 = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      expect(standings1.body.completed_games_count).toBe(1);

      // 3. Revert game to draft
      const revertRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/revert-to-draft`)
        .set('Cookie', organizerCookie);

      expect(revertRes.status).toBe(200);
      expect(revertRes.body.game.status).toBe('active');
      expect(revertRes.body.protocol.status).toBe('draft');

      // 4. Update protocol data (switch winner team to Black and add a foul)
      const correctedPayload = {
        protocol: { winner_team: 'black', judge_notes: 'Исправлено организатором' },
        player_results: game1Seats.map((s, idx) => ({
          participant_id: s.participant_id,
          exit_type: 'alive',
          minor_technical_fouls: idx === 0 ? 1 : 0,
        })),
      };

      // 5. Re-complete game
      const reCompleteRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(correctedPayload);

      expect(reCompleteRes.status).toBe(200);
      expect(reCompleteRes.body.protocol.winner_team).toBe('black');

      // 6-8. Points not duplicated, new calculation replaces old completely
      const standings2 = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      expect(standings2.body.completed_games_count).toBe(1);
      const st0 = standings2.body.standings.find((s: any) => s.participant_id === game1Seats[0].participant_id);
      expect(st0.disciplinary_penalty_points).toBe(0.3);
    });

    it('поддерживает reopening завершённого турнира для исправления протокола и повторного завершения', async () => {
      const pFirstKilled = game1Seats[0].participant_id;
      const redCulpritId = game1Seats[1].participant_id;

      // 1. Complete game with PPK, best moves, fouls
      const fullPayload = {
        protocol: {
          end_reason: 'ppk',
          ppk_culprit_participant_id: redCulpritId,
          first_killed_participant_id: pFirstKilled,
          best_moves: [
            {
              participant_id: pFirstKilled,
              source: 'first_killed',
              seat_numbers: [8, 9, 10],
            },
          ],
        },
        player_results: game1Seats.map((s) => ({
          participant_id: s.participant_id,
          exit_type: s.participant_id === pFirstKilled ? 'killed' : 'alive',
          minor_technical_fouls: s.participant_id === game1Seats[2].participant_id ? 1 : 0,
        })),
      };

      const completeRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(fullPayload);

      expect(completeRes.status).toBe(200);

      // 2. Mark tournament completed
      await db.run("UPDATE tournaments SET status = 'completed' WHERE id = ?", [tournamentId]);

      // 3. Organizer reopens tournament for correction
      const reopenRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/reopen-for-correction`)
        .set('Cookie', organizerCookie);

      expect(reopenRes.status).toBe(200);

      const tournamentDetail = await request(app)
        .get(`/api/tournaments/${tournamentId}`)
        .set('Cookie', organizerCookie);

      expect(tournamentDetail.body.status).toBe('correction');

      // 4. Return game to draft
      const revertRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/revert-to-draft`)
        .set('Cookie', organizerCookie);

      expect(revertRes.status).toBe(200);

      // 5. Update protocol notes while preserving PPK, best_moves, fouls
      const updatedNotesPayload = {
        ...fullPayload,
        protocol: {
          ...fullPayload.protocol,
          judge_notes: 'Исправление заметок на турнире в статусе correction',
        },
      };

      const reCompleteRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send(updatedNotesPayload);

      expect(reCompleteRes.status).toBe(200);

      // 6. Verify results recalculated without duplication
      const standingsRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/standings`)
        .set('Cookie', organizerCookie);

      expect(standingsRes.body.completed_games_count).toBe(1);

      // 7. Check PPK, best moves, roles and penalties preserved
      const getProtocolRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getProtocolRes.body.protocol.end_reason).toBe('ppk');
      expect(getProtocolRes.body.protocol.ppk_culprit_participant_id).toBe(redCulpritId);
      expect(getProtocolRes.body.protocol.judge_notes).toBe('Исправление заметок на турнире в статусе correction');
      expect(getProtocolRes.body.protocol.best_moves).toHaveLength(1);
    });
  });

  // ==========================================
  // 7. Workflow Protection
  // ==========================================
  describe('7. Защита рабочего процесса', () => {
    it('запрещает одновременно запускать две активные игры в одном турнире', async () => {
      // Game 1 is currently active (started in beforeEach)
      // Attempting to start Game 2 should fail with 400
      const res = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game2Id}/start`)
        .set('Cookie', organizerCookie);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('идет другая игра');
    });

    it('запрещает завершать неготовую игру (планируемую до запуска или без победителя)', async () => {
      // Attempting to complete Game 2 (status = planned)
      const resPlanned = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game2Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send({
          protocol: { winner_team: 'red' },
          player_results: game2Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
        });

      expect(resPlanned.status).toBe(400);
      expect(resPlanned.body.error).toBeDefined();

      // Attempting to complete Game 1 (active) without winner_team
      const resNoWinner = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send({
          protocol: { winner_team: null },
          player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
        });

      expect(resNoWinner.status).toBe(400);
      expect(resNoWinner.body.error).toContain('победившую команду');
    });

    it('возвращает понятные сообщения об ошибках и сохраняет атомарность без неполных записей в БД', async () => {
      // Send invalid payload (e.g., > 3 seats in best move)
      const invalidRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol/complete`)
        .set('Cookie', organizerCookie)
        .send({
          protocol: {
            winner_team: 'red',
            first_killed_participant_id: game1Seats[0].participant_id,
            best_moves: [
              {
                participant_id: game1Seats[0].participant_id,
                source: 'first_killed',
                seat_numbers: [1, 2, 3, 4], // Invalid! Max 3
              },
            ],
          },
          player_results: game1Seats.map((s) => ({ participant_id: s.participant_id, exit_type: 'alive' })),
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error).toBeDefined();

      // Direct SQL checks for DB atomicity
      const dbGame = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [game1Id]);
      expect(dbGame.status).toBe('active');
      expect(dbGame.status).not.toBe('completed');

      const dbProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [game1Id]);
      expect(dbProtocol?.status).not.toBe('completed');

      const dbBms = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [game1Id]);
      expect(dbBms).toHaveLength(0);

      const dbResults = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [game1Id]);
      expect(dbResults).toHaveLength(0);

      // GET API check
      const getRes = await request(app)
        .get(`/api/tournaments/${tournamentId}/games/${game1Id}/protocol`)
        .set('Cookie', organizerCookie);

      expect(getRes.body.protocol.status).toBe('draft');
    });
  });
});
