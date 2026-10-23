import type { PhysicalRole } from '../game/PhysicalRoleDeal.tsx';
import type { ActivePlayerState } from './types.js';
import { isSupportedTableSize, roleCountsMatchTable } from '../../lib/tableComposition.ts';
import { normalizeGameRole } from '../../shared/gameRoles.ts';

export type LiveRole = ActivePlayerState['role'];

// Legacy/API role spellings enter the engine through the canonical vocabulary.
export const protocolRoleToLiveRole = (value: string): LiveRole | null => {
  const key = normalizeGameRole(value);
  return key;
};

export const liveRoleToPhysical = (role: LiveRole): PhysicalRole => normalizeGameRole(role) ?? 'citizen';

export const physicalRoleToLive = (role: PhysicalRole): LiveRole => role;

/** Roles must match the table size: 10 classic, 9 and 8 at a novice table (see tableComposition). */
export const roleDistributionIsValid = (players: ActivePlayerState[]): boolean => {
  const counts = players.reduce<Record<string, number>>((acc, player) => {
    const key = normalizeGameRole(player.role);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return roleCountsMatchTable(counts, players.length);
};

export const roleSetupIsValid = (players: ActivePlayerState[]): boolean => {
  if (!isSupportedTableSize(players.length) || players.some((player) => !player.user_id)) return false;
  return roleDistributionIsValid(players);
};

export const buildPhysicalRoleAssignments = (players: ActivePlayerState[]): Record<number, PhysicalRole> => {
  if (!roleDistributionIsValid(players)) return {};
  return Object.fromEntries(players.map((player) => [player.slot_num, liveRoleToPhysical(player.role)]));
};
