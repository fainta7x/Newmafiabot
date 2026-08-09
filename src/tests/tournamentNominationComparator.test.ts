import { describe, expect, it } from 'vitest';
import {
  compareTournamentNominationCandidates,
  type NominationComparatorCandidate,
  type NominationHeadToHeadGame,
  type TournamentNominationCategory,
} from '../server/services/tournamentNominationComparator.ts';

const c = (id: string, points: number, additional: number, roleWins = 0): NominationComparatorCandidate => ({
  participant_id: id,
  display_name: id,
  points,
  additional_points: additional,
  role_wins: roleWins,
});
const game = (
  id: string,
  winner: 'red' | 'black',
  participants: Array<[string, 'red' | 'black']>,
): NominationHeadToHeadGame => ({
  game_id: id,
  game_number: Number(id.replace(/\D/g, '')) || 1,
  winner_team: winner,
  participants: participants.map(([participant_id, team]) => ({ participant_id, team })),
});
const run = (category: TournamentNominationCategory, candidates: NominationComparatorCandidate[], games: NominationHeadToHeadGame[] = []) =>
  compareTournamentNominationCandidates(category, candidates, games);

describe('canonical tournament nomination comparator', () => {
  it('primary Баллы decides immediately', () => {
    const result = run('mvp', [c('a', 4.2, 0), c('b', 4.1, 9)]);
    expect(result.winner_participant_id).toBe('a');
    expect(result.decisive_criterion).toBe('points');
    expect(result.stages).toHaveLength(1);
  });

  it('equal primary points are resolved by Доп. баллы', () => {
    const result = run('best_citizen', [c('a', 3, 1.2), c('b', 3, 0.9)]);
    expect(result.winner_participant_id).toBe('a');
    expect(result.decisive_criterion).toBe('additional_points');
  });

  it('Best Sheriff uses Sheriff-role wins after points and extras', () => {
    const result = run('best_sheriff', [c('a', 3, 1, 2), c('b', 3, 1, 1)]);
    expect(result.winner_participant_id).toBe('a');
    expect(result.decisive_criterion).toBe('role_wins');
  });

  it('Best Don uses Don-role wins after points and extras', () => {
    const result = run('best_don', [c('a', 3, 1, 1), c('b', 3, 1, 2)]);
    expect(result.winner_participant_id).toBe('b');
    expect(result.decisive_criterion).toBe('role_wins');
  });

  it.each(['mvp', 'best_citizen', 'best_mafia'] as const)('does not use role wins for %s', (category) => {
    const result = run(category, [c('a', 3, 1, 50), c('b', 3, 1, 0)], [game('1', 'black', [['a', 'red'], ['b', 'black']])]);
    expect(result.winner_participant_id).toBe('b');
    expect(result.decisive_criterion).toBe('head_to_head');
  });

  it('head-to-head resolves a two-player tie and excludes same-team games', () => {
    const result = run('mvp', [c('a', 3, 1), c('b', 3, 1)], [
      game('1', 'red', [['a', 'red'], ['b', 'black']]),
      game('2', 'black', [['a', 'red'], ['b', 'black']]),
      game('3', 'red', [['a', 'red'], ['b', 'black']]),
      game('4', 'red', [['a', 'red'], ['b', 'red']]),
    ]);
    expect(result.winner_participant_id).toBe('a');
    expect(result.head_to_head_scores).toEqual({ a: 2, b: 1 });
  });

  it('reduces a three-player tie at each lexicographic stage', () => {
    const result = run('best_sheriff', [c('a', 5, 1, 2), c('b', 5, 1, 2), c('c', 5, 0.9, 10)], [
      game('1', 'red', [['a', 'red'], ['b', 'black'], ['c', 'black']]),
      game('2', 'red', [['a', 'red'], ['b', 'black'], ['c', 'black']]),
      game('3', 'black', [['a', 'red'], ['b', 'black'], ['c', 'black']]),
    ]);
    expect(result.winner_participant_id).toBe('a');
    expect(result.stages[1].advancing_ids).toEqual(['a', 'b']);
    expect(result.stages.at(-1)?.candidate_ids).toEqual(['a', 'b']);
    expect(result.head_to_head_scores).toEqual({ a: 2, b: 1 });
  });

  it('is invariant to candidate and database input order', () => {
    const candidates = [c('a', 3, 1), c('b', 3, 1), c('c', 2, 9)];
    const games = [game('1', 'red', [['a', 'red'], ['b', 'black']])];
    const first = run('mvp', candidates, games);
    const second = run('mvp', [candidates[2], candidates[1], candidates[0]], [...games].reverse());
    expect(second.winner_participant_id).toBe(first.winner_participant_id);
    expect(second.decisive_criterion).toBe(first.decisive_criterion);
  });

  it('returns an explicit exact tie instead of an arbitrary winner', () => {
    const result = run('best_mafia', [c('a', 3, 1), c('b', 3, 1)], []);
    expect(result.winner_participant_id).toBeNull();
    expect(result.has_exact_tie).toBe(true);
    expect(result.decisive_criterion).toBe('exact_tie');
    expect(result.tied_participant_ids).toEqual(['a', 'b']);
  });

  it('never accepts a legacy judge/coin/manual record as comparator input', () => {
    const legacyRecord = { resolution_method: 'chief_judge_decision', winner_participant_id: 'b' };
    const result = run('best_citizen', [c('a', 4, 0), c('b', 3, 99)]);
    expect(legacyRecord.resolution_method).toBe('chief_judge_decision');
    expect(result.winner_participant_id).toBe('a');
    expect(result.decisive_criterion).toBe('points');
  });
});
