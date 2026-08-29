import { describe, expect, it } from 'vitest';
import { createNextRevoteRound, determineVotingResult, type VotingRound } from '../shared/tournamentVoting';
import { canRegisterFirstKilled, getSingularZeroRoundElimination, liveRoundToTournamentDay } from '../lib/liveVoting';
import { buildVotingFarewellQueue, determineLiveWinner } from '../lib/liveGameFlow';

const round = (partial: Partial<VotingRound>): VotingRound => ({
  round_number: partial.round_number ?? 1,
  is_revote: partial.is_revote ?? false,
  nominated_seats: partial.nominated_seats ?? [],
  vote_counts: partial.vote_counts ?? {},
  day_number: partial.day_number ?? 0,
  eligible_voters: partial.eligible_voters ?? 10,
  parent_round_number: partial.parent_round_number ?? null,
  parent_nominated_seats: partial.parent_nominated_seats,
  parent_vote_counts: partial.parent_vote_counts,
  outcome: partial.outcome ?? 'pending',
  eliminated_seats: partial.eliminated_seats ?? [],
  table_leave_votes: partial.table_leave_votes ?? null,
});

describe('stage 3.2 live game scenario', () => {
  it('maps the first discussion to zero round and registers only a singular zero-round elimination', () => {
    expect(liveRoundToTournamentDay(1)).toBe(0);
    expect(getSingularZeroRoundElimination(0, [6])).toBe(6);
    expect(getSingularZeroRoundElimination(0, [6, 7])).toBeNull();
  });

  it('supports repeated revotes while giving speeches once per disputed set', () => {
    const main = round({
      nominated_seats: [1, 2, 3, 4, 5],
      vote_counts: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
    });
    const r1 = determineVotingResult(main);
    expect(r1.outcome).toBe('needs_revote');

    const second = createNextRevoteRound(main, r1.winners);
    second.round_number = 2;
    second.vote_counts = { 1: 3, 2: 3, 3: 3, 4: 1, 5: 0 };
    const r2 = determineVotingResult(second);
    expect(r2.outcome).toBe('needs_revote');
    expect(r2.winners).toEqual([1, 2, 3]);

    const third = createNextRevoteRound(second, r2.winners);
    third.round_number = 3;
    third.vote_counts = { 1: 5, 2: 5, 3: 0 };
    const r3 = determineVotingResult(third);
    expect(r3.outcome).toBe('needs_revote');
    expect(r3.winners).toEqual([1, 2]);

    const fourth = createNextRevoteRound(third, r3.winners);
    fourth.round_number = 4;
    fourth.vote_counts = { 1: 5, 2: 5 };
    const r4 = determineVotingResult(fourth);
    expect(r4.outcome).toBe('requires_table_decision');
  });

  it('sends a repeated seven-way tie at seven alive directly to night with nobody eliminated', () => {
    const seats = [1, 2, 3, 4, 5, 6, 7];
    const first = round({
      nominated_seats: seats,
      vote_counts: Object.fromEntries(seats.map((seat) => [seat, 1])),
      eligible_voters: 7,
      day_number: 3,
    });
    const firstResult = determineVotingResult(first);
    const revote = createNextRevoteRound(first, firstResult.winners);
    revote.round_number = 2;
    revote.vote_counts = Object.fromEntries(seats.map((seat) => [seat, 1]));
    const result = determineVotingResult(revote);
    expect(result.outcome).toBe('auto_no_elimination');
    expect(result.eliminatedSeats).toEqual([]);
  });

  it('keeps farewell speeches in nomination order for every player raised by the table', () => {
    expect(buildVotingFarewellQueue([5, 2], [7, 2, 9, 5])).toEqual([2, 5]);
  });

  it('allows first-killed best move only for a red role on Night 1', () => {
    expect(canRegisterFirstKilled(1, 'Мирный', true)).toBe(true);
    expect(canRegisterFirstKilled(1, 'Шериф', true)).toBe(true);
    expect(canRegisterFirstKilled(1, 'Мафия', true)).toBe(false);
    expect(canRegisterFirstKilled(1, 'Дон', true)).toBe(false);
    expect(canRegisterFirstKilled(2, 'Мирный', true)).toBe(false);
  });

  it('applies automatic win conditions after eliminations', () => {
    expect(determineLiveWinner([
      { slot_num: 1, team: 'Красные', alive: true },
      { slot_num: 2, team: 'Красные', alive: true },
      { slot_num: 3, team: 'Чёрные', alive: false },
    ])).toBe('Красные');

    expect(determineLiveWinner([
      { slot_num: 1, team: 'Красные', alive: true },
      { slot_num: 2, team: 'Красные', alive: true },
      { slot_num: 3, team: 'Чёрные', alive: true },
      { slot_num: 4, team: 'Чёрные', alive: true },
    ])).toBe('Чёрные');

    expect(determineLiveWinner([
      { slot_num: 1, team: 'Красные', alive: true },
      { slot_num: 2, team: 'Красные', alive: true },
      { slot_num: 3, team: 'Красные', alive: true },
      { slot_num: 4, team: 'Чёрные', alive: true },
    ])).toBeNull();
  });
});