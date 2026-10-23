import { describe, expect, it } from 'vitest';
import { buildZeroRoundPlayerCounts } from '../lib/zeroRoundPlayerCounts.ts';
import type { StatGame } from '../lib/gameStatistics.ts';

const game = (events: StatGame['events'], votingRounds?: StatGame['votingRounds']): StatGame => ({
  id: 'club:1', source: 'club', date: '2026-10-16', winner: 'red',
  seats: [1,2,3,4].map(seat => ({seat, role: 'citizen', playerId: `p${seat}` })),
  events, votingRounds,
});

describe('zero round player indicators', () => {
  it('counts two players eliminated after double revote', () => {
    const counts = buildZeroRoundPlayerCounts([game([], [
      { round_number: 1, day_number: 0, nominated_seats: [1,2], vote_counts: {1:5,2:5}, outcome: 'tie_revote' },
      { round_number: 2, day_number: 0, parent_round_number: 1, is_revote: true, nominated_seats: [1,2], vote_counts: {1:5,2:5}, outcome: 'tie_revote' },
      { round_number: 3, day_number: 0, parent_round_number: 2, is_revote: true, nominated_seats: [1,2], vote_counts: {1:5,2:5}, outcome: 'all_tied_eliminated', eliminated_seats: [1,2] },
    ])]);
    expect(counts.get('p1')?.raised).toBe(1);
    expect(counts.get('p2')?.raised).toBe(1);
    expect(counts.has('p3')).toBe(false);
  });

  it('never guesses who broke a split from votes, only explicit judge records count', () => {
    const counts = buildZeroRoundPlayerCounts([game([
      { seq: 1, at: '', round: 1, phase: 'day', kind: 'vote', seat: 3, target: 1, value: 1 },
    ]),game([
      { seq: 1, at: '', round: 1, phase: 'day', kind: 'zero_round_break', seat: 3 },
      { seq: 2, at: '', round: 1, phase: 'day', kind: 'zero_round_break', seat: 3 },
      { seq: 3, at: '', round: 2, phase: 'day', kind: 'zero_round_break', seat: 4 },
    ])]);
    expect(counts.get('p3')?.broke).toBe(1);
    expect(counts.has('p4')).toBe(false);
  });

  it('does not count a no-elimination or a mere tie as raised', () => {
    const counts = buildZeroRoundPlayerCounts([game([], [
      { round_number: 1, day_number: 0, nominated_seats: [1,2], vote_counts: {1:5,2:5}, outcome: 'tie_revote' },
      { round_number: 2, day_number: 0, parent_round_number: 1, is_revote: true, nominated_seats: [1,2], vote_counts: {1:5,2:5}, outcome: 'no_elimination' },
    ])]);
    expect(counts.has('p1')).toBe(false);
    expect(counts.has('p2')).toBe(false);
  });

  it('takes the latest breaker mark: a later seat replaces an earlier one, a mark without a seat clears it', () => {
    const counts = buildZeroRoundPlayerCounts([game([
      { seq: 1, at: '', round: 1, phase: 'day_voting', kind: 'zero_round_break', seat: 3 },
      { seq: 2, at: '', round: 1, phase: 'day_voting', kind: 'zero_round_break', seat: 4 },
    ]), game([
      { seq: 1, at: '', round: 1, phase: 'day_voting', kind: 'zero_round_break', seat: 1 },
      { seq: 2, at: '', round: 1, phase: 'day_voting', kind: 'zero_round_break' },
    ])]);
    expect(counts.get('p4')?.broke).toBe(1);
    expect(counts.has('p3')).toBe(false);
    expect(counts.has('p1')).toBe(false);
  });
});
