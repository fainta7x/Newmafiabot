import { describe, test, expect } from 'vitest';
import {
  calculateVoteRemainder,
  determineVotingResult,
  createNextRevoteRound,
  cleanAndSyncVotes,
  validateChildLeadersOrder,
  validateVotingHierarchy,
  VotingRound
} from '../shared/tournamentVoting';

describe('Tournament Voting Logic Tests', () => {
  test('1. Scenario: 2/2/2/2/2 -> 3/3/3/1/0 -> 5/5/0 -> 5/5', () => {
    // Stage 1: Main round, 5 candidates nominated, each gets 2 votes. Total 10 voters.
    const round1: VotingRound = {
      round_number: 1,
      day_number: 1,
      is_revote: false,
      nominated_seats: [1, 2, 3, 4, 5],
      vote_counts: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
      eligible_voters: 10
    };

    const res1 = determineVotingResult(round1);
    expect(res1.outcome).toBe('needs_revote');
    expect(res1.winners).toEqual([1, 2, 3, 4, 5]);

    // Stage 2: Revote with the 5 winners
    const round2 = createNextRevoteRound(round1, res1.winners);
    expect(round2.nominated_seats).toEqual([1, 2, 3, 4, 5]);

    // Vote distribution: 3/3/3/1/0 (sum = 10)
    round2.vote_counts = { 1: 3, 2: 3, 3: 3, 4: 1, 5: 0 };
    const res2 = determineVotingResult(round2);
    // Tie is among a smaller set of leaders (3 out of 5), so it's a tie but not repeated tie.
    expect(res2.outcome).toBe('needs_revote');
    expect(res2.winners).toEqual([1, 2, 3]);

    // Stage 3: Next revote with the 3 winners
    const round3 = createNextRevoteRound(round2, res2.winners);
    expect(round3.nominated_seats).toEqual([1, 2, 3]);

    // Vote distribution: 5/5/0 (sum = 10)
    round3.vote_counts = { 1: 5, 2: 5, 3: 0 };
    const res3 = determineVotingResult(round3);
    // Tie is among smaller subset (2 out of 3)
    expect(res3.outcome).toBe('needs_revote');
    expect(res3.winners).toEqual([1, 2]);

    // Stage 4: Next revote with 2 winners
    const round4 = createNextRevoteRound(round3, res3.winners);
    expect(round4.nominated_seats).toEqual([1, 2]);

    // Vote distribution: 5/5
    round4.vote_counts = { 1: 5, 2: 5 };
    const res4 = determineVotingResult(round4);
    // Repeated tie among the exact same composition of 2 candidates.
    // 2 is <= half of 10. So requires table decision.
    expect(res4.outcome).toBe('requires_table_decision');
    expect(res4.winners).toEqual([1, 2]);
  });

  test('2. Repeated tie among 2 candidates requires table decision', () => {
    const round: VotingRound = {
      round_number: 2,
      day_number: 1,
      is_revote: true,
      nominated_seats: [1, 2],
      vote_counts: { 1: 5, 2: 5 },
      eligible_voters: 10
    };
    const res = determineVotingResult(round);
    expect(res.outcome).toBe('requires_table_decision');
  });

  test('3. Seven out of seven twice leads to automatic no-elimination night', () => {
    // Round 1 (Main): 7 candidates, each gets 1 vote, total 7 voters.
    const round1: VotingRound = {
      round_number: 1,
      day_number: 1,
      is_revote: false,
      nominated_seats: [1, 2, 3, 4, 5, 6, 7],
      vote_counts: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 },
      eligible_voters: 7
    };
    const res1 = determineVotingResult(round1);
    expect(res1.outcome).toBe('needs_revote');
    expect(res1.winners).toEqual([1, 2, 3, 4, 5, 6, 7]);

    // Round 2 (Revote): Same 7 candidates, same 1/1/1/1/1/1/1 votes.
    const round2 = createNextRevoteRound(round1, res1.winners);
    round2.vote_counts = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 };
    const res2 = determineVotingResult(round2);
    // 7 candidates is > 3.5 (half of 7). Thus auto_no_elimination.
    expect(res2.outcome).toBe('auto_no_elimination');
  });

  test('4. Four out of eight in a repeated tie permits table decision', () => {
    const round: VotingRound = {
      round_number: 2,
      day_number: 1,
      is_revote: true,
      nominated_seats: [1, 2, 3, 4],
      vote_counts: { 1: 2, 2: 2, 3: 2, 4: 2 },
      eligible_voters: 8
    };
    const res = determineVotingResult(round);
    // 4 <= 4 (half of 8) -> requires_table_decision
    expect(res.outcome).toBe('requires_table_decision');
  });

  test('5. Single candidate gets all votes automatically', () => {
    const nominated_seats = [3];
    const initialCounts = { 3: 0 };
    const calculated = calculateVoteRemainder(nominated_seats, 10, initialCounts);
    expect(calculated[3]).toBe(10);
  });

  test('6. Last candidate gets remainder', () => {
    const nominated_seats = [1, 2, 3];
    const initialCounts = { 1: 4, 2: 3, 3: 0 };
    const calculated = calculateVoteRemainder(nominated_seats, 10, initialCounts);
    expect(calculated[3]).toBe(3); // 10 - 4 - 3 = 3
  });

  test('7. Order of leaders is preserved in child round', () => {
    const parentRound: VotingRound = {
      round_number: 1,
      day_number: 1,
      is_revote: false,
      nominated_seats: [5, 2, 8],
      vote_counts: { 5: 4, 2: 4, 8: 2 },
      eligible_voters: 10
    };
    const parentRes = determineVotingResult(parentRound);
    expect(parentRes.winners).toEqual([5, 2]); // 5 has 4 votes, 2 has 4 votes, in order they appear

    const childRound = createNextRevoteRound(parentRound, parentRes.winners);
    expect(childRound.nominated_seats).toEqual([5, 2]);

    expect(validateChildLeadersOrder(parentRound, childRound)).toBe(true);

    const invalidChildRound = {
      ...childRound,
      nominated_seats: [2, 5] // out of order
    };
    expect(validateChildLeadersOrder(parentRound, invalidChildRound)).toBe(false);
  });

  test('8. Removing an early stage deletes descendant rounds chain', () => {
    const r1: VotingRound = { round_number: 1, nominated_seats: [1, 2], vote_counts: { 1: 5, 2: 5 }, eligible_voters: 10, outcome: 'tie_revote' };
    const r2: VotingRound = { round_number: 2, is_revote: true, parent_round_number: 1, nominated_seats: [1, 2], vote_counts: { 1: 5, 2: 5 }, eligible_voters: 10, outcome: 'tie_revote' };
    const r3: VotingRound = { round_number: 3, is_revote: true, parent_round_number: 2, nominated_seats: [1, 2], vote_counts: { 1: 10, 2: 0 }, eligible_voters: 10, outcome: 'single_eliminated' };

    const initialList = [r1, r2, r3];

    // If we delete r2, r3 must also be deleted
    const filteredList = initialList.filter(r => r.round_number !== 2);
    const synced = cleanAndSyncVotes(filteredList);

    // r1 remains but its outcome should revert to 'pending' because its child r2 was deleted
    expect(synced.length).toBe(1);
    expect(synced[0].round_number).toBe(1);
    expect(synced[0].outcome).toBe('pending');
  });

  describe('validateVotingHierarchy tests', () => {
    test('1. main -> revote -> revote, where second tie_revote has no child: returns error', () => {
      const votes: VotingRound[] = [
        {
          round_number: 1,
          day_number: 1,
          is_revote: false,
          nominated_seats: [1, 2, 3],
          vote_counts: { 1: 3, 2: 3, 3: 4 },
          eligible_voters: 10,
          outcome: 'single_eliminated'
        },
        {
          round_number: 2,
          day_number: 2,
          is_revote: false,
          nominated_seats: [4, 5],
          vote_counts: { 4: 5, 5: 5 },
          eligible_voters: 10,
          outcome: 'tie_revote'
        },
        {
          round_number: 3,
          day_number: 2,
          is_revote: true,
          parent_round_number: 2,
          nominated_seats: [4, 5],
          vote_counts: { 4: 5, 5: 5 },
          eligible_voters: 10,
          outcome: 'tie_revote' // Second tie_revote but no child round exists for it!
        }
      ];

      const err = validateVotingHierarchy(votes);
      expect(err).not.toBeNull();
      expect(err).toContain('раунд #3 завершился ничьей, но для него отсутствует связанное переголосование');
    });

    test('2. Complete chain is valid', () => {
      const votes: VotingRound[] = [
        {
          round_number: 1,
          day_number: 2,
          is_revote: false,
          nominated_seats: [4, 5],
          vote_counts: { 4: 5, 5: 5 },
          eligible_voters: 10,
          outcome: 'tie_revote'
        },
        {
          round_number: 2,
          day_number: 2,
          is_revote: true,
          parent_round_number: 1,
          nominated_seats: [4, 5],
          vote_counts: { 4: 5, 5: 5 },
          eligible_voters: 10,
          outcome: 'tie_revote'
        },
        {
          round_number: 3,
          day_number: 2,
          is_revote: true,
          parent_round_number: 2,
          nominated_seats: [4, 5],
          vote_counts: { 4: 10, 5: 0 },
          eligible_voters: 10,
          outcome: 'single_eliminated'
        }
      ];

      const err = validateVotingHierarchy(votes);
      expect(err).toBeNull();
    });

    test('3. Completed no_elimination after automatic night doesn\'t require child', () => {
      const votes: VotingRound[] = [
        {
          round_number: 1,
          day_number: 1,
          is_revote: false,
          nominated_seats: [1, 2, 3, 4],
          vote_counts: { 1: 2, 2: 2, 3: 2, 4: 2 },
          eligible_voters: 8,
          outcome: 'no_elimination' // e.g. automatic night
        }
      ];

      const err = validateVotingHierarchy(votes);
      expect(err).toBeNull();
    });
  });
});
