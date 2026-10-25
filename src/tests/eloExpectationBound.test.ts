import { describe, expect, it } from 'vitest';
import { BLACK_MAX_EXPECTATION, calculateCanonicalEloGame, expectedRedTeamResult, RED_MAX_EXPECTATION } from '../server/services/eloRatingService.ts';

describe('owner-approved red expectation upper bound', () => {
  it('preserves the flat equal-level prior and never predicts more than 60% red wins', () => {
    for (const gap of [-150, 0, 150]) expect(expectedRedTeamResult(gap)).toBe(0.30);
    const gaps = [151, 200, 250, 300, 350, 1000, 1_000_000];
    const probabilities = gaps.map(expectedRedTeamResult);
    expect(probabilities.every((p) => p >= 0.30 && p <= RED_MAX_EXPECTATION)).toBe(true);
    expect([...probabilities].sort((a, b) => a - b)).toEqual(probabilities);
    expect(probabilities.at(-1)).toBeGreaterThanOrEqual(0.55);
  });

  it('smoothly limits the strongest black team to the owner-approved 90%', () => {
    const gaps = [-1_000_000, -1000, -350, -300, -250, -200, -151, -150, 0];
    const probabilities = gaps.map(expectedRedTeamResult);
    expect([...probabilities].sort((a, b) => a - b)).toEqual(probabilities);
    expect(probabilities.every((p) => 1 - p <= BLACK_MAX_EXPECTATION)).toBe(true);
    expect(expectedRedTeamResult(-350)).toBeCloseTo(0.10, 12);
    expect(expectedRedTeamResult(-150)).toBe(0.30);
  });

  it('keeps complementary team expectations in the actual game calculator', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, team: (i < 7 ? 'red' : 'black') as 'red' | 'black', elo: i < 7 ? 2000 : 1000, canonicalPersonalGamePoints: 0 }));
    const deltas = calculateCanonicalEloGame(players, 'red');
    expect(deltas[0].expectedTeamResult + deltas[7].expectedTeamResult).toBeCloseTo(1, 12);
    expect(deltas[0].resultDelta).toBeGreaterThanOrEqual(20);
  });
});
