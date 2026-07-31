import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  validateRoleAssignmentChange,
  isRoleOptionDisabled,
  calculateRoleCounts,
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

  describe('Standard protection for valid compositions (Mode 1)', () => {
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
      expect(res.body.error).toContain('Мирн');
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
      expect(res.body.error).toContain('Мафи');
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
  });

  describe('Fixing existing invalid state (e.g. 8/0/1/1 Mode 2)', () => {
    beforeEach(async () => {
      // Direct DB update to set seats 1..8 to citizen, 9 to mafia, 10 to don
      await db.run("UPDATE tournament_game_seats SET role = 'citizen' WHERE game_id = ? AND seat_number <= 8", [gameId]);
      await db.run("UPDATE tournament_game_seats SET role = 'mafia' WHERE game_id = ? AND seat_number = 9", [gameId]);
      await db.run("UPDATE tournament_game_seats SET role = 'don' WHERE game_id = ? AND seat_number = 10", [gameId]);
    });

    it('1, 2, 3, 4. Step-by-step fixing from 8/0/1/1 -> 7/1/1/1 -> 6/1/2/1 and starting game', async () => {
      // Step 1: Change seat 1 (citizen) to sheriff -> 7/1/1/1
      const res1 = await request(app)
        .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
        .set('Cookie', organizerCookie)
        .send({
          roles: [
            { seat_number: 1, role: 'sheriff' },
            { seat_number: 2, role: 'citizen' },
            { seat_number: 3, role: 'citizen' },
            { seat_number: 4, role: 'citizen' },
            { seat_number: 5, role: 'citizen' },
            { seat_number: 6, role: 'citizen' },
            { seat_number: 7, role: 'citizen' },
            { seat_number: 8, role: 'citizen' },
            { seat_number: 9, role: 'mafia' },
            { seat_number: 10, role: 'don' },
          ],
        });

      expect(res1.status).toBe(200);

      const seatsAfterStep1 = await db.all<any>(
        'SELECT seat_number, role FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC',
        [gameId]
      );
      const counts1 = calculateRoleCounts(seatsAfterStep1);
      expect(counts1).toEqual({ citizen: 7, sheriff: 1, mafia: 1, don: 1 });

      // Step 2: Change seat 2 (citizen) to mafia -> 6/1/2/1
      const res2 = await request(app)
        .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
        .set('Cookie', organizerCookie)
        .send({
          roles: [
            { seat_number: 1, role: 'sheriff' },
            { seat_number: 2, role: 'mafia' },
            { seat_number: 3, role: 'citizen' },
            { seat_number: 4, role: 'citizen' },
            { seat_number: 5, role: 'citizen' },
            { seat_number: 6, role: 'citizen' },
            { seat_number: 7, role: 'citizen' },
            { seat_number: 8, role: 'citizen' },
            { seat_number: 9, role: 'mafia' },
            { seat_number: 10, role: 'don' },
          ],
        });

      expect(res2.status).toBe(200);

      const seatsAfterStep2 = await db.all<any>(
        'SELECT seat_number, role FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC',
        [gameId]
      );
      const counts2 = calculateRoleCounts(seatsAfterStep2);
      expect(counts2).toEqual({ citizen: 6, sheriff: 1, mafia: 2, don: 1 });

      // Step 3: Start tournament and game
      await request(app)
        .post(`/api/tournaments/${tournamentId}/start`)
        .set('Cookie', organizerCookie);

      const startGameRes = await request(app)
        .post(`/api/tournaments/${tournamentId}/games/${gameId}/start`)
        .set('Cookie', organizerCookie);

      expect(startGameRes.status).toBe(200);
      expect(startGameRes.body.game.status).toBe('active');
    });

    it('5. Cannot assign second Don from 8/0/1/1', async () => {
      const res = await request(app)
        .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
        .set('Cookie', organizerCookie)
        .send({
          roles: [{ seat_number: 1, role: 'don' }],
        });

      expect(res.status).toBe(400);
    });

    it('6. Cannot increase citizens from 8 to 9', async () => {
      const res = await request(app)
        .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
        .set('Cookie', organizerCookie)
        .send({
          roles: [{ seat_number: 9, role: 'citizen' }],
        });

      expect(res.status).toBe(400);
    });

    it('7. Cannot transfer overflow from citizens to another role (e.g. mafia -> sheriff)', async () => {
      const res = await request(app)
        .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
        .set('Cookie', organizerCookie)
        .send({
          roles: [{ seat_number: 9, role: 'sheriff' }],
        });

      expect(res.status).toBe(400);
    });

    it('8. After rejected operation, DB remains unchanged', async () => {
      const res = await request(app)
        .patch(`/api/tournaments/${tournamentId}/games/${gameId}/roles`)
        .set('Cookie', organizerCookie)
        .send({
          roles: [{ seat_number: 9, role: 'sheriff' }],
        });

      expect(res.status).toBe(400);

      const seatsInDb = await db.all<any>(
        'SELECT seat_number, role FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC',
        [gameId]
      );
      expect(seatsInDb[8].role).toBe('mafia');
      expect(calculateRoleCounts(seatsInDb)).toEqual({ citizen: 8, sheriff: 0, mafia: 1, don: 1 });
    });

    it('9. Current seat role is NOT disabled even at 8/6', () => {
      const currentSeats: SeatRoleInput[] = Array.from({ length: 8 }, (_, i) => ({ seat_number: i + 1, role: 'citizen' })).concat([
        { seat_number: 9, role: 'mafia' },
        { seat_number: 10, role: 'don' },
      ]);

      expect(isRoleOptionDisabled(currentSeats, 1, 'citizen')).toBe(false);
    });

    it('10. For overloaded composition 8/0/1/1, only corrective options are enabled', () => {
      const currentSeats: SeatRoleInput[] = Array.from({ length: 8 }, (_, i) => ({ seat_number: i + 1, role: 'citizen' })).concat([
        { seat_number: 9, role: 'mafia' },
        { seat_number: 10, role: 'don' },
      ]);

      // For seat 1 (currently citizen):
      expect(isRoleOptionDisabled(currentSeats, 1, 'citizen')).toBe(false);
      expect(isRoleOptionDisabled(currentSeats, 1, 'sheriff')).toBe(false);
      expect(isRoleOptionDisabled(currentSeats, 1, 'mafia')).toBe(false);
      expect(isRoleOptionDisabled(currentSeats, 1, 'don')).toBe(true);
      expect(isRoleOptionDisabled(currentSeats, 1, null)).toBe(false);

      // For seat 9 (currently mafia):
      expect(isRoleOptionDisabled(currentSeats, 9, 'mafia')).toBe(false);
      expect(isRoleOptionDisabled(currentSeats, 9, 'citizen')).toBe(true);
      expect(isRoleOptionDisabled(currentSeats, 9, 'sheriff')).toBe(true);
      expect(isRoleOptionDisabled(currentSeats, 9, 'don')).toBe(true);
      expect(isRoleOptionDisabled(currentSeats, 9, null)).toBe(true);
    });

    it('11. Standard protection continues to work once composition is valid', () => {
      const validSeats: SeatRoleInput[] = Array.from({ length: 6 }, (_, i) => ({ seat_number: i + 1, role: 'citizen' })).concat([
        { seat_number: 7, role: 'sheriff' },
        { seat_number: 8, role: 'mafia' },
        { seat_number: 9, role: 'mafia' },
        { seat_number: 10, role: 'don' },
      ]);

      expect(validateRoleAssignmentChange(validSeats, 7, 'citizen').allowed).toBe(false);
      expect(validateRoleAssignmentChange(validSeats, 10, 'sheriff').allowed).toBe(false);
      expect(validateRoleAssignmentChange(validSeats, 10, 'mafia').allowed).toBe(false);
    });
  });
});
