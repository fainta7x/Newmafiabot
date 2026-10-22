import { gameTeamOfRole } from '../../shared/gameRoles.ts';
export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calculateCiThreshold(distanceGames: number): number {
  return Math.round(distanceGames * 0.4);
}

export function calculateCiRate(firstKilledCount: number, thresholdB: number): number {
  if (firstKilledCount <= 0 || thresholdB <= 0) return 0;

  return roundToTwo(
    Math.min(0.4, (firstKilledCount * 0.4) / thresholdB)
  );
}

export interface CiParams {
  isFirstKilled: boolean;
  role: string | null;
  winnerTeam: 'red' | 'black' | string | null;
  bestMoveParticipantId: string | null;
  participantId: string;
  hasBlackInBestMove: boolean;
  playerRate: number;
}

export function calculateGameCi(params: CiParams): {
  gameCi: number;
  ciReason: 'red_loss_full' | 'red_win_half_with_black_lh' | 'not_eligible';
} {
  if (!params.isFirstKilled || gameTeamOfRole(params.role) !== 'red') {
    return { gameCi: 0, ciReason: 'not_eligible' };
  }

  // Owner rule (2026-10-03): no compensation unless the first-killed player's best move names at least one black player
  if (!params.hasBlackInBestMove || params.bestMoveParticipantId !== params.participantId) {
    return { gameCi: 0, ciReason: 'not_eligible' };
  }

  if (params.winnerTeam === 'black') {
    return { gameCi: params.playerRate, ciReason: 'red_loss_full' };
  }

  if (params.winnerTeam === 'red') {
    return {
      gameCi: roundToTwo(0.5 * params.playerRate),
      ciReason: 'red_win_half_with_black_lh',
    };
  }

  return { gameCi: 0, ciReason: 'not_eligible' };
}
