import { describe, expect, it } from 'vitest';
import { calculateCanonicalEloGame, normalizeContributions, type CanonicalEloGamePlayer, type PreparedEloEvent } from '../server/services/eloRatingService.ts';
import { explainEloDelta } from '../lib/eloExplanation.ts';

const table = (): CanonicalEloGamePlayer[] => Array.from({ length: 10 }, (_, i) => ({
  playerId: `p${i}`, team: i < 7 ? 'red' : 'black', elo: 1000, canonicalPersonalGamePoints: 0,
}));
const black = (bonus: number, discipline = 0, contribution = 0) => {
  const players = table();
  players[7] = { ...players[7], canonicalPersonalGamePoints: bonus - discipline, disciplinaryPenaltyPoints: discipline, contributionPoints: contribution };
  return calculateCanonicalEloGame(players, 'black')[7];
};

describe('personal Elo stays secondary; discipline keeps its original weight', () => {
  it('a +0.5 sporting bonus adds +10, so an equal-table black win becomes +25', () => {
    const row = black(0.5);
    expect(row.personalDelta).toBe(10);
    expect(row.totalDelta).toBeCloseTo(25, 10);
  });

  it('bounds all personal sources together without scaling discipline down', () => {
    const row = black(1, 1, 1);
    expect(row.personalDelta).toBe(20);
    expect(row.contributionDelta).toBe(20);
    expect(row.personalCapDelta).toBe(-10);
    expect(row.disciplinaryDelta).toBe(-40);
    expect(row.totalDelta).toBeCloseTo(5, 10);
  });

  it('a minor technical foul still costs 12 Elo even with no bonuses', () => {
    const row = black(0, 0.3);
    expect(row.personalDelta).toBe(0);
    expect(row.disciplinaryDelta).toBe(-12);
    expect(row.totalDelta).toBeCloseTo(3, 10);
  });

  it('caps excessive negative personal scores separately from discipline', () => {
    const row = black(-2, 1, -1);
    expect(row.personalDelta + row.contributionDelta + row.personalCapDelta).toBe(-30);
    expect(row.disciplinaryDelta).toBe(-40);
  });

  it('caps the automatic contribution at 20 while retaining raw points for explanations', () => {
    const events: PreparedEloEvent[] = [{ source: 'club', sourceId: '1', sortAt: '', sortOrder: 1, winnerTeam: 'black',
      players: [{ playerId: 'p', team: 'black', canonicalPersonalGamePoints: 0, contribution: { role: 'mafia', raw: 4 } }] }];
    normalizeContributions(events);
    expect(events[0].players[0].contributionPoints).toBe(1);
    expect(events[0].players[0].contribution?.raw).toBe(4);
  });

  it('does not add another loss penalty just because a player is weaker than teammates', () => {
    const players = table().map((player, i) => ({ ...player, elo: i < 7 ? 2000 : i === 7 ? 2150 : 2450 }));
    const row = calculateCanonicalEloGame(players, 'red')[7];
    expect(row.expectedTeamResult).toBeCloseTo(0.90, 12);
    expect(row.carryModifier).toBe(1);
    expect(row.totalDelta).toBeCloseTo(-45, 10);
  });

  it('explains automatic contribution, personal cap and discipline in the same sum', () => {
    const row = black(1, 1, 1);
    const explanation = explainEloDelta({ ...row, won: true });
    expect(explanation.formula).toBe('15 + 20 + 20 − 10 − 40 = 5');
    expect(explanation.details.some((line) => line.includes('ограничение личной части −10'))).toBe(true);
    expect(explanation.details.some((line) => line.includes('дисциплина −40'))).toBe(true);
  });
});
