import type { Player } from '../../types.js';
import type { ActivePlayerState } from './types.js';
import { roleDistributionIsValid, type LiveRole } from './setupRoles.js';
import { isSupportedTableSize, tableRoleCounts, tableRolesLabel } from '../../lib/tableComposition.ts';

/** The deck for a table of this size: 10 classic, 9 and 8 at a novice table. */
const rolesForTable = (size: number): LiveRole[] => {
  const counts = tableRoleCounts(isSupportedTableSize(size) ? size : 10);
  return [
    ...Array<LiveRole>(counts.citizen).fill('Мирный'),
    ...Array<LiveRole>(counts.sheriff).fill('Шериф'),
    ...Array<LiveRole>(counts.mafia).fill('Мафия'),
    ...Array<LiveRole>(counts.don).fill('Дон'),
  ];
};

const teamForRole = (role: LiveRole): ActivePlayerState['team'] => (
  role === 'Мафия' || role === 'Дон' ? 'Чёрные' : 'Красные'
);

export const autoFillSetupPlayers = (
  seats: ActivePlayerState[],
  players: Player[],
): ActivePlayerState[] => seats.map((seat, index) => players[index]
  ? { ...seat, user_id: players[index].user_id, nickname: players[index].nickname }
  : seat);

export const shuffleSetupRoles = (
  seats: ActivePlayerState[],
  random: () => number = Math.random,
): ActivePlayerState[] => {
  const roles = rolesForTable(seats.length);
  for (let index = roles.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [roles[index], roles[target]] = [roles[target], roles[index]];
  }
  return seats.map((seat, index) => {
    const role = roles[index];
    return { ...seat, role, team: teamForRole(role) };
  });
};

export const selectSetupPlayer = (
  seats: ActivePlayerState[],
  players: Player[],
  slot: number,
  userId: number,
): ActivePlayerState[] => {
  const source = players.find((player) => player.user_id === userId);
  return seats.map((seat) => seat.slot_num === slot
    ? { ...seat, user_id: userId, nickname: source?.nickname || '' }
    : seat);
};

export const selectSetupRole = (
  seats: ActivePlayerState[],
  slot: number,
  role: LiveRole,
): ActivePlayerState[] => seats.map((seat) => seat.slot_num === slot
  ? { ...seat, role, team: teamForRole(role) }
  : seat);

export const getSetupStartValidationError = (
  judgeId: number,
  seats: ActivePlayerState[],
): string | null => {
  if (!judgeId) return 'Выберите ведущего';
  if (seats.some((seat) => !seat.user_id)) return `Заполните все ${seats.length} мест`;
  const assigned = seats.map((seat) => seat.user_id);
  if (new Set(assigned).size !== seats.length) return 'Один игрок не может сидеть на двух местах';
  if (!isSupportedTableSize(seats.length)) return 'За столом должно быть от 8 до 10 игроков';
  if (!roleDistributionIsValid(seats)) return `Нужны роли${seats.length === 10 ? ' ФСМ' : ''}: ${tableRolesLabel(seats.length)}`;
  return null;
};
