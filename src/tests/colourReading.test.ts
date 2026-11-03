import { describe, expect, it } from 'vitest';
import { buildColourReading } from '../lib/colourReading';
import type { StatGame } from '../lib/gameStatistics';

// Seats 1-10: 1 don, 2-3 mafia, 4 sheriff, 5-10 citizens. Player ids are «p<seat>».
const roles = ['don', 'mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen'] as const;
let seq = 0;
const ev = (round: number, kind: string, extra: Record<string, unknown>) => ({ seq: ++seq, at: '', round, phase: 'day_voting', kind, ...extra });
const voting = (round: number, number: number, ballots: Array<[number, number]>, outcome: string) => [
  ...ballots.map(([seat, target]) => ev(round, 'vote', { seat, target, value: number })),
  ev(round, 'vote_round_result', { value: `${number}:${outcome}` }),
];
const game = (events: any[]): StatGame => ({
  id: `g${seq}`, source: 'club', date: '2026-11-01', winner: 'red',
  seats: roles.map((role, i) => ({ seat: i + 1, role, playerId: `p${i + 1}` })), events,
});

describe('«Читать цвет»', () => {
  const g = game(voting(2, 1, [[5, 2], [6, 2], [7, 4], [8, 5], [2, 5], [1, 5], [4, 1], [9, 2]], 'single_eliminated'));

  it('reads a red player\'s own votes: correct, wrong, don, sheriff', () => {
    expect(buildColourReading([g], 'p7').mine_wrong).toEqual([{ playerId: 'p4', count: 1 }]);
    expect(buildColourReading([g], 'p7').mine_sheriff).toEqual([{ playerId: 'p4', count: 1 }]);
    expect(buildColourReading([g], 'p4').mine_correct).toEqual([{ playerId: 'p1', count: 1 }]);
    expect(buildColourReading([g], 'p4').mine_don).toEqual([{ playerId: 'p1', count: 1 }]);
  });

  it('votes for you: correct while you are black, wrong while you are red; only red voters', () => {
    const black = buildColourReading([g], 'p2');
    expect(black.me_correct.map((e) => e.playerId)).toEqual(['p5', 'p6', 'p9']);
    expect(black.mafia_against.map((e) => e.playerId)).toEqual(['p5', 'p6', 'p9']);
    const red = buildColourReading([g], 'p5');
    expect(red.me_wrong).toEqual([{ playerId: 'p8', count: 1 }]); // p2 and p1 are black: not counted
  });

  it('does not count the player\'s own votes while he is black', () => {
    const don = buildColourReading([g], 'p1');
    expect(don.mine_correct).toEqual([]);
    expect(don.mine_wrong).toEqual([]);
    expect(don.don_against).toEqual([{ playerId: 'p4', count: 1 }]);
    expect(don.don_with).toEqual([{ playerId: 'p8', count: 1 }]); // red voters who voted for the same seat
  });

  it('leaves out a day with a split («попил»)', () => {
    const split = game([
      ...voting(1, 1, [[5, 2], [6, 2], [7, 3], [8, 3]], 'needs_revote'),
      ...voting(1, 2, [[5, 2], [6, 2], [7, 2], [8, 3]], 'single_eliminated'),
    ]);
    expect(buildColourReading([split], 'p2').me_correct).toEqual([]);
    expect(buildColourReading([split], 'p2').games).toBe(0);
  });

  it('keeps the top three by count', () => {
    const many = [1, 2, 3, 4].map(() => game(voting(2, 1, [[5, 2], [6, 2], [7, 2]], 'single_eliminated')));
    many.push(game(voting(2, 1, [[8, 2]], 'single_eliminated')));
    const result = buildColourReading(many, 'p2');
    expect(result.me_correct).toEqual([{ playerId: 'p5', count: 4 }, { playerId: 'p6', count: 4 }, { playerId: 'p7', count: 4 }]);
    expect(result.games).toBe(5);
  });
});
