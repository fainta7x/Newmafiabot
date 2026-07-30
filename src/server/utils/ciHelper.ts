export function normalizeRole(r: string | null | undefined): string | null {
  if (!r) return null;
  const lower = r.trim().toLowerCase();
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(lower)) return 'citizen';
  if (['sheriff', 'шериф'].includes(lower)) return 'sheriff';
  if (['mafia', 'мафия', 'black', 'черный'].includes(lower)) return 'mafia';
  if (['don', 'дон'].includes(lower)) return 'don';
  return lower;
}

export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calculateCiThreshold(distanceGames: number): number {
  return Math.round(distanceGames * 0.4);
}

export function calculateCiRate(firstKilledCount: number, thresholdB: number): number {
  if (firstKilledCount <= 0) return 0;
  return firstKilledCount >= thresholdB ? 0.5 : 0;
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
  const normRole = normalizeRole(params.role);

  if (!params.isFirstKilled || (normRole !== 'citizen' && normRole !== 'sheriff')) {
    return { gameCi: 0, ciReason: 'not_eligible' };
  }

  if (params.winnerTeam === 'black') {
    return { gameCi: params.playerRate, ciReason: 'red_loss_full' };
  }

  if (params.winnerTeam === 'red') {
    if (params.bestMoveParticipantId === params.participantId && params.hasBlackInBestMove) {
      return {
        gameCi: roundToTwo(0.5 * params.playerRate),
        ciReason: 'red_win_half_with_black_lh',
      };
    }
  }

  return { gameCi: 0, ciReason: 'not_eligible' };
}
