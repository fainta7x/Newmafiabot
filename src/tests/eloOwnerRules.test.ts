import { describe, expect, it } from 'vitest';
import { calculateCanonicalEloGame } from '../server/services/eloRatingService.ts';

// Seats 0–6 are red, 7–9 black. Ratings are on the ×5 scale (owner, 2026-10-01).
const table = (elos: number[]) => elos.map((elo, index) => ({
  playerId: `p${index}`, team: (index < 7 ? 'red' : 'black') as 'red' | 'black', elo, canonicalPersonalGamePoints: 0,
}));
const delta = (elos: number[], winner: 'red' | 'black', seat: number) => calculateCanonicalEloGame(table(elos), winner)[seat].totalDelta;

describe('Elo follows the owner rules (2026-10-01)', () => {
  it('a weak mafia carried by two strong mafias against weak citizens gains little', () => {
    const carried = delta([...Array(7).fill(750), 500, 1750, 1750], 'black', 7);
    const equal = delta(Array(10).fill(1000), 'black', 7);
    expect(carried).toBeLessThan(equal);
  });

  it('a weak black with average blacks against strong citizens gains a lot', () => {
    const underdog = delta([...Array(7).fill(1750), 500, 750, 750], 'black', 7);
    expect(underdog).toBeGreaterThan(delta(Array(10).fill(1000), 'black', 7) * 1.5);
  });

  it('a strong player in a weak team loses less, and the protection shrinks as the levels get closer', () => {
    const lossOf = (me: number) => delta([me, ...Array(9).fill(1000)], 'black', 0);
    const teammateLoss = delta([2000, ...Array(9).fill(1000)], 'black', 1);
    expect(lossOf(2000)).toBeGreaterThan(teammateLoss);
    expect(lossOf(2000)).toBeGreaterThan(lossOf(1500));
    expect(lossOf(1500)).toBeGreaterThan(lossOf(1000));
    expect(lossOf(1000)).toBeCloseTo(delta(Array(10).fill(1000), 'black', 1), 6);
  });

  it('one game at an equal table moves Elo on the ×5 scale', () => {
    const equal = Array(10).fill(1000);
    expect(delta(equal, 'red', 0)).toBeCloseTo(35, 6);
    expect(delta(equal, 'black', 0)).toBeCloseTo(-15, 6);
    expect(delta(equal, 'black', 7)).toBeCloseTo(15, 6);
    expect(delta(equal, 'red', 7)).toBeCloseTo(-35, 6);
  });
});
