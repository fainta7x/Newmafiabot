import type { PhysicalRole } from '../game/PhysicalRoleDeal.tsx';
import type { ActivePlayerState } from './types.js';

export type LiveRole = ActivePlayerState['role'];

export const protocolRoleToLiveRole = (value: string): LiveRole | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'citizen' || normalized === 'мирный') return 'Мирный';
  if (normalized === 'sheriff' || normalized === 'шериф') return 'Шериф';
  if (normalized === 'mafia' || normalized === 'мафия') return 'Мафия';
  if (normalized === 'don' || normalized === 'дон') return 'Дон';
  return null;
};

export const liveRoleToPhysical = (role: LiveRole): PhysicalRole => {
  if (role === 'Шериф') return 'sheriff';
  if (role === 'Мафия') return 'mafia';
  if (role === 'Дон') return 'don';
  return 'citizen';
};

export const physicalRoleToLive = (role: PhysicalRole): LiveRole => {
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Мирный';
};

export const roleDistributionIsValid = (players: ActivePlayerState[]): boolean => {
  const counts = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.role] = (acc[player.role] || 0) + 1;
    return acc;
  }, {});
  return counts['Мирный'] === 6 && counts['Шериф'] === 1 && counts['Мафия'] === 2 && counts['Дон'] === 1;
};

export const roleSetupIsValid = (players: ActivePlayerState[]): boolean => {
  if (players.length !== 10 || players.some((player) => !player.user_id)) return false;
  return roleDistributionIsValid(players);
};

export const buildPhysicalRoleAssignments = (players: ActivePlayerState[]): Record<number, PhysicalRole> => {
  if (!roleDistributionIsValid(players)) return {};
  return Object.fromEntries(players.map((player) => [player.slot_num, liveRoleToPhysical(player.role)]));
};
