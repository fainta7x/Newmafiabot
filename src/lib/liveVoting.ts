/**
 * Live voting helper functions.
 */

/**
 * Detects when the current sequential vote is mathematically already decided
 * and a unique candidate cannot be caught by any remaining votes.
 */
export function isVoteDecided(
  nominatedSeats: number[],
  voteCounts: Record<number, number>,
  eligibleVoters: number
): boolean {
  if (nominatedSeats.length === 0) return false;

  // Compute allocated votes
  const allocatedSum = nominatedSeats.reduce((sum, seat) => sum + (voteCounts[seat] || 0), 0);
  const remaining = Math.max(0, eligibleVoters - allocatedSum);

  // Find highest and second highest
  let highest = -1;
  let uniqueLeader = false;
  let secondHighest = 0;

  for (const seat of nominatedSeats) {
    const count = voteCounts[seat] || 0;
    if (count > highest) {
      secondHighest = highest;
      highest = count;
      uniqueLeader = true;
    } else if (count === highest) {
      uniqueLeader = false;
    } else if (count > secondHighest) {
      secondHighest = count;
    }
  }

  if (!uniqueLeader || highest === -1) {
    return false;
  }

  return highest > Math.max(secondHighest, remaining);
}
