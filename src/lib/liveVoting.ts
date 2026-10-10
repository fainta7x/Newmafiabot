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
 * The candidate who is already voted out for certain in a round that is still being counted: his votes cannot be
 * reached or shared by anybody else. Null when nobody is decided yet (owner rule 2026-10-04: a removal during voting
 * cancels it only when there is no such candidate).
 */
export function findDecidedVoteLeader(round: {
  nominated_seats: number[];
  vote_counts?: Record<number, number>;
  eligible_voters?: number | null;
} | null | undefined): number | null {
  if (!round || !round.eligible_voters) return null;
  const counts = round.vote_counts || {};
  if (!isVoteDecided(round.nominated_seats, counts, round.eligible_voters)) return null;
  return [...round.nominated_seats].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0] ?? null;
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
 * A judge must always be able to correct a live ballot. Clicking a voter while
 * another nominee is active moves that voter to the active nominee; clicking
 * the same nominee again removes the assignment. Never lock a voter to an
 * earlier accidental choice.
 */
export function canToggleVoteAssignment(
  _voterSlot: number,
  _nominee: number,
  _votesByPlayer: Record<number, number>
): boolean {
  return true;
}

export function liveRoundToTournamentDay(roundNumber: number): number {
  return Math.max(0, Math.trunc(roundNumber) - 1);
}

/**
 * Whoever the mafia kills on the first night is the «first killed» and goes through the same best-move (ЛХ) chain,
 * whatever the role (owner, 2026-10-10): a black player who shot himself must not be recognisable by a skipped step.
 * A black first-killed gets no points for the best move and may skip it; see `clubGameProtocolService`.
 */
export function canRegisterFirstKilled(
  roundNumber: number,
  _role: string,
  wasActuallyKilled: boolean
): boolean {
  return roundNumber === 1 && wasActuallyKilled;
}

export function getSingularZeroRoundElimination(
  dayNumber: number,
  eliminatedSeats: number[]
): number | null {
  if (dayNumber !== 0 || eliminatedSeats.length !== 1) return null;
  const seat = eliminatedSeats[0];
  return Number.isInteger(seat) && seat >= 1 && seat <= 10 ? seat : null;
}
