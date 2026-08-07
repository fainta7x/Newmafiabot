import { describe, expect, it } from 'vitest';
import {
  calculateVoteRemainder,
  createNextRevoteRound,
  determineVotingResult,
  type VotingRound,
} from '../shared/tournamentVoting';
import {
  canRegisterFirstKilled,
  getExplicitVoteCounts,
  getSingularZeroRoundElimination,
  isVoteDecided,
  isVoteDecidedFromAssignments,
  liveRoundToTournamentDay,
} from '../lib/liveVoting';

function round(partial: Partial<VotingRound>): VotingRound {
  return {
    round_number: partial.round_number ?? 1,
    is_revote: partial.is_revote ?? false,
    nominated_seats: partial.nominated_seats ?? [],
    vote_counts: partial.vote_counts ?? {},
    day_number: partial.day_number ?? 0,
    eligible_voters: partial.eligible_voters ?? 10,
    parent_round_number: partial.parent_round_number ?? null,
    outcome: partial.outcome ?? 'pending',
    eliminated_seats: partial.eliminated_seats ?? [],
    table_leave_votes: partial.table_leave_votes ?? null,
  };
}

describe('live voting parity helpers', () => {
  it('maps live round 1 to tournament zero round', () => {
    expect(liveRoundToTournamentDay(1)).toBe(0);
    expect(liveRoundToTournamentDay(2)).toBe(1);
  });

  it('only allows first-killed marker for an eligible red player on Night 1', () => {
    expect(canRegisterFirstKilled(1, 'Мирный', true)).toBe(true);
    expect(canRegisterFirstKilled(1, 'Шериф', true)).toBe(true);
    expect(canRegisterFirstKilled(1, 'Мафия', true)).toBe(false);
    expect(canRegisterFirstKilled(1, 'Дон', true)).toBe(false);
    expect(canRegisterFirstKilled(2, 'Мирный', true)).toBe(false);
    expect(canRegisterFirstKilled(1, 'Мирный', false)).toBe(false);
  });

  it('returns singular zero-round source only for one final elimination', () => {
    expect(getSingularZeroRoundElimination(0, [4])).toBe(4);
    expect(getSingularZeroRoundElimination(0, [])).toBeNull();
    expect(getSingularZeroRoundElimination(0, [4, 7])).toBeNull();
    expect(getSingularZeroRoundElimination(1, [4])).toBeNull();
  });

  it('one candidate receives all eligible votes as remainder', () => {
    expect(calculateVoteRemainder([3], 10, { 3: 0 })).toEqual({ 3: 10 });
  });

  it('last candidate receives the remainder', () => {
    expect(calculateVoteRemainder([2, 5], 10, { 2: 4, 5: 0 })).toEqual({ 2: 4, 5: 6 });
  });

  it('self-vote is represented and counted once', () => {
    const counts = getExplicitVoteCounts([3, 8], { 3: 3, 4: 3 }, [1,2,3,4,5,6,7,8,9,10]);
    expect(counts[3]).toBe(2);
  });

  it('one voter assignment can only count once', () => {
    const counts = getExplicitVoteCounts([2, 5], { 1: 2, 2: 5, 3: 5 }, [1,2,3]);
    expect(counts[2] + counts[5]).toBe(3);
  });

  it('detects a mathematically decided vote from explicit votes', () => {
    expect(isVoteDecided([2, 5], { 2: 6, 5: 0 }, 10)).toBe(true);
    expect(isVoteDecided([2, 5], { 2: 5, 5: 0 }, 10)).toBe(false);
    expect(isVoteDecided([2, 5], { 2: 3, 5: 3 }, 10)).toBe(false);
    expect(isVoteDecidedFromAssignments([2,5], {1:2,2:2,3:2,4:2,5:2,6:2}, [1,2,3,4,5,6,7,8,9,10])).toBe(true);
  });

  it('unique leader resolves to one elimination', () => {
    const result = determineVotingResult(round({ nominated_seats: [2,5], vote_counts: {2: 6, 5: 4} }));
    expect(result.outcome).toBe('single_eliminated');
    expect(result.eliminatedSeats).toEqual([2]);
  });

  it('5/5 then repeated 5/5 requires table decision', () => {
    const first = round({ nominated_seats: [2,5], vote_counts: {2:5,5:5} });
    const firstResult = determineVotingResult(first);
    expect(firstResult.outcome).toBe('needs_revote');
    const child = createNextRevoteRound(first, firstResult.winners);
    child.round_number = 2;
    child.vote_counts = {2:5,5:5};
    const childResult = determineVotingResult(child);
    expect(childResult.outcome).toBe('requires_table_decision');
  });

  it('shrinks 3/3/3/1 -> 5/5/0 to a two-player revote', () => {
    const first = round({ nominated_seats: [1,2,3,4], vote_counts: {1:3,2:3,3:3,4:1} });
    const r1 = determineVotingResult(first);
    expect(r1.winners).toEqual([1,2,3]);
    const second = createNextRevoteRound(first, r1.winners);
    second.round_number = 2;
    second.vote_counts = {1:5,2:5,3:0};
    const r2 = determineVotingResult(second);
    expect(r2.outcome).toBe('needs_revote');
    expect(r2.winners).toEqual([1,2]);
    const third = createNextRevoteRound(second, r2.winners);
    expect(third.nominated_seats).toEqual([1,2]);
  });

  it('allows table decision when tied candidates are exactly half the voters', () => {
    const r = round({ is_revote: true, nominated_seats: [1,2,3,4], vote_counts: {1:2,2:2,3:2,4:2}, eligible_voters: 8 });
    expect(determineVotingResult(r).outcome).toBe('requires_table_decision');
  });

  it('6 voters repeated 3/3 requires table decision', () => {
    const r = round({ is_revote: true, nominated_seats: [1,2], vote_counts: {1:3,2:3}, eligible_voters: 6 });
    expect(determineVotingResult(r).outcome).toBe('requires_table_decision');
  });

  it('more than half tied again means automatic no elimination', () => {
    const seats = [1,2,3,4,5,6,7];
    const counts = Object.fromEntries(seats.map((seat) => [seat, 1]));
    const r = round({ is_revote: true, nominated_seats: seats, vote_counts: counts, eligible_voters: 7 });
    expect(determineVotingResult(r).outcome).toBe('auto_no_elimination');
  });

  it('table decision majority is decided by tournament rules', () => {
    const base = round({ is_revote: true, nominated_seats: [2,5], vote_counts: {2:5,5:5}, eligible_voters: 10 });
    expect(determineVotingResult({ ...base, table_leave_votes: 6 }).resolvedOutcome).toBe('all_tied_eliminated');
    expect(determineVotingResult({ ...base, table_leave_votes: 5 }).resolvedOutcome).toBe('no_elimination');
  });
});
