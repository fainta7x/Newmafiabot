import { describe, expect, it } from 'vitest';
import { buildZeroRoundPlayerCounts } from '../lib/zeroRoundPlayerCounts.ts';
import type { StatGame } from '../lib/gameStatistics.ts';

const game = (events: StatGame['events'], votingRounds?: StatGame['votingRounds']): StatGame => ({
  id: 'club:1', source: 'club', date: '2026-10-16', winner: 'red',
  seats: [1,2,3,4].map(seat => ({seat, role: 'citizen', playerId: `p${seat}` })),
  events, votingRounds,
});

describe('zero round player indicators', () => {
  it('counts candidates raised on a confirmed leave-at-table result once per game', () => {
    const events: StatGame['events'] = [
      { seq: 1, at: '', round: 1, phase: 'day', kind: 'vote', seat: 3, target: 1, value: 1 },
      { seq: 2, at: '', round: 1, phase: 'day', kind: 'vote', seat: 4, target: 2, value: 1 },
      { seq: 3, at: '', round: 1, phase: 'day', kind: 'vote_round_result', value: '1:no_elimination' },
    ];
    const counts = buildZeroRoundPlayerCounts([game(events)]);
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

  it('uses a completed zero-day tie from historical voting rounds and does not double-count', () => {
    const counts = buildZeroRoundPlayerCounts([game([], [{
      round_number: 1, day_number: 0, nominated_seats: [1,2,3], vote_counts: {1: 4, 2: 4, 3: 2},
      outcome: 'no_elimination',
    }])]);
    expect(counts.get('p1')?.raised).toBe(1);
    expect(counts.get('p2')?.raised).toBe(1);
    expect(counts.has('p3')).toBe(false);
  });
});
