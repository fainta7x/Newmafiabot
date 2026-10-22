import { describe, expect, it } from 'vitest';
import { scoreGamePoints } from '../server/services/gameScore.ts';

describe('one game score for the tournament and the rating period tables', () => {
  it('adds the win point, positive bonuses, best move and Ci, and subtracts negative bonuses and discipline', () => {
    const score = scoreGamePoints({ winnerTeam: 'red', role: 'sheriff', judgeBonus: 0.3, protocolBonus: -0.2, bestMovePoints: 0.3, disciplinaryPenalty: 0.6, ci: 0.2 });
    expect(score).toMatchObject({ winPoint: 1, positivePoints: 0.3, gamePenaltyPoints: 0.2, bestMove: 0.3, disciplinaryPoints: 0.6, additional: -0.2, total: 1 });
  });

  it('gives the win point by team, in any role spelling, and never for an unknown role', () => {
    expect(scoreGamePoints({ winnerTeam: 'black', role: 'Дон', judgeBonus: 0, protocolBonus: 0, bestMovePoints: 0, disciplinaryPenalty: 0, ci: 0 }).winPoint).toBe(1);
    expect(scoreGamePoints({ winnerTeam: 'black', role: 'citizen', judgeBonus: 0, protocolBonus: 0, bestMovePoints: 0, disciplinaryPenalty: 0, ci: 0 }).winPoint).toBe(0);
    expect(scoreGamePoints({ winnerTeam: 'red', role: null, judgeBonus: 0, protocolBonus: 0, bestMovePoints: 0, disciplinaryPenalty: 0, ci: 0 }).winPoint).toBe(0);
  });
});
