import re
content = open('src/tests/disciplinePersistence.test.ts', 'r').read()

# I will recreate the test file from scratch with correct game2Id and game2Seats

new_test_content = """import { it, expect, beforeEach, describe } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper, initializeDatabase } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

let app: any;
let db: DatabaseWrapper;
let organizerCookie: string;
let tournamentId: string;
let gameId: string;
let gameSeats: any[] = [];
let game2Id: string;
let game2Seats: any[] = [];

describe('Discipline API', () => {
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    initializeDatabase(db);
    app = await createApp(db);
    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    const participantsInput: any[] = [];
    for (let i = 1; i <= 10; i++) {
      const pid = `test-player-uuid-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at) VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
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

    // Generate two games
    const seatingRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/generate-seating`)
      .set('Cookie', organizerCookie);
    
    gameId = seatingRes.body.games[0].id;
    game2Id = seatingRes.body.games[1].id;
    
    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    // Set roles for both games
    const roles = ['citizen', 'citizen', 'citizen', 'sheriff', 'citizen', 'citizen', 'citizen', 'mafia', 'don', 'mafia'];
    const formattedRoles = roles.map((role, idx) => ({ seat_number: idx + 1, role }));
    
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: formattedRoles });
    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/start`)
      .set('Cookie', organizerCookie);

    // In the old code I didn't actually start game2Id properly if I replaced everything with gameId
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${game2Id}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: formattedRoles });
    await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/start`)
      .set('Cookie', organizerCookie);

    // Refetch seats
    gameSeats = await db.all<any>("SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC", [gameId]);
    gameSeats = gameSeats.map((s, idx) => ({ ...s, role: roles[idx] }));
    game2Seats = await db.all<any>("SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC", [game2Id]);
    game2Seats = game2Seats.map((s, idx) => ({ ...s, role: roles[idx] }));
  });

  it('1. Обычное завершение без ППК: штраф 0.25, 1.9 disc, standings 2.15, noms -0.25', async () => {
    const p1 = gameSeats[0];
    const draftRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          end_reason: 'normal',
          winner_team: 'red',
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
    if (draftRes.status !== 200) console.log(draftRes.body);
    expect(draftRes.status).toBe(200);

    const standingsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/standings`)
      .set('Cookie', organizerCookie);
    const sp1 = standingsRes.body.standings.find((s: any) => s.participant_id === p1.participant_id);
    expect(sp1.penalty_points).toBe(2.15); // 1.9 + 0.25
    expect(sp1.game_penalty_points).toBe(0.25);
    expect(sp1.disciplinary_penalty_points).toBe(1.9);

    const nomsRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/nominations`)
      .set('Cookie', organizerCookie);
    const bestCitizen = nomsRes.body.nominations.find((n: any) => n.category === 'best_citizen');
    const np1 = bestCitizen.candidates.find((c: any) => c.participant_id === p1.participant_id);
    expect(np1.nomination_points).toBe(-0.25);
  });

  it('2. Отдельная игра: удалённый красный получает ППК. Победитель автоматически чёрные, доп штраф 1, итог 2.9', async () => {
    const p1 = game2Seats[0]; // citizen
    const draftRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${game2Id}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          end_reason: 'ppk',
          ppk_culprit_participant_id: p1.participant_id,
          first_killed_participant_id: game2Seats[1].participant_id
        },
        player_results: game2Seats.map((s) => {
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
            exit_type: s.participant_id === game2Seats[1].participant_id ? 'killed' : 'alive'
          };
        })
      });
    if (draftRes.status !== 200) console.log(draftRes.body);
    expect(draftRes.status).toBe(200);
    expect(draftRes.body.protocol.winner_team).toBe('black');

    const pr = draftRes.body.player_results.find((p: any) => p.participant_id === p1.participant_id);
    expect(pr.disciplinary_penalty_points).toBe(2.9);
  });

  it('3. Сервер игнорирует подменённые technical_fouls и disciplinary_penalty_points', async () => {
    const p1 = gameSeats[0];
    const draftRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: {
          end_reason: 'normal'
        },
        player_results: gameSeats.map((s) => {
          if (s.participant_id === p1.participant_id) {
            return {
              participant_id: s.participant_id,
              minor_technical_fouls: 1,
              major_technical_fouls: 1,
              exit_type: 'removed',
              removal_reason: '2nd_tech',
              technical_fouls: 0,
              disciplinary_penalty_points: 0
            };
          }
          return { participant_id: s.participant_id };
        })
      });
    expect(draftRes.status).toBe(200);
    const pr = draftRes.body.player_results.find((p: any) => p.participant_id === p1.participant_id);
    expect(pr.technical_fouls).toBe(2);
    expect(pr.disciplinary_penalty_points).toBe(1.9);
  });

  it('4. Отклоняются дробные, отрицательные техфолы, сумма больше двух и два техфола без удаления', async () => {
    const p1 = gameSeats[0];
    const sendDraft = async (pr: any) => request(app)
      .put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { end_reason: 'normal' },
        player_results: gameSeats.map((s) => s.participant_id === p1.participant_id ? { participant_id: s.participant_id, ...pr } : { participant_id: s.participant_id })
      });

    expect((await sendDraft({ minor_technical_fouls: 1.5 })).status).toBe(400);
    expect((await sendDraft({ minor_technical_fouls: -1 })).status).toBe(400);
    expect((await sendDraft({ minor_technical_fouls: 1, major_technical_fouls: 2 })).status).toBe(400);
    expect((await sendDraft({ minor_technical_fouls: 1, major_technical_fouls: 1, exit_type: 'alive' })).status).toBe(400);
  });

  it('5. Все API-ветки возвращают новые поля', async () => {
    const p1 = gameSeats[0];
    // PUT returns
    const draftRes = await request(app)
      .put(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { end_reason: 'normal' },
        player_results: gameSeats.map((s) => ({ participant_id: s.participant_id, exit_type: s.participant_id === gameSeats[1].participant_id ? 'killed' : 'alive' }))
      });
    expect(draftRes.body.protocol).toHaveProperty('end_reason');
    expect(draftRes.body.protocol).toHaveProperty('ppk_culprit_participant_id');
    expect(draftRes.body.player_results[0]).toHaveProperty('minor_technical_fouls');
    expect(draftRes.body.player_results[0]).toHaveProperty('major_technical_fouls');
    expect(draftRes.body.player_results[0]).toHaveProperty('technical_fouls');
    expect(draftRes.body.player_results[0]).toHaveProperty('disciplinary_penalty_points');
    expect(draftRes.body.player_results[0]).toHaveProperty('removal_reason');
    
    // GET returns
    const getRes = await request(app)
      .get(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`)
      .set('Cookie', organizerCookie);
    expect(getRes.body.protocol).toHaveProperty('end_reason');
    expect(getRes.body.player_results[0]).toHaveProperty('disciplinary_penalty_points');

    // POST complete returns
    const completeRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`)
      .set('Cookie', organizerCookie)
      .send({
        protocol: { end_reason: 'normal', winner_team: 'black', first_killed_participant_id: gameSeats[1].participant_id },
        player_results: gameSeats.map((s) => ({ participant_id: s.participant_id, exit_type: s.participant_id === gameSeats[1].participant_id ? 'killed' : 'alive' }))
      });
    expect(completeRes.body.protocol).toHaveProperty('end_reason');
    expect(completeRes.body.player_results[0]).toHaveProperty('disciplinary_penalty_points');

    // POST revert returns
    const revertRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/revert-to-draft`)
      .set('Cookie', organizerCookie);
    expect(revertRes.body.protocol).toHaveProperty('end_reason');
    expect(revertRes.body.player_results[0]).toHaveProperty('disciplinary_penalty_points');
  });

  it('6. Инициализация существующей базы добавляет столбцы и сохраняет заранее созданную старую строку', async () => {
    const rawDb = createDatabaseConnection(':memory:');
    
    // old schema missing new columns
    await rawDb.run(`
      CREATE TABLE tournament_game_protocols (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft',
        winner_team TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    
    await rawDb.run(`
      CREATE TABLE tournament_game_player_results (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        exit_type TEXT NOT NULL DEFAULT 'alive',
        exit_order INTEGER,
        regular_fouls INTEGER NOT NULL DEFAULT 0,
        technical_fouls INTEGER NOT NULL DEFAULT 0,
        judge_bonus REAL NOT NULL DEFAULT 0,
        protocol_bonus REAL NOT NULL DEFAULT 0,
        penalty_points REAL NOT NULL DEFAULT 0,
        ci_points REAL NOT NULL DEFAULT 0,
        color_protocol_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        UNIQUE(game_id, participant_id)
      );
    `);
    
    // seed old data
    await rawDb.run(`INSERT INTO tournament_game_protocols (id, game_id, created_at, updated_at) VALUES ('proto1', 'g1', 'now', 'now')`);
    await rawDb.run(`INSERT INTO tournament_game_player_results (id, game_id, participant_id, technical_fouls, penalty_points) VALUES ('res1', 'g1', 'p1', 1, 0.5)`);
    
    // Migrate
    initializeDatabase(rawDb);
    
    const proto = await rawDb.get<any>(`SELECT * FROM tournament_game_protocols`);
    expect(proto.end_reason).toBe('normal');
    expect(proto.ppk_culprit_participant_id).toBeNull();
    
    const res = await rawDb.get<any>(`SELECT * FROM tournament_game_player_results`);
    expect(res.minor_technical_fouls).toBe(0);
    expect(res.major_technical_fouls).toBe(0);
    expect(res.technical_fouls).toBe(1); // kept old value
    expect(res.disciplinary_penalty_points).toBe(0);
    expect(res.removal_reason).toBeNull();
  });
});
"""

open('src/tests/disciplinePersistence.test.ts', 'w').write(new_test_content)
