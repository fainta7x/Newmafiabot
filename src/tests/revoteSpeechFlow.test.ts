import { describe, expect, test } from 'vitest';
import {
  createNextRevoteRound,
  determineVotingResult,
  type VotingRound,
} from '../shared/tournamentVoting';

describe('live revote speech flow', () => {
  test('same disputed set goes directly to raise/leave after its first revote', () => {
    const mainVote: VotingRound = {
      round_number: 1,
      day_number: 1,
      is_revote: false,
      nominated_seats: [1, 2, 3],
      vote_counts: { 1: 3, 2: 3, 3: 3 },
      eligible_voters: 9,
    };

    const initialTie = determineVotingResult(mainVote);
    expect(initialTie.outcome).toBe('needs_revote');
    expect(initialTie.winners).toEqual([1, 2, 3]);

    const revote = createNextRevoteRound(mainVote, initialTie.winners);
    revote.round_number = 2;
    revote.vote_counts = { 1: 3, 2: 3, 3: 3 };

    const repeatedSet = determineVotingResult(revote);
    expect(repeatedSet.outcome).toBe('requires_table_decision');
    expect(repeatedSet.winners).toEqual([1, 2, 3]);
  });

  test('same disputed set does not get another speech cycle when exact vote numbers differ', () => {
    const parent: VotingRound = {
      round_number: 1,
      day_number: 2,
      is_revote: false,
      nominated_seats: [1, 2],
      vote_counts: { 1: 4, 2: 4 },
      eligible_voters: 8,
    };

    const tie = determineVotingResult(parent);
    const revote = createNextRevoteRound(parent, tie.winners);
    revote.round_number = 2;
    revote.vote_counts = { 1: 4, 2: 4 };

    expect(determineVotingResult(revote).outcome).toBe('requires_table_decision');
  });

  test('changed disputed set still requires a new revote speech cycle', () => {
    const parent: VotingRound = {
      round_number: 1,
      day_number: 2,
      is_revote: true,
      nominated_seats: [1, 2, 3],
      vote_counts: { 1: 4, 2: 4, 3: 2 },
      eligible_voters: 10,
    };

    const changedSet = determineVotingResult(parent);
    expect(changedSet.outcome).toBe('needs_revote');
    expect(changedSet.winners).toEqual([1, 2]);

    const nextRevote = createNextRevoteRound(parent, changedSet.winners);
    expect(nextRevote.nominated_seats).toEqual([1, 2]);
  });
});
