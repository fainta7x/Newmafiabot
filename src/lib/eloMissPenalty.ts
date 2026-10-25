export const MISSED_SHOT_ELO = 2;
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
