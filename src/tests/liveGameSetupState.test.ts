import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../types.js';
import { createEmptyActivePlayer } from '../components/LiveGameEngine/engineStateModel.js';
import type { LiveRole } from '../components/LiveGameEngine/setupRoles.js';
import {
  autoFillSetupPlayers,
  getSetupStartValidationError,
  selectSetupPlayer,
  selectSetupRole,
  shuffleSetupRoles,
} from '../components/LiveGameEngine/setupState.js';

const createSeats = () => Array.from({ length: 10 }, (_, index) => createEmptyActivePlayer(index + 1));
const players = Array.from({ length: 10 }, (_, index) => ({
  user_id: index + 101,
  nickname: `Player ${index + 1}`,
} as Player));

describe('Live Game setup state', () => {
  it('autofills available players in seat order and leaves unmatched seats unchanged', () => {
    const seats = createSeats();
    const result = autoFillSetupPlayers(seats, players.slice(0, 2));

    expect(result[0]).toMatchObject({ slot_num: 1, user_id: 101, nickname: 'Player 1' });
    expect(result[1]).toMatchObject({ slot_num: 2, user_id: 102, nickname: 'Player 2' });
    expect(result[2]).toBe(seats[2]);
  });

  it('uses the same Fisher-Yates role order and team mapping as the engine', () => {
    const random = vi.fn(() => 0);
    const result = shuffleSetupRoles(createSeats(), random);

    expect(random).toHaveBeenCalledTimes(9);
    expect(result.map((seat) => seat.role)).toEqual([
      'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный',
      'Шериф', 'Мафия', 'Мафия', 'Дон', 'Мирный',
    ]);
    expect(result.map((seat) => seat.team)).toEqual([
      'Красные', 'Красные', 'Красные', 'Красные', 'Красные',
      'Красные', 'Чёрные', 'Чёрные', 'Чёрные', 'Красные',
    ]);
  });

  it('updates only the selected player seat and keeps unknown-player nickname fallback', () => {
    const seats = createSeats();
    const selected = selectSetupPlayer(seats, players, 4, 104);
    expect(selected[3]).toMatchObject({ slot_num: 4, user_id: 104, nickname: 'Player 4' });
    expect(selected[2]).toBe(seats[2]);

    const unknown = selectSetupPlayer(seats, players, 4, 999);
    expect(unknown[3]).toMatchObject({ slot_num: 4, user_id: 999, nickname: '' });
  });

  it('updates role and team only on the selected seat', () => {
    const seats = createSeats();
    const black = selectSetupRole(seats, 2, 'Дон');
    expect(black[1]).toMatchObject({ role: 'Дон', team: 'Чёрные' });
    expect(black[0]).toBe(seats[0]);

    const red = selectSetupRole(black, 2, 'Шериф');
    expect(red[1]).toMatchObject({ role: 'Шериф', team: 'Красные' });
  });

  it('preserves setup validation order and exact user-facing errors', () => {
    const empty = createSeats();
    expect(getSetupStartValidationError(0, empty)).toBe('Выберите ведущего');
    expect(getSetupStartValidationError(1, empty)).toBe('Заполните все 10 мест');

    const filled = autoFillSetupPlayers(empty, players);
    const duplicate = filled.map((seat, index) => index === 9 ? { ...seat, user_id: filled[0].user_id } : seat);
    expect(getSetupStartValidationError(1, duplicate)).toBe('Один игрок не может сидеть на двух местах');
    expect(getSetupStartValidationError(1, filled)).toBe('Нужны роли ФСМ: 6 мирных, Шериф, 2 мафии и Дон');

    const roles: LiveRole[] = [
      'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный',
      'Шериф', 'Мафия', 'Мафия', 'Дон',
    ];
    const valid = roles.reduce(
      (state, role, index) => selectSetupRole(state, index + 1, role),
      filled,
    );
    expect(getSetupStartValidationError(1, valid)).toBeNull();
  });
});
