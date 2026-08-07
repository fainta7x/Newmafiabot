import { describe, expect, it } from 'vitest';
import { buildPlayerProfileStats, PlayerGameHistoryItem } from '../server/services/playerProfileService.ts';

const game = (patch: Partial<PlayerGameHistoryItem> = {}): PlayerGameHistoryItem => ({
  id: Math.random().toString(), source: 'club', evening_id: 'e1', tournament_id: null,
  title: 'Вечер', date: '2026-08-01T20:00:00.000Z', game_number: 1, global_game_number: 1,
  table_name: 'Основной', judge_name: null, seat_number: 1, role: 'citizen', team: 'red',
  winner_team: 'red', status: 'completed', won: true, exit_type: 'alive', regular_fouls: 0,
  minor_technical_fouls: 0, major_technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0,
  ci_points: 0, penalty_points: 0, disciplinary_penalty_points: 0, best_move: false,
  best_move_source: null, first_killed: false, zero_round_voted: false, ...patch,
});

describe('player profile stats', () => {
  it('counts wins, roles, sources and protocol markers', () => {
    const stats = buildPlayerProfileStats([
      game({ role: 'citizen', team: 'red', won: true, best_move: true }),
      game({ id: '2', role: 'mafia', team: 'black', winner_team: 'red', won: false, first_killed: true }),
      game({ id: '3', source: 'tournament', tournament_id: 't1', evening_id: null, role: 'don', team: 'black', winner_team: 'black', won: true, zero_round_voted: true }),
      game({ id: '4', source: 'tournament', tournament_id: 't1', evening_id: null, role: 'sheriff', team: 'red', status: 'planned', winner_team: null, won: null }),
    ]);

    expect(stats.totalGames).toBe(4);
    expect(stats.completedGames).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(67);
    expect(stats.clubGames).toBe(2);
    expect(stats.tournamentGames).toBe(2);
    expect(stats.roleCounts).toEqual({ citizen: 1, sheriff: 1, mafia: 1, don: 1, unknown: 0 });
    expect(stats.bestMoves).toBe(1);
    expect(stats.firstKilled).toBe(1);
    expect(stats.zeroRoundVoted).toBe(1);
  });
});
