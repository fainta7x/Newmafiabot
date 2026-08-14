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
 * Detects when a sequential vote is mathematically decided from EXPLICIT votes only.
 * Automatic remainder for the last candidate must not be included here.
 *
 * The current leader is locked only when even giving every still-unassigned
 * ballot to the strongest opponent cannot produce a tie or overtake.
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

export function isVoteDecidedFromAssignments(
  nominatedSeats: number[],
  votesByPlayer: Record<number, number>,
  eligibleVoterSeats: number[]
): boolean {
  const counts = getExplicitVoteCounts(nominatedSeats, votesByPlayer, eligibleVoterSeats);
  return isVoteDecided(nominatedSeats, counts, eligibleVoterSeats.length);
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
