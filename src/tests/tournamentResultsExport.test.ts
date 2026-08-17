import { describe, it, expect } from 'vitest';
import {
  formatPoints,
  escapeXml,
  getSafeFilenameForGame,
  getSafeFilenameForStandings,
  buildGameExportRows,
  generateGameResultsSvg,
  generateStandingsSvg,
} from '../lib/tournamentResultsExport.ts';
import { Tournament, TournamentGame, PlayerResultData, TournamentStandingItem } from '../lib/api.ts';

describe('Tournament Results Export Utility Tests', () => {
  describe('1. Point Formatting (formatPoints)', () => {
    it('should format positive values with a plus and a comma separator', () => {
      expect(formatPoints(0.5)).toBe('+0,5');
      expect(formatPoints(1.25)).toBe('+1,25');
      expect(formatPoints(3)).toBe('+3');
    });

    it('should format negative values with a Unicode minus and a comma separator', () => {
      expect(formatPoints(-0.3)).toBe('\u22120,3');
      expect(formatPoints(-1.5)).toBe('\u22121,5');
      expect(formatPoints(-2)).toBe('\u22122');
    });

    it('should format zero correctly', () => {
      expect(formatPoints(0)).toBe('0');
      expect(formatPoints(-0)).toBe('0');
    });

    it('should handle undefined, null, or NaN gracefully as 0', () => {
      expect(formatPoints(undefined)).toBe('0');
      expect(formatPoints(null)).toBe('0');
      expect(formatPoints(NaN)).toBe('0');
    });
  });

  describe('2. SVG XML Sanitization (escapeXml)', () => {
    it('should escape XML control characters', () => {
      const unsafe = '<Player> & "Co"\'s';
      const safe = escapeXml(unsafe);
      expect(safe).toBe('&lt;Player&gt; &amp; &quot;Co&quot;&apos;s');
    });

    it('should handle empty or null values', () => {
      expect(escapeXml('')).toBe('');
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
    });
  });

  describe('3. Filename Safety', () => {
    it('should clean up special characters for safe filenames', () => {
      const title = 'Турнир "Кубок" №1!';
      expect(getSafeFilenameForGame(title, 2)).toBe('турнир_кубок_1-game-2-results.png');
      expect(getSafeFilenameForStandings(title, 5)).toBe('турнир_кубок_1-standings-after-5-games.png');
    });
  });

  describe('4. Seating and Standings Sorting & Building', () => {
    it('should build game export rows sorted by seat number', () => {
      const mockPlayerResults: PlayerResultData[] = [
        { participant_id: 'p-2', seat_number: 2, display_name: 'Игрок 2', player_id: 'u-2', role: 'mafia', regular_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, color_protocol: [], exit_type: 'alive' },
        { participant_id: 'p-1', seat_number: 1, display_name: 'Игрок 1', player_id: 'u-1', role: 'citizen', regular_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, color_protocol: [], exit_type: 'alive' },
        { participant_id: 'p-3', seat_number: 3, display_name: 'Игрок 3', player_id: 'u-3', role: 'sheriff', regular_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, color_protocol: [], exit_type: 'alive' },
      ];

      const mockStandings: TournamentStandingItem[] = [
        {
          place: 1,
          calculated_place: 1,
          official_place: 1,
          tie_group_id: null,
          participant_id: 'p-1',
          participant_number: 1,
          display_name: 'Игрок 1',
          total_points: 1.5,
          additional_total: 0.5,
          positive_points: 1.0,
          penalty_points: 0,
          best_move_points: 0.5,
          ci_points: 0,
          wins: 1,
          don_wins: 0,
          sheriff_wins: 0,
          first_killed_count: 0,
          games_played: 1,
          games: [
            {
              game_number: 1,
              seat_number: 1,
              role: 'citizen',
              winner_team: 'red',
              win_point: 1,
              judge_bonus: 0,
              protocol_bonus: 0,
              positive_points: 1.0,
              best_move_points: 0.5,
              ci_points: 0,
              ci_rate: 0,
              ci_reason: 'not_eligible',
              game_total: 1.5,
              penalty_points: 0,
            },
          ],
        },
      ];

      const rows = buildGameExportRows(mockPlayerResults, mockStandings, 1);
      expect(rows[0].seat_number).toBe(1);
      expect(rows[1].seat_number).toBe(2);
      expect(rows[2].seat_number).toBe(3);
      expect(rows[0].game_total).toBe(1.5);
      expect(rows[1].game_total).toBe(0);
    });

    it('should render SVG for game and standings correctly with current noir publication copy', () => {
      const mockTournament: Tournament = {
        id: 't-1',
        title: 'Тест Турнир',
        date: '2026-08-01T18:00:00Z',
        status: 'active',
        created_at: '2026-07-30T00:00:00Z',
        updated_at: '2026-07-30T00:00:00Z',
      };

      const mockGame: TournamentGame = {
        id: 'g-1',
        tournament_id: 't-1',
        game_number: 1,
        judge_name: 'Чагин',
        judge_player_id: null,
        status: 'completed',
        winner_team: 'red',
        started_at: '2026-08-01T18:00:00Z',
        completed_at: '2026-08-01T19:00:00Z',
      };

      const exportRows = [{
        seat_number: 1,
        display_name: 'Игрок 1',
        role: 'citizen',
        game_total: 1.5,
        win_point: 1,
        judge_bonus: 0.2,
        protocol_bonus: 0,
        best_move_points: 0.3,
        game_penalty_points: 0,
        disciplinary_penalty_points: 0,
        ci_points: 0,
      }];

      const svg = generateGameResultsSvg(mockTournament, mockGame, exportRows);
      expect(svg).toContain('Тест Турнир');
      expect(svg).toContain('ИТОГИ ИГРЫ');
      expect(svg).toContain('ИГРА №1');
      expect(svg).toContain('ПОБЕДА КРАСНЫХ');
      expect(svg).toContain('Судья · Чагин');
      expect(svg).toContain('Игрок 1');

      const mockStandings: TournamentStandingItem[] = [
        {
          place: 1,
          calculated_place: 1,
          official_place: 1,
          tie_group_id: null,
          participant_id: 'p-1',
          participant_number: 1,
          display_name: 'Победитель',
          total_points: 4.2,
          additional_total: 1.2,
          positive_points: 3.0,
          penalty_points: 0.5,
          best_move_points: 1.2,
          ci_points: 0.5,
          wins: 3,
          don_wins: 1,
          sheriff_wins: 0,
          first_killed_count: 1,
          games_played: 5,
          games: [],
        },
      ];

      const standingsSvg = generateStandingsSvg(mockTournament, mockStandings, 5, 10);
      expect(standingsSvg).toContain('ПРОМЕЖУТОЧНЫЕ ИТОГИ');
      expect(standingsSvg).toContain('ТЕКУЩИЙ РЕЙТИНГ');
      expect(standingsSvg).toContain('После 5 из 10 игр');
      expect(standingsSvg).toContain('Победитель');
      expect(standingsSvg).toContain('4,2');
    });
  });
});