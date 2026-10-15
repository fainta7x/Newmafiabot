/** Shared Russian labels for the four Mafia roles on player-facing game pages. *
 * Unknown or missing values return null so each screen can preserve its own
 * existing fallback without inventing a player role.
 */
export const getPlayerGameRoleLabel = (role: string | null | undefined): string | null => {
  return getGameRoleDefinition(role)?.label ?? null;
};
import { getGameRoleDefinition } from '../shared/gameRoles.ts';
