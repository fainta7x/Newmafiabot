/** Shared Russian labels for the four Mafia roles on player-facing game pages. *
 * Unknown or missing values return null so each screen can preserve its own
 * existing fallback without inventing a player role.
 */
export const getPlayerGameRoleLabel = (role: string | null | undefined): string | null => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return null;
};
