import { describe, expect, it } from 'vitest';
import { buildBalancedSeatingPlan, seatParticipants } from '../server/services/tournamentSeatingPlan.ts';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const seatCounts = (plan: number[][], size = 10) => {
  const counts = Array.from({ length: size }, () => Array(size).fill(0) as number[]);
  plan.forEach((game) => game.forEach((player, seat) => { counts[player][seat] += 1; }));
  return counts;
};

describe('balanced tournament seating', () => {
  it('puts every player on every seat exactly once in ten games', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const plan = buildBalancedSeatingPlan(10, 10, seeded(seed));
      expect(plan).toHaveLength(10);
      plan.forEach((game) => expect([...game].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
      seatCounts(plan).forEach((row) => expect(row).toEqual(Array(10).fill(1)));
    }
  });

  it('keeps the balance for other distance lengths: no seat repeats before every seat was used', () => {
    for (const games of [3, 5, 7, 12, 20]) {
      const counts = seatCounts(buildBalancedSeatingPlan(games, 10, seeded(games)));
      counts.forEach((row) => {
        expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(1);
        expect(Math.max(...row)).toBeLessThanOrEqual(Math.ceil(games / 10));
      });
    }
    seatCounts(buildBalancedSeatingPlan(20, 10, seeded(99))).forEach((row) => expect(row).toEqual(Array(10).fill(2)));
  });

  it('does not make the same two players neighbours game after game', () => {
    let worst = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const plan = buildBalancedSeatingPlan(10, 10, seeded(seed * 7));
      const pairs = new Map<string, number>();
      plan.forEach((game) => game.forEach((player, seat) => {
        const other = game[(seat + 1) % 10];
        const key = [player, other].sort((a, b) => a - b).join('-');
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }));
      worst = Math.max(worst, ...pairs.values());
    }
    expect(worst).toBeLessThanOrEqual(5);
  });

  it('seats the given participants, none lost or duplicated', () => {
    const people = Array.from({ length: 10 }, (_, index) => ({ id: `p${index}` }));
    const games = seatParticipants(people, 10, seeded(5));
    expect(games).toHaveLength(10);
    games.forEach((game) => expect(new Set(game.map((p) => p.id)).size).toBe(10));
    const seatOfFirst = games.map((game) => game.findIndex((p) => p.id === 'p0'));
    expect(new Set(seatOfFirst).size).toBe(10);
  });
});
