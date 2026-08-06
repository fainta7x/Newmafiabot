import { describe, expect, it } from 'vitest';
import type { VotingRound } from '../shared/tournamentVoting';
import {
  moveNominatedSeat,
  parseOptionalVoteInput,
  parseVoteCountInput,
  setTableLeaveVotes,
  setVotingSeatCount,
  toggleNominatedSeat,
  updateEligibleVoters,
  updateVotingDay
} from '../components/crm/tournaments/protocol/protocolVotingEditorUtils';

const createRound = (
  overrides: Partial<VotingRound> = {}
): VotingRound => ({
  round_number: 1,
  is_revote: false,
  nominated_seats: [],
  vote_counts: {},
  day_number: 1,
  eligible_voters: 10,
  outcome: 'pending',
  ...overrides
});

describe('protocol voting editor utilities', () => {
  it('forces ten voters for the zero round', () => {
    const updated = updateVotingDay(
      createRound({ eligible_voters: 6 }),
      '0'
    );

    expect(updated.day_number).toBe(0);
    expect(updated.eligible_voters).toBe(10);
  });

  it('keeps the voter count when switching to another day', () => {
    const updated = updateVotingDay(
      createRound({ eligible_voters: 7 }),
      '3'
    );

    expect(updated.day_number).toBe(3);
    expect(updated.eligible_voters).toBe(7);
    expect(updateEligibleVoters(updated, '5').eligible_voters).toBe(5);
  });

  it('adds and removes a nominated seat with its vote count', () => {
    const added = toggleNominatedSeat(createRound(), 4);
    expect(added.nominated_seats).toEqual([4]);
    expect(added.vote_counts).toEqual({ 4: 0 });

    const removed = toggleNominatedSeat(added, 4);
    expect(removed.nominated_seats).toEqual([]);
    expect(removed.vote_counts).toEqual({});
  });

  it('preserves nomination order and moves candidates one position', () => {
    const round = createRound({
      nominated_seats: [2, 5, 8],
      vote_counts: { 2: 1, 5: 2, 8: 7 }
    });

    expect(moveNominatedSeat(round, 5, 'earlier').nominated_seats)
      .toEqual([5, 2, 8]);
    expect(moveNominatedSeat(round, 5, 'later').nominated_seats)
      .toEqual([2, 8, 5]);
    expect(moveNominatedSeat(round, 2, 'earlier').nominated_seats)
      .toEqual([2, 5, 8]);
  });

  it('strips non-digits and caps a vote count by eligible voters', () => {
    expect(parseVoteCountInput('12abc', 8)).toEqual({
      draftValue: '8',
      value: 8
    });
    expect(parseVoteCountInput('', 8)).toEqual({
      draftValue: '',
      value: 0
    });
  });

  it('uses null for an empty optional table-leave vote', () => {
    expect(parseOptionalVoteInput('', 6)).toEqual({
      draftValue: '',
      value: null
    });
    expect(parseOptionalVoteInput('9', 6)).toEqual({
      draftValue: '6',
      value: 6
    });
  });

  it('updates vote counts and table-leave votes immutably', () => {
    const round = createRound({
      vote_counts: { 2: 3 },
      table_leave_votes: null
    });

    expect(setVotingSeatCount(round, 5, 4).vote_counts)
      .toEqual({ 2: 3, 5: 4 });
    expect(setTableLeaveVotes(round, 6).table_leave_votes).toBe(6);
    expect(round.vote_counts).toEqual({ 2: 3 });
    expect(round.table_leave_votes).toBeNull();
  });
});
