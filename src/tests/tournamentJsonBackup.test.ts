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
      is_completed: i < 6 ? 1 : 0,
    })),
    tournament_game_player_results: Array.from({ length: 60 }, (_, i) => {
      const gIdx = Math.floor(i / 10) + 1;
      const pIdx = (i % 10) + 1;
      return {
        id: `res-${i + 1}`,
        game_id: `game-${gIdx}`,
        participant_id: `part-${pIdx}`,
        is_winner: 1,
        main_points: 1,
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
});
