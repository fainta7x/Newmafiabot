import { describe, expect, it } from 'vitest';
import { createEmptyActivePlayer } from '../components/LiveGameEngine/engineStateModel.js';
import {
  canNightTargetGiveFirstKilledBestMove,
  findNightTarget,
  getDonCheckResult,
  getSheriffCheckResult,
  toggleNightShotTarget,
} from '../components/LiveGameEngine/nightTargetModel.js';

const createPlayer = (
  slot: number,
  role: 'Мирный' | 'Шериф' | 'Мафия' | 'Дон' = 'Мирный',
) => ({
  ...createEmptyActivePlayer(slot),
  user_id: 100 + slot,
  nickname: `Player ${slot}`,
  role,
  team: role === 'Мафия' || role === 'Дон' ? 'Чёрные' as const : 'Красные' as const,
});

describe('Live Game night target model', () => {
  it('finds the selected shot target without changing alive semantics', () => {
    const players = [createPlayer(1), { ...createPlayer(2), alive: false }];
    expect(findNightTarget(players, null)).toBeNull();
    expect(findNightTarget(players, 2)).toBe(players[1]);
    expect(findNightTarget(players, 10)).toBeNull();
  });

  it('toggles the same shot target off and replaces a different target', () => {
    expect(toggleNightShotTarget(null, 4)).toBe(4);
    expect(toggleNightShotTarget(4, 4)).toBeNull();
    expect(toggleNightShotTarget(4, 7)).toBe(7);
  });

  it('preserves first-killed best-move eligibility', () => {
    const citizen = createPlayer(3, 'Мирный');
    const sheriff = createPlayer(4, 'Шериф');
    const mafia = createPlayer(5, 'Мафия');

    expect(canNightTargetGiveFirstKilledBestMove(null, null, 1)).toBe(false);
    expect(canNightTargetGiveFirstKilledBestMove(citizen, null, 1)).toBe(true);
    expect(canNightTargetGiveFirstKilledBestMove(sheriff, null, 1)).toBe(true);
    expect(canNightTargetGiveFirstKilledBestMove(mafia, null, 1)).toBe(false);
    expect(canNightTargetGiveFirstKilledBestMove(citizen, null, 2)).toBe(false);
    expect(canNightTargetGiveFirstKilledBestMove(citizen, 8, 1)).toBe(false);
    expect(canNightTargetGiveFirstKilledBestMove(citizen, 3, 1)).toBe(true);
  });

  it('preserves Don and Sheriff check result mapping', () => {
    expect(getDonCheckResult(createPlayer(1, 'Шериф'))).toBe(true);
    expect(getDonCheckResult(createPlayer(2, 'Мирный'))).toBe(false);
    expect(getDonCheckResult(createPlayer(3, 'Мафия'))).toBe(false);

    expect(getSheriffCheckResult(createPlayer(4, 'Мафия'))).toBe('ЧЁРНЫЙ!');
    expect(getSheriffCheckResult(createPlayer(5, 'Дон'))).toBe('ЧЁРНЫЙ!');
    expect(getSheriffCheckResult(createPlayer(6, 'Мирный'))).toBe('Красный');
    expect(getSheriffCheckResult(createPlayer(7, 'Шериф'))).toBe('Красный');
  });
});
