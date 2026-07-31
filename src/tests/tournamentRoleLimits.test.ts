import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  validateRoleAssignmentChange,
  isRoleOptionDisabled,
  SeatRoleInput,
} from '../lib/tournamentRoleValidation.ts';

describe('Tournament Role Assignment Limits & Protection Regression Tests', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let tournamentId: string;
  let gameId: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);

    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    const playerIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const pid = `player-uuid-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
         VALUES (?, ?, ?, 'NEW_LEAD', ?, ?)`,
        [pid, `Player_${i}`, `+7900000000${i}`, new Date().toISOString(), new Date().toISOString()]
      );
      playerIds.push(pid);
    }

    const participants = playerIds.map((id, idx) => ({ player_id: id, display_name: `Игрок ${idx + 1}` }));

    const tourRes = await request(app)
      .post('/api/tournaments')
      .set('Cookie', organizerCookie)
      .send({
        title: 'Тестовый Турнир Ролей',
        date: new Date().toISOString(),
        chief_judge_name: 'Судья',
        participants,
      });

    tournamentId = tourRes.body.id;
    gameId = tourRes.body.games[0].id;
  });

  it('1. Cannot assign citizen role to all 10 players via API', async () => {
    const rolesPayload = Array.from({ length: 10 }, (_, i) => ({
      seat_number: i + 1,
      role: 'citizen',
    }));

    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: rolesPayload });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Мирный');
    expect(res.body.prospective_counts?.citizen).toBe(10);
  });

  it('2. Cannot assign a second Sheriff', async () => {
    const rolesPayload = [
      { seat_number: 1, role: 'sheriff' },
      { seat_number: 2, role: 'sheriff' },
    ];

    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: rolesPayload });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Шериф');
  });

  it('3. Cannot assign a third Mafia', async () => {
    const rolesPayload = [
      { seat_number: 1, role: 'mafia' },
      { seat_number: 2, role: 'mafia' },
      { seat_number: 3, role: 'mafia' },
    ];

    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: rolesPayload });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Мафия');
  });

  it('4. Cannot assign a second Don', async () => {
    const rolesPayload = [
      { seat_number: 1, role: 'don' },
      { seat_number: 2, role: 'don' },
    ];

    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: rolesPayload });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Дон');
  });

  it('5. After rejected request, all previous roles remain unchanged in DB', async () => {
    await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: [{ seat_number: 1, role: 'sheriff' }] });

    const invalidRes = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: [{ seat_number: 2, role: 'sheriff' }] });

    expect(invalidRes.status).toBe(400);

    const seatsInDb = await db.all<any>(
      'SELECT seat_number, role FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC',
      [gameId]
    );

    expect(seatsInDb[0].role).toBe('sheriff');
    expect(seatsInDb[1].role).toBeNull();
  });

  it('6. Incomplete composition within limits is allowed during editing', async () => {
    const payload = [
      { seat_number: 1, role: 'sheriff' },
      { seat_number: 2, role: 'don' },
      { seat_number: 3, role: 'mafia' },
      { seat_number: 4, role: 'mafia' },
      { seat_number: 5, role: 'citizen' },
      { seat_number: 6, role: 'citizen' },
    ];

    const res = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: payload });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const seatsInDb = await db.all<any>(
      'SELECT seat_number, role FROM tournament_game_seats WHERE game_id = ? AND role IS NOT NULL',
      [gameId]
    );
    expect(seatsInDb.length).toBe(6);
  });

  it('7. Exact composition 6/1/2/1 saves successfully and allows starting the game', async () => {
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

    const saveRes = await request(app)
      .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
      .set('Cookie', organizerCookie)
      .send({ roles: validRoles });

    expect(saveRes.status).toBe(200);

    const startTourRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);
    expect(startTourRes.status).toBe(200);

    const startGameRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/start`)
      .set('Cookie', organizerCookie);

    expect(startGameRes.status).toBe(200);
    expect(startGameRes.body.game.status).toBe('active');
  });

  it('8. Start endpoint rejects game if roles in DB are tampered to invalid composition', async () => {
    await request(app)
      .post(`/api/tournaments/${tournamentId}/start`)
      .set('Cookie', organizerCookie);

    await db.run("UPDATE tournament_game_seats SET role = 'citizen' WHERE game_id = ?", [gameId]);

    const res = await request(app)
      .post(`/api/tournaments/${tournamentId}/games/${gameId}/start`)
      .set('Cookie', organizerCookie);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Нельзя запустить игру с неправильным набором ролей');
  });

  it('9. UI validation function correctly calculates prospective composition when replacing and removing roles', () => {
    const currentSeats: SeatRoleInput[] = [
      { seat_number: 1, role: 'citizen' },
      { seat_number: 2, role: 'citizen' },
      { seat_number: 3, role: 'citizen' },
      { seat_number: 4, role: 'citizen' },
      { seat_number: 5, role: 'citizen' },
      { seat_number: 6, role: 'citizen' },
      { seat_number: 7, role: 'sheriff' },
      { seat_number: 8, role: 'mafia' },
      { seat_number: 9, role: 'mafia' },
      { seat_number: 10, role: null },
    ];

    const add7thCitizen = validateRoleAssignmentChange(currentSeats, 10, 'citizen');
    expect(add7thCitizen.allowed).toBe(false);
    expect(add7thCitizen.error).toContain('Мирного');

    const addDon = validateRoleAssignmentChange(currentSeats, 10, 'don');
    expect(addDon.allowed).toBe(true);
    expect(addDon.prospectiveCounts.don).toBe(1);

    const replaceCitizenWith2ndSheriff = validateRoleAssignmentChange(currentSeats, 1, 'sheriff');
    expect(replaceCitizenWith2ndSheriff.allowed).toBe(false);
    expect(replaceCitizenWith2ndSheriff.error).toContain('Шерифа');

    const removeSheriff = validateRoleAssignmentChange(currentSeats, 7, null);
    expect(removeSheriff.allowed).toBe(true);
    expect(removeSheriff.prospectiveCounts.sheriff).toBe(0);

    expect(isRoleOptionDisabled(currentSeats, 10, 'citizen')).toBe(true);
    expect(isRoleOptionDisabled(currentSeats, 10, 'sheriff')).toBe(true);
    expect(isRoleOptionDisabled(currentSeats, 10, 'mafia')).toBe(true);
    expect(isRoleOptionDisabled(currentSeats, 10, 'don')).toBe(false);
  });
});
