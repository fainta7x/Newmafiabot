import type { PhysicalRole } from '../game/PhysicalRoleDeal.tsx';
import type { ActivePlayerState } from './types.js';
import { isSupportedTableSize, roleCountsMatchTable } from '../../lib/tableComposition.ts';

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

/** Roles must match the table size: 10 classic, 9 and 8 at a novice table (see tableComposition). */
export const roleDistributionIsValid = (players: ActivePlayerState[]): boolean => {
  const counts = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.role] = (acc[player.role] || 0) + 1;
    return acc;
  }, {});
  return roleCountsMatchTable({ citizen: counts['Мирный'], sheriff: counts['Шериф'], mafia: counts['Мафия'], don: counts['Дон'] }, players.length);
};

export const roleSetupIsValid = (players: ActivePlayerState[]): boolean => {
  if (!isSupportedTableSize(players.length) || players.some((player) => !player.user_id)) return false;
  return roleDistributionIsValid(players);
};

export const buildPhysicalRoleAssignments = (players: ActivePlayerState[]): Record<number, PhysicalRole> => {
  if (!roleDistributionIsValid(players)) return {};
  return Object.fromEntries(players.map((player) => [player.slot_num, liveRoleToPhysical(player.role)]));
};
