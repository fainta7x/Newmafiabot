import { gameTeamOfRole } from '../../shared/gameRoles.ts';
import { roundToTwo } from '../utils/ciHelper.ts';

/**
 * The points of one player in one game, the same for the tournament table and the rating period table
 * (domain model, 2026-10-23): a win point, the positive judge and protocol points, the best move, minus the
 * discipline and the negative judge and protocol points, plus Ci.
 */
export function scoreGamePoints(input: {
  winnerTeam: string | null | undefined;
  role: string | null | undefined;
  judgeBonus: number;
  protocolBonus: number;
  bestMovePoints: number;
  disciplinaryPenalty: number;
  ci: number;
}) {
  const team = gameTeamOfRole(input.role);
  const winPoint = team && team === input.winnerTeam ? 1 : 0;
  const positiveJudge = Math.max(input.judgeBonus, 0);
  const negativeJudge = Math.max(-input.judgeBonus, 0);
  const positiveProtocol = Math.max(input.protocolBonus, 0);
  const negativeProtocol = Math.max(-input.protocolBonus, 0);
  const positivePoints = roundToTwo(positiveJudge + positiveProtocol);
  const gamePenaltyPoints = roundToTwo(negativeJudge + negativeProtocol);
  const bestMove = roundToTwo(input.bestMovePoints);
  const disciplinaryPoints = roundToTwo(input.disciplinaryPenalty);
  const additional = roundToTwo(positivePoints + bestMove - disciplinaryPoints - gamePenaltyPoints);
  return {
    winPoint, positiveJudge, negativeJudge, positiveProtocol, negativeProtocol,
    positivePoints, gamePenaltyPoints, bestMove, disciplinaryPoints, additional,
    total: roundToTwo(winPoint + additional + input.ci),
  };
}
