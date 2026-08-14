export function getExplicitVoteCounts(
  nominatedSeats: number[],
  votesByPlayer: Record<number, number>,
  eligibleVoterSeats?: number[]
): Record<number, number> {
  const counts: Record<number, number> = {};
  nominatedSeats.forEach((seat) => { counts[seat] = 0; });
  const eligible = eligibleVoterSeats ? new Set(eligibleVoterSeats) : null;

  Object.entries(votesByPlayer).forEach(([voterRaw, nominee]) => {
    const voter = Number(voterRaw);
    if (eligible && !eligible.has(voter)) return;
    if (!nominatedSeats.includes(nominee)) return;
    counts[nominee] = (counts[nominee] || 0) + 1;
  });

  return counts;
}

/**
 * Pure arithmetic helper. It may be useful for analytics, but it must never
 * terminate or lock a live sports-mafia vote: the judge still completes the
 * full nomination order and the remaining ballots go to the last nominee.
 */
export function isVoteDecided(
  nominatedSeats: number[],
  explicitVoteCounts: Record<number, number>,
  eligibleVoters: number
): boolean {
  if (nominatedSeats.length === 0 || eligibleVoters <= 0) return false;

  const allocated = nominatedSeats.reduce((sum, seat) => sum + (explicitVoteCounts[seat] || 0), 0);
  const remaining = Math.max(0, eligibleVoters - allocated);
  const sorted = nominatedSeats
    .map((seat) => explicitVoteCounts[seat] || 0)
    .sort((a, b) => b - a);

  if (sorted.length === 0) return false;
  const highest = sorted[0];
  const secondHighest = sorted[1] ?? 0;
  const leaders = sorted.filter((count) => count === highest).length;

  if (leaders !== 1) return false;
  return highest > secondHighest + remaining;
}

/**
 * Live voting intentionally never reports an early "decided" state.
 * Even when the leader cannot mathematically be caught, sports-mafia procedure
 * continues through every nominated player before the final result is fixed.
 */
export function isVoteDecidedFromAssignments(
  _nominatedSeats: number[],
  _votesByPlayer: Record<number, number>,
  _eligibleVoterSeats: number[]
): boolean {
  return false;
}

/**
 * A voter may correct their choice while the same candidate is being counted,
 * but cannot move an already-cast vote directly to a later candidate.
 */
export function canToggleVoteAssignment(
  voterSlot: number,
  nominee: number,
  votesByPlayer: Record<number, number>
): boolean {
  const existing = votesByPlayer[voterSlot];
  return existing === undefined || existing === nominee;
}

export function liveRoundToTournamentDay(roundNumber: number): number {
  return Math.max(0, Math.trunc(roundNumber) - 1);
}

export function canRegisterFirstKilled(
  roundNumber: number,
  role: string,
  wasActuallyKilled: boolean
): boolean {
  return roundNumber === 1 && wasActuallyKilled && (role === 'Мирный' || role === 'Шериф');
}

export function getSingularZeroRoundElimination(
  dayNumber: number,
  eliminatedSeats: number[]
): number | null {
  if (dayNumber !== 0 || eliminatedSeats.length !== 1) return null;
  const seat = eliminatedSeats[0];
  return Number.isInteger(seat) && seat >= 1 && seat <= 10 ? seat : null;
}
