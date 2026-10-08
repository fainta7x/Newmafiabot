import { describe, expect, it } from 'vitest';
import {
  nextTrainingBestMoveSeat,
  TRAINING_BEST_MOVE_SEATS,
  TRAINING_DEATH_PROTOCOL,
  nextTrainingDeathMark,
  matchesTrainingDeathProtocol,
  canToggleTrainingDeathMark,
} from '../lib/judgeTrainingProtocols.ts';
import { getJudgeTrainingGate } from '../lib/judgeConductTraining.ts';
import type { PersistedLiveSession } from '../components/LiveGameEngine/liveSessionStorage.ts';

describe('guided LH', () => {
  it('requires three real ordered clicks before confirming', () => {
    expect(TRAINING_BEST_MOVE_SEATS).toEqual([3, 5, 9]);
    expect(nextTrainingBestMoveSeat([])).toBe(3);
    expect(nextTrainingBestMoveSeat([3])).toBe(5);
    expect(nextTrainingBestMoveSeat([3, 5])).toBe(9);
    expect(nextTrainingBestMoveSeat([3, 5, 9])).toBeNull();
    expect(nextTrainingBestMoveSeat([5])).toBe(3);
  });
});

describe('guided color protocol', () => {
  it('prescribes precise red, black, sheriff marks, never free input', () => {
    const empty = { red: [], black: [], sheriff: [] };
    expect(TRAINING_DEATH_PROTOCOL).toEqual({ red: [1, 2], black: [3, 5], sheriff: [8] });
    expect(nextTrainingDeathMark(empty)).toEqual({ mark: 'red', seat: 1, label: 'Красные' });
    expect(canToggleTrainingDeathMark(empty, 'black', 3)).toBe(false);
    expect(canToggleTrainingDeathMark(empty, 'red', 1)).toBe(true);
    const after1 = { ...empty, red: [1] };
    expect(nextTrainingDeathMark(after1)?.seat).toBe(2);
    const afterRed = { ...empty, red: [1, 2] };
    expect(nextTrainingDeathMark(afterRed)).toEqual({ mark: 'black', seat: 3, label: 'Чёрные' });
    const afterBlack = { ...afterRed, black: [3, 5] };
    expect(nextTrainingDeathMark(afterBlack)?.seat).toBe(8);
    expect(matchesTrainingDeathProtocol({ ...afterBlack, sheriff: [8] })).toBe(true);
    expect(matchesTrainingDeathProtocol({ ...afterBlack, sheriff: [7] })).toBe(false);
    expect(matchesTrainingDeathProtocol({ red: [1, 2, 4], black: [3, 5], sheriff: [8] })).toBe(false);
  });
});

describe('judge completion instructions', () => {
  const players = Array.from({ length: 10 }, (_, index) => ({
    slot_num: index + 1,
    team: index === 2 || index === 4 || index === 8 ? 'Чёрные' : 'Красные',
    alive: index !== 2 && index !== 4 && index !== 8,
    role: index === 2 || index === 8 ? 'Мафия' : index === 4 ? 'Дон' : 'Мирный',
  }));
  const session = (changes: Record<string, unknown>) => ({
    phase: 'day_speeches',
    activePlayers: players,
    postNightStage: 'none',
    nightSubPhase: 'intro',
    votingFarewellQueue: [],
    ...changes,
  }) as unknown as PersistedLiveSession;

  it('guides the real winner confirmation instead of blocking finish', () => {
    const instruction = getJudgeTrainingGate(session({}));
    expect(instruction?.title).toMatch(/Заверши игру/);
    expect(instruction?.allowed).toContain('[data-testid="live-winner-confirm"]');
  });

  it('does not skip pending killed-player color protocol even with a winner', () => {
    const instruction = getJudgeTrainingGate(session({
      phase: 'night', postNightStage: 'death_protocol', shotPlayerSlot: 7,
    }));
    expect(instruction?.title).toContain('Протокол убитого #7');
    expect(instruction?.allowed).toContain('.live-judge-hud__primary');
  });

  it('keeps the LH step before completing the game', () => {
    const instruction = getJudgeTrainingGate(session({
      phase: 'night', nightSubPhase: 'best_move',
    }));
    expect(instruction?.title).toBe('ЛХ первого убитого');
  });
});
