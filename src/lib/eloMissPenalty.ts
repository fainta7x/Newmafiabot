/** Fixed Elo cut for the player the judge names as responsible for a miss (owner, 2026-11-01: −10; before it was 6). */
export const MISSED_SHOT_ELO = 10;
export type MissReason = 'error' | 'intentional';
export interface MissAssessment { miss_reason?: MissReason | null; miss_responsible_seats?: number[] }

/** Legacy/unassessed misses never establish guilt. The judge records the reason and responsible seats. */
export function missedShotNights(protocol: any, seat: number): number[] {
  if (protocol?.winner_team !== 'red') return [];
  const seen = new Set<number>();
  for (const shot of Array.isArray(protocol?.shots) ? protocol.shots : []) {
    const night = Number(shot?.night_number);
    if (!Number.isInteger(night) || night < 1 || !['miss', 'agreement_failed'].includes(shot?.result)
      || shot?.miss_reason !== 'error' || !Array.isArray(shot?.miss_responsible_seats)) continue;
    if (shot.miss_responsible_seats.includes(seat)) seen.add(night);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Fixed Elo cut for a red who broke a split on purpose on any circle (owner, 2026-11-01). */
export const SPLIT_BREAK_RED_ELO = 20;
/** Fixed Elo cut for each red who raised a hand for the LAST raise after which the game was lost (owner, 2026-11-01). */
export const RAISE_DEFEAT_ELO = 20;
/** Bonus for each black who was at the table when the reds raised the last, game-losing raise (owner, 2026-11-01). */
export const RAISE_DEFEAT_BLACK_BONUS_ELO = 10;
