import { describe, expect, it } from 'vitest';
import { createEmptyActivePlayer } from '../components/LiveGameEngine/engineStateModel.ts';
import { getDaySpeakerQueue, getNextDayStarterSlot } from '../components/LiveGameEngine/daySpeechModel.ts';
import { getSetupStartValidationError, shuffleSetupRoles } from '../components/LiveGameEngine/setupState.ts';
import { roleSetupIsValid } from '../components/LiveGameEngine/setupRoles.ts';
import { getLiveGameTableSize, CLUB_EVENING_ENGINE_JUDGE_NOTE } from '../components/LiveGameEngine/setupMode.ts';
import { readRestorableLiveSession } from '../components/LiveGameEngine/liveSessionStorage.ts';

const table = (size: number) => Array.from({ length: size }, (_, index) => ({
  ...createEmptyActivePlayer(index + 1), user_id: 100 + index, nickname: `Игрок ${index + 1}`,
}));
const count = (roles: string[], role: string) => roles.filter((item) => item === role).length;

describe('live game at a novice table', () => {
  it('deals the deck of the table size: 8 → one mafia, 9 → two, 10 → classic', () => {
    for (const [size, mafia, citizens] of [[8, 1, 5], [9, 2, 5], [10, 2, 6]] as const) {
      const dealt = shuffleSetupRoles(table(size));
      const roles = dealt.map((player) => player.role);
      expect([count(roles, 'Мафия'), count(roles, 'Мирный'), count(roles, 'Дон'), count(roles, 'Шериф')]).toEqual([mafia, citizens, 1, 1]);
      expect(roleSetupIsValid(dealt)).toBe(true);
      expect(getSetupStartValidationError(1, dealt)).toBeNull();
    }
  });

  it('refuses the classic deck at a table of 8', () => {
    const seats = table(8).map((player, index) => ({ ...player, role: (index < 2 ? 'Мафия' : index === 2 ? 'Дон' : index === 3 ? 'Шериф' : 'Мирный') as any }));
    expect(roleSetupIsValid(seats)).toBe(false);
    expect(getSetupStartValidationError(1, seats)).toBe('Нужны роли: 5 мирных, Шериф, 1 мафия и Дон');
  });

  it('passes speeches round a table of 8', () => {
    const players = table(8).map((player) => ({ ...player, alive: true }));
    expect(getNextDayStarterSlot(players, 8)).toBe(1);
    expect(getDaySpeakerQueue(players, 7).map((player) => player.slot_num)).toEqual([7, 8, 1, 2, 3, 4, 5, 6]);
  });

  it('takes the club game roster size, and keeps 10 elsewhere', () => {
    const player = (notes?: string) => ({ user_id: 1, nickname: 'x', notes } as any);
    expect(getLiveGameTableSize([...Array(8).fill(player()), player(CLUB_EVENING_ENGINE_JUDGE_NOTE)])).toBe(8);
    expect(getLiveGameTableSize([...Array(10).fill(player()), player(CLUB_EVENING_ENGINE_JUDGE_NOTE)])).toBe(10);
    expect(getLiveGameTableSize(Array(25).fill(player()))).toBe(10);
  });

  it('restores an unfinished game of 9 after a reload', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
    storage.setItem('mafia_live_session', JSON.stringify({ phase: 'day_speeches', activePlayers: table(9) }));
    expect(readRestorableLiveSession(storage)?.activePlayers).toHaveLength(9);
    // A 10-seat game opened later is not offered the stored table of 9.
    expect(readRestorableLiveSession(storage, 10)).toBeNull();
    expect(readRestorableLiveSession(storage, 9)?.activePlayers).toHaveLength(9);
    storage.setItem('mafia_live_session', JSON.stringify({ phase: 'day_speeches', activePlayers: table(7) }));
    expect(readRestorableLiveSession(storage)).toBeNull();
  });
});
