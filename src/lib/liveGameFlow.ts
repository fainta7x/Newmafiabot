export type LiveWinnerTeam = 'Красные' | 'Чёрные';

export interface LiveFlowPlayer {
  slot_num: number;
  team: 'Красные' | 'Чёрные';
  alive: boolean;
}

/**
 * FSM win condition for the live table.
 * City wins when no black players remain.
 * Mafia wins when living black players are equal to or outnumber living reds.
 */
export function determineLiveWinner(players: LiveFlowPlayer[]): LiveWinnerTeam | null {
  const alive = players.filter((player) => player.alive);
  const red = alive.filter((player) => player.team === 'Красные').length;
  const black = alive.filter((player) => player.team === 'Чёрные').length;

  if (black === 0) return 'Красные';
  if (black >= red) return 'Чёрные';
  return null;
}

/**
 * Every player who leaves by voting receives a farewell minute.
 * Preserve voting/nomination order when it is known and append any remaining
 * eliminated seats deterministically.
 */
export function buildVotingFarewellQueue(
  eliminatedSeats: number[],
  votingOrder: number[] = [],
): number[] {
  const eliminated = new Set(
    eliminatedSeats.filter((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10),
  );
  const queue: number[] = [];

  for (const seat of votingOrder) {
    if (eliminated.has(seat) && !queue.includes(seat)) queue.push(seat);
  }
  for (const seat of eliminatedSeats) {
    if (eliminated.has(seat) && !queue.includes(seat)) queue.push(seat);
  }

  return queue;
}
