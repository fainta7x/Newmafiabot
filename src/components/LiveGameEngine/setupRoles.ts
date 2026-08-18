import type { PhysicalRole } from '../game/PhysicalRoleDeal.tsx';
import type { ActivePlayerState } from './types.js';

export type LiveRole = ActivePlayerState['role'];

export const physicalRoleToLive = (role: PhysicalRole): LiveRole => {
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Мирный';
};

export const roleSetupIsValid = (players: ActivePlayerState[]): boolean => {
  if (players.length !== 10 || players.some((player) => !player.user_id)) return false;
  const counts = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.role] = (acc[player.role] || 0) + 1;
    return acc;
  }, {});
  return counts['Мирный'] === 6 && counts['Шериф'] === 1 && counts['Мафия'] === 2 && counts['Дон'] === 1;
};
