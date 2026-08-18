import type { Player } from '../../types.js';
import type { ActivePlayerState } from './types.js';
import { roleDistributionIsValid, type LiveRole } from './setupRoles.js';

const FSM_ROLES: LiveRole[] = [
  'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный',
  'Шериф', 'Мафия', 'Мафия', 'Дон',
];

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
  const roles = [...FSM_ROLES];
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
  if (seats.some((seat) => !seat.user_id)) return 'Заполните все 10 мест';
  const assigned = seats.map((seat) => seat.user_id);
  if (new Set(assigned).size !== 10) return 'Один игрок не может сидеть на двух местах';
  if (!roleDistributionIsValid(seats)) return 'Нужны роли ФСМ: 6 мирных, Шериф, 2 мафии и Дон';
  return null;
};
