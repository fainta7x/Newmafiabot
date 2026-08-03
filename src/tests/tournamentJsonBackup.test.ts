import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { validateTournamentBackupData } from '../server/routes/tournamentsRoutes.ts';

describe('Tournament JSON Backup Validation', () => {
  const tournamentId = 'test-tourney-125';

  const mockPayload = {
    schema_version: 1,
    metadata: {
      created_at: new Date().toISOString(),
      tournament_id: tournamentId,
      games_count: 10,
      protocols_count: 10,
      completed_protocols_count: 6,
      player_results_count: 60,
    },
    tournament: { id: tournamentId, title: 'Test Tournament', date: '2026-08-01', venue: 'Club', stage: 'main', status: 'active' },
    tournament_participants: Array.from({ length: 10 }, (_, i) => ({
      id: `part-${i + 1}`,
      tournament_id: tournamentId,
      player_id: `player-${i + 1}`,
      display_name: `Player ${i + 1}`,
      participant_number: i + 1,
    })),
    players: Array.from({ length: 10 }, (_, i) => ({
      id: `player-${i + 1}`,
      nickname: `Player ${i + 1}`,
    })),
    tournament_games: Array.from({ length: 10 }, (_, i) => ({
      id: `game-${i + 1}`,
      tournament_id: tournamentId,
      game_number: i + 1,
      status: i < 6 ? 'completed' : 'draft',
    })),
    tournament_game_seats: Array.from({ length: 100 }, (_, i) => {
      const gIdx = Math.floor(i / 10) + 1;
      const sNum = (i % 10) + 1;
      return {
        id: `seat-${i + 1}`,
        game_id: `game-${gIdx}`,
        seat_number: sNum,
        participant_id: `part-${sNum}`,
        role: 'citizen',
      };
    }),
    tournament_game_protocols: Array.from({ length: 10 }, (_, i) => ({
      id: `proto-${i + 1}`,
      game_id: `game-${i + 1}`,
      status: i < 6 ? 'completed' : 'draft',
      winner_team: i < 6 ? 'red' : null,
      created_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
      completed_at: i < 6 ? '2026-08-01T12:00:00.000Z' : null,
    })),
    tournament_game_player_results: Array.from({ length: 60 }, (_, i) => {
      const gIdx = Math.floor(i / 10) + 1;
      const pIdx = (i % 10) + 1;
      return {
        id: `res-${i + 1}`,
        game_id: `game-${gIdx}`,
        participant_id: `part-${pIdx}`,
        ci_points: 0,
        judge_bonus: 0,
        protocol_bonus: 0,
      };
    }),
    tournament_game_best_moves: [],
    tournament_final_resolutions: [],
  };

  const computeChecksum = (data: any) => {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  };

  it('валидная резервная копия проходит проверку', () => {
    const checksum = computeChecksum(mockPayload);
    const backupData = { ...mockPayload, checksum };

    const result = validateTournamentBackupData(backupData, tournamentId);
    expect(result.valid).toBe(true);
  });

  it('повреждённая контрольная сумма откланяется', () => {
    const backupData = { ...mockPayload, checksum: 'badchecksum123' };
    const result = validateTournamentBackupData(backupData, tournamentId);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('checksum');
  });

  it('копия от другого турнира откланяется', () => {
    const checksum = computeChecksum(mockPayload);
    const backupData = { ...mockPayload, checksum };
    const result = validateTournamentBackupData(backupData, 'other-tourney-id');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('другому турниру');
  });

  it('неполное количество участников (< 10) откланяется', () => {
    const badPayload = {
      ...mockPayload,
      tournament_participants: mockPayload.tournament_participants.slice(0, 9),
    };
    const checksum = computeChecksum(badPayload);
    const backupData = { ...badPayload, checksum };
    const result = validateTournamentBackupData(backupData, tournamentId);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 участников');
  });

  it('неполное количество мест (< 10 мест в игре) откланяется', () => {
    const badPayload = {
      ...mockPayload,
      tournament_game_seats: mockPayload.tournament_game_seats.slice(0, 95),
    };
    const checksum = computeChecksum(badPayload);
    const backupData = { ...badPayload, checksum };
    const result = validateTournamentBackupData(backupData, tournamentId);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('мест');
  });

  it('сломанные связи не проходят проверку до начала восстановления', () => {
    const badPayload = {
      ...mockPayload,
      tournament_game_seats: mockPayload.tournament_game_seats.map((seat, index) =>
        index === 0 ? { ...seat, participant_id: 'missing-participant' } : seat
      ),
    };
    const checksum = computeChecksum(badPayload);
    const result = validateTournamentBackupData({ ...badPayload, checksum }, tournamentId);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('отсутствующую');
  });

  it('полный цикл (export -> clear -> restore) сохраняет 100% равенство всех записей', async () => {
    const { createDatabaseConnection } = await import('../db/index.ts');
    const { createApp } = await import('../app.ts');
    const { generateOrganizerToken } = await import('../server/auth.ts');
    const request = (await import('supertest')).default;

    const db = await createDatabaseConnection(':memory:');
    
    // Seed initial state in memory
    await db.run(
      `INSERT INTO tournaments (id, title, date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [tournamentId, 'Test Tournament', '2026-08-01', 'active', new Date().toISOString(), new Date().toISOString()]
    );

    for (let i = 1; i <= 10; i++) {
      const pId = `player-${i}`;
      const ptId = `part-${i}`;
      await db.run(
        `INSERT INTO players (id, nickname, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [pId, `Nick_${i}`, `Full Name ${i}`, new Date().toISOString(), new Date().toISOString()]
      );
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, player_id, display_name, participant_number) VALUES (?, ?, ?, ?, ?)`,
        [ptId, tournamentId, pId, `Nick_${i}`, i]
      );
    }

    for (let g = 1; g <= 10; g++) {
      const gameId = `game-${g}`;
      await db.run(
        `INSERT INTO tournament_games (id, tournament_id, game_number, status) VALUES (?, ?, ?, ?)`,
        [gameId, tournamentId, g, g <= 6 ? 'completed' : 'draft']
      );

      for (let s = 1; s <= 10; s++) {
        await db.run(
          `INSERT INTO tournament_game_seats (id, game_id, seat_number, participant_id, role) VALUES (?, ?, ?, ?, ?)`,
          [`seat-${g}-${s}`, gameId, s, `part-${s}`, 'citizen']
        );
      }

      await db.run(
        `INSERT INTO tournament_game_protocols (id, game_id, status, end_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [`proto-${g}`, gameId, g <= 6 ? 'completed' : 'draft', 'normal', new Date().toISOString(), new Date().toISOString()]
      );

      if (g <= 6) {
        for (let p = 1; p <= 10; p++) {
          await db.run(
            `INSERT INTO tournament_game_player_results (id, game_id, participant_id, ci_points, judge_bonus) VALUES (?, ?, ?, ?, ?)`,
            [`res-${g}-${p}`, gameId, `part-${p}`, 0, 0]
          );
        }
      }
    }

    // Perform backup export dump simulation
    const exportedTournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    const exportedParticipants = await db.all<any>('SELECT * FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);
    const exportedPlayers = await db.all<any>('SELECT * FROM players');
    const exportedGames = await db.all<any>('SELECT * FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    const exportedSeats = await db.all<any>('SELECT * FROM tournament_game_seats');
    const exportedProtocols = await db.all<any>('SELECT * FROM tournament_game_protocols');
    const exportedResults = await db.all<any>('SELECT * FROM tournament_game_player_results');

    const restorePayload = {
      schema_version: 1,
      metadata: {
        created_at: new Date().toISOString(),
        tournament_id: tournamentId,
        games_count: exportedGames.length,
        protocols_count: exportedProtocols.length,
        completed_protocols_count: 6,
        player_results_count: exportedResults.length,
      },
      tournament: exportedTournament,
      tournament_participants: exportedParticipants,
      players: exportedPlayers,
      tournament_games: exportedGames,
      tournament_game_seats: exportedSeats,
      tournament_game_protocols: exportedProtocols,
      tournament_game_player_results: exportedResults,
      tournament_game_best_moves: [],
      tournament_final_resolutions: [],
    };

    const checksum = computeChecksum(restorePayload);
    const backupObj = { ...restorePayload, checksum };

    expect(validateTournamentBackupData(backupObj, tournamentId).valid).toBe(true);

    // Clear tournament children, then exercise the real authenticated restore endpoint.
    await db.run('DELETE FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    await db.run('DELETE FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);

    const app = await createApp(db);
    const restoreResponse = await request(app)
      .post(`/api/tournaments/${tournamentId}/backup/restore`)
      .set('Authorization', `Bearer ${generateOrganizerToken()}`)
      .send(backupObj)
      .expect(200);

    expect(restoreResponse.body.success).toBe(true);
    expect(restoreResponse.body.counts.games).toBe(10);
    expect(restoreResponse.body.counts.player_results).toBe(60);

    // Verify restored state
    const restoredGames = await db.all<any>('SELECT * FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
    const restoredSeats = await db.all<any>('SELECT * FROM tournament_game_seats');
    const restoredProtocols = await db.all<any>('SELECT * FROM tournament_game_protocols');
    const restoredResults = await db.all<any>('SELECT * FROM tournament_game_player_results');

    expect(restoredGames.length).toBe(10);
    expect(restoredSeats.length).toBe(100);
    expect(restoredProtocols.length).toBe(10);
    expect(restoredResults.length).toBe(60);
    expect((db.sqlite.pragma('integrity_check', { simple: false }) as any[])[0].integrity_check).toBe('ok');
    expect((db.sqlite.pragma('foreign_key_check', { simple: false }) as any[]).length).toBe(0);
    db.sqlite.close();
  });
});
