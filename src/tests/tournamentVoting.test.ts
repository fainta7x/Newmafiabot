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

    const round2 = createNextRevoteRound(round1, res1.winners);
    expect(round2.nominated_seats).toEqual([1, 2, 3, 4, 5]);
    round2.round_number = 2;
    round2.vote_counts = { 1: 3, 2: 3, 3: 3, 4: 1, 5: 0 };
    const res2 = determineVotingResult(round2);
    expect(res2.outcome).toBe('needs_revote');
    expect(res2.winners).toEqual([1, 2, 3]);

    const round3 = createNextRevoteRound(round2, res2.winners);
    round3.round_number = 3;
    expect(round3.nominated_seats).toEqual([1, 2, 3]);
    round3.vote_counts = { 1: 5, 2: 5, 3: 0 };
    const res3 = determineVotingResult(round3);
    expect(res3.outcome).toBe('needs_revote');
    expect(res3.winners).toEqual([1, 2]);

    const round4 = createNextRevoteRound(round3, res3.winners);
    round4.round_number = 4;
    expect(round4.nominated_seats).toEqual([1, 2]);
    round4.vote_counts = { 1: 5, 2: 5 };
    const res4 = determineVotingResult(round4);
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

    const round2 = createNextRevoteRound(round1, res1.winners);
    round2.vote_counts = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 };
    const res2 = determineVotingResult(round2);
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
    expect(calculated[3]).toBe(3);
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
    expect(parentRes.winners).toEqual([5, 2]);

    const childRound = createNextRevoteRound(parentRound, parentRes.winners);
    expect(childRound.nominated_seats).toEqual([5, 2]);
    expect(childRound.parent_nominated_seats).toEqual([5, 2, 8]);
    expect(childRound.parent_vote_counts).toEqual({ 5: 4, 2: 4, 8: 2 });
    expect(validateChildLeadersOrder(parentRound, childRound)).toBe(true);

    const invalidChildRound = {
      ...childRound,
      nominated_seats: [2, 5]
    };
    expect(validateChildLeadersOrder(parentRound, invalidChildRound)).toBe(false);
  });

  test('8. Removing an early stage deletes descendant rounds chain', () => {
    const r1: VotingRound = { round_number: 1, nominated_seats: [1, 2], vote_counts: { 1: 5, 2: 5 }, eligible_voters: 10, outcome: 'tie_revote' };
    const r2: VotingRound = { round_number: 2, is_revote: true, parent_round_number: 1, nominated_seats: [1, 2], vote_counts: { 1: 5, 2: 5 }, eligible_voters: 10, outcome: 'tie_revote' };
    const r3: VotingRound = { round_number: 3, is_revote: true, parent_round_number: 2, nominated_seats: [1, 2], vote_counts: { 1: 10, 2: 0 }, eligible_voters: 10, outcome: 'single_eliminated' };

    const initialList = [r1, r2, r3];
    const filteredList = initialList.filter(r => r.round_number !== 2);
    const synced = cleanAndSyncVotes(filteredList);

    expect(synced.length).toBe(1);
    expect(synced[0].round_number).toBe(1);
    expect(synced[0].outcome).toBe('pending');
  });

  test('9. Changed 4/4/2 -> 5/5 goes straight to table decision for unchanged #1/#2 set', () => {
    const parent: VotingRound = {
      round_number: 1,
      day_number: 2,
      is_revote: true,
      nominated_seats: [1, 2, 3],
      vote_counts: { 1: 4, 2: 4, 3: 2 },
      eligible_voters: 10,
    };
    const parentResult = determineVotingResult(parent);
    expect(parentResult.outcome).toBe('needs_revote');
    expect(parentResult.winners).toEqual([1, 2]);

    const firstFiveFive = createNextRevoteRound(parent, parentResult.winners);
    firstFiveFive.round_number = 2;
    firstFiveFive.vote_counts = { 1: 5, 2: 5 };
    expect(determineVotingResult(firstFiveFive).outcome).toBe('requires_table_decision');
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
          outcome: 'tie_revote'
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
          outcome: 'no_elimination'
        }
      ];

      const err = validateVotingHierarchy(votes);
      expect(err).toBeNull();
    });
  });
});