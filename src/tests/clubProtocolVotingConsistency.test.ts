import { describe, expect, it } from 'vitest';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';
import { validateVotes } from '../lib/protocolVotingValidation.ts';
import { cleanAndSyncVotes } from '../shared/tournamentVoting.ts';
import { tableRoleCounts } from '../lib/tableComposition.ts';

const players = (size = 10): any[] => Object.entries(tableRoleCounts(size)).flatMap(([role, count]) => Array(count).fill(role))
  .map((role, index) => ({ participant_id: `p${index + 1}`, player_id: `player${index + 1}`, seat_number: index + 1, role, exit_type: 'alive' }));
const round = (size = 10, patch: Record<string, unknown> = {}): any => ({
  round_number: 1, day_number: 0, is_revote: false, nominated_seats: [2, 5],
  eligible_voters: size, vote_counts: { 2: size - 3, 5: 3 }, outcome: 'no_elimination', eliminated_seats: [], ...patch,
});
const save = (votes: any, rule = 'club', results = players(), zeroId: string | null = null) => canonicalizeClubGameSave(
  { player_results: players(results.length) },
  { winner_team: 'red', zero_round_rule: rule, votes, best_moves: [], shots: [], zero_round_voted_participant_id: zeroId },
  results, 'completed',
);

describe('recorded club ballots use the shared consistency rules', () => {
  it.each([8, 9, 10])('accepts a club broken split at a %i-player table and retains that size in the editor', size => {
    const votes = [round(size)];
    expect(() => save(votes, 'club', players(size))).not.toThrow();
    expect(cleanAndSyncVotes(votes, size)[0].eligible_voters).toBe(size);
    const tied = round(size, { vote_counts: { 2: size / 2, 5: size / 2 }, outcome: 'tie_revote', eligible_voters: 10 });
    const child = { ...tied, round_number: 2, is_revote: true, parent_round_number: 1, outcome: 'pending' };
    expect(cleanAndSyncVotes([tied, child], size).map(round => round.eligible_voters)).toEqual([size, size]);
    expect(() => save([round(size, { eligible_voters: size - 1 })], 'club', players(size))).toThrow();
  });

  it('requires elimination for the same split under tournament settings, also used by historical protocols', () => {
    expect(() => save([round()], 'tournament')).toThrow('ожидается выбывание');
    const results = players(); results[1].exit_type = 'voted_zero_round';
    const votes = [round(10, { outcome: 'single_eliminated', eliminated_seats: [2] })];
    expect(() => save(votes, 'tournament', results, 'p2')).not.toThrow();
    expect(() => save(votes, 'club', results, 'p2')).toThrow('клубной настройке');
  });

  it.each(['club', 'tournament'])('retains double-revote elimination under %s settings', rule => {
    const first = round(10, { vote_counts: { 2: 5, 5: 5 }, outcome: 'tie_revote' });
    const second = round(10, { round_number: 2, is_revote: true, parent_round_number: 1, vote_counts: { 2: 5, 5: 5 }, table_leave_votes: 6, outcome: 'all_tied_eliminated', eliminated_seats: [2, 5] });
    const results = players(); results[1].exit_type = 'voted_zero_round'; results[4].exit_type = 'voted_zero_round';
    expect(() => save([first, second], rule, results)).not.toThrow();
  });

  it('applies normal daytime elimination under club settings', () => {
    const results = players(); results[1].exit_type = 'voted_day';
    expect(() => save([round(10, { day_number: 1, outcome: 'single_eliminated', eliminated_seats: [2] })], 'club', results)).not.toThrow();
    expect(() => save([round(10, { day_number: 1 })])).toThrow('ожидается выбывание');
  });

  it.each([
    [round(10, { vote_counts: { 2: 6, 5: 3 } })],
    [round(10, { is_revote: true, parent_round_number: 99 })],
    [round(10, { outcome: 'pending' })],
    [round(), round()],
  ].map(votes => ({ votes })))('rejects malformed recorded ballots through the actual club save owner', ({ votes }) => {
    expect(() => save(votes)).toThrow();
  });

  it('does not fabricate missing ballot evidence for old or manually entered protocols', () => {
    const results = players(); results[1].exit_type = 'voted_day';
    expect(() => save([], 'tournament', results)).not.toThrow();
  });

  it('keeps the original tournament default at the shared API boundary', () => {
    expect(validateVotes([round()], true, players(), null)).toContain('ожидается выбывание');
  });
});
