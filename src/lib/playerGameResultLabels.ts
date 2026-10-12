/** Common result wording on the player's archive and single-game detail.
 * A missing winner is deliberately not labeled here: each screen keeps its
 * established empty-result wording.
 */
export const getPlayerGameWinnerLabel = (winner: 'red' | 'black' | null): string | null => {
  if (winner === 'red') return '🔴 Победа красных';
  if (winner === 'black') return '⚫ Победа чёрных';
  return null;
};
