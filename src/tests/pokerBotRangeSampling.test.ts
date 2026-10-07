import { describe, expect, it } from 'vitest';
import { estimateEquity } from '../server/services/pokerBot.ts';
import type { PokerCard } from '../server/services/pokerEngine.ts';

const cards = (values: string[]): PokerCard[] => values.map((value) => ({ rank: value[0] as PokerCard['rank'], suit: ({ c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' } as const)[value[1] as 'c' | 'd' | 'h' | 's'] }));
const rng = () => { let seed = 123; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; };

describe('equity sampling respects legal inferred ranges', () => {
  it('samples only aces from a narrow preflop range on a complete river', () => {
    const hole = cards(['Kc', 'Kd']);
    const board = cards(['Qc', '7d', '2s', '9h', '3c']);
    for (const retries of [0, 8, 40, 200]) expect(estimateEquity(hole, board, [0.005], rng(), 200, retries)).toBe(0);
  });

  it('supports two opponents with the same narrow range', () => {
    expect(estimateEquity(cards(['Kc', 'Kd']), cards(['Qc', '7d', '2s', '9h', '3c']), [0.005, 0.005], rng(), 200)).toBe(0);
  });

  it('uses the closest legal range when all four aces are blocked', () => {
    // AA is impossible. KK is the next legal class; the only remaining KK ties the hero's quad aces with a king kicker.
    expect(estimateEquity(cards(['Kc', 'Kd']), cards(['As', 'Ad', 'Ac', 'Ah', '3c']), [0.005], rng(), 200)).toBe(0.5);
  });

  it('produces finite equity when one opponent blocks another inferred range', () => {
    const equity = estimateEquity(cards(['Kc', 'Kd']), cards(['Qc', '7d', '2s', '9h', '3c']), [0.005, 0.005, 0.005], rng(), 200);
    expect(equity).toBe(0);
  });

  it('retains broad-range equity and seed reproducibility', () => {
    const hole = cards(['Ah', 'Ad']);
    const board = cards(['Qc', '7d', '2s', '9h', '3c']);
    const result = estimateEquity(hole, board, [1], rng(), 2000);
    expect(result).toBeGreaterThan(0.86);
    expect(result).toBeLessThan(0.93);
    expect(estimateEquity(hole, board, [1], rng(), 2000, 0)).toBe(result);
  });
});
