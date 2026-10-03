/**
 * Balanced seating plan for a tournament distance (owner, 2026-10-03).
 *
 * Players complained about sitting on the same seat in many games. Shuffling every game on its own
 * does that: with 10 games and 10 seats a given player lands on one seat three times or more with
 * a noticeable probability. This plan makes every block of `tableSize` games a Latin square: a player
 * takes each seat once before any seat repeats. Within that rule it prefers rows where players
 * who already sat next to each other (seats are a circle, 10 next to 1) are not neighbours again.
 */
export type SeatingRandom = () => number;

const shuffle = <T>(items: T[], random: SeatingRandom): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** One random perfect matching players -> allowed seats, or null when none exists. */
const randomMatching = (allowed: boolean[][], random: SeatingRandom): number[] | null => {
  const size = allowed.length;
  const seatOwner: number[] = Array(size).fill(-1);
  const options = allowed.map((row) => shuffle(row.map((ok, seat) => (ok ? seat : -1)).filter((seat) => seat >= 0), random));
  const tryAssign = (player: number, seen: boolean[]): boolean => {
    for (const seat of options[player]) {
      if (seen[seat]) continue;
      seen[seat] = true;
      if (seatOwner[seat] < 0 || tryAssign(seatOwner[seat], seen)) {
        seatOwner[seat] = player;
        return true;
      }
    }
    return false;
  };
  for (const player of shuffle(Array.from({ length: size }, (_, index) => index), random)) {
    if (!tryAssign(player, Array(size).fill(false))) return null;
  }
  return seatOwner;
};

/**
 * @returns plan[game][seat] = player index (0-based), seats 0..tableSize-1.
 */
export function buildBalancedSeatingPlan(
  gameCount: number,
  tableSize = 10,
  random: SeatingRandom = Math.random,
  candidatesPerGame = 400,
): number[][] {
  const seatUse = Array.from({ length: tableSize }, () => Array(tableSize).fill(0) as number[]);
  const neighbourUse = Array.from({ length: tableSize }, () => Array(tableSize).fill(0) as number[]);
  const plan: number[][] = [];

  for (let game = 0; game < gameCount; game += 1) {
    // A seat is open to a player while it is among the seats the player has used least.
    const allowed = seatUse.map((row) => {
      const least = Math.min(...row);
      return row.map((used) => used === least);
    });

    let best: number[] | null = null;
    let bestScore = Infinity;
    for (let attempt = 0; attempt < candidatesPerGame; attempt += 1) {
      const candidate = randomMatching(allowed, random);
      if (!candidate) break;
      let score = 0;
      for (let seat = 0; seat < tableSize; seat += 1) {
        const a = candidate[seat];
        const b = candidate[(seat + 1) % tableSize];
        score += (neighbourUse[a][b] + 1) ** 2;
      }
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    if (!best) throw new Error('Не удалось построить рассадку');

    for (let seat = 0; seat < tableSize; seat += 1) {
      const a = best[seat];
      const b = best[(seat + 1) % tableSize];
      seatUse[a][seat] += 1;
      neighbourUse[a][b] += 1;
      neighbourUse[b][a] += 1;
    }
    plan.push(best);
  }
  return plan;
}

/** Orders participants into per-game seat lists using the balanced plan. */
export function seatParticipants<T>(participants: T[], gameCount: number, random: SeatingRandom = Math.random): T[][] {
  // Which participant is "player 0" must not matter, so the identities are shuffled once.
  const identities = shuffle(participants, random);
  return buildBalancedSeatingPlan(gameCount, participants.length, random)
    .map((game) => game.map((playerIndex) => identities[playerIndex]));
}
