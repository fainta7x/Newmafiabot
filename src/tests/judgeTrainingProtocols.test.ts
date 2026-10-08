import { describe, expect, it } from 'vitest';
import {
  nextTrainingBestMoveSeat,
  TRAINING_BEST_MOVE_SEATS,
  getTrainingDeathProtocolPlan,
  getTrainingDeathMarkSteps,
  nextTrainingDeathMark,
  matchesTrainingDeathProtocol,
  canToggleTrainingDeathMark,
} from '../lib/judgeTrainingProtocols.ts';
import { getJudgeTrainingGate } from '../lib/judgeConductTraining.ts';
import type { DeathProtocolSelection } from '../lib/liveDeathProtocol.ts';
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
  it('varies from one to four guessed colors plus an optional Sheriff, without repeating one static protocol', () => {
    const cases = Array.from({ length: 6 }, (_, index) => index + 1)
      .flatMap((round) => [2, 5, 7, 9].map((killed) => ({ round, killed, plan: getTrainingDeathProtocolPlan(round, killed) })));
    const distinct = new Set<string>();
    const counts = new Set<number>();
    const sheriffOptions = new Set<boolean>();
    for (const { round, killed, plan } of cases) {
      expect(getTrainingDeathProtocolPlan(round, killed)).toEqual(plan); // refresh/restore safe
      const colored = [...plan.red, ...plan.black];
      expect(colored.length).toBeGreaterThanOrEqual(1);
      expect(colored.length).toBeLessThanOrEqual(4);
      expect(new Set(colored).size).toBe(colored.length);
      expect(colored).not.toContain(killed);
      expect(plan.sheriff.length).toBeLessThanOrEqual(1);
      expect(plan.sheriff).not.toContain(killed);
      distinct.add(JSON.stringify(plan));
      counts.add(colored.length);
      sheriffOptions.add(plan.sheriff.length > 0);
    }
    expect(distinct.size).toBeGreaterThanOrEqual(10);
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(sheriffOptions).toEqual(new Set([true, false]));
  });

  it('follows the selected death-night script exactly and unlocks save after its final mark', () => {
    const plan = getTrainingDeathProtocolPlan(2, 7);
    const empty: DeathProtocolSelection = { red: [], black: [], sheriff: [] };
    const steps = getTrainingDeathMarkSteps(plan);
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(steps.length).toBeLessThanOrEqual(5);
    expect(nextTrainingDeathMark(empty, plan)).toEqual(steps[0]);
    const blockedSeat = Array.from({ length: 10 }, (_, index) => index + 1)
      .find((seat) => !plan.red.includes(seat) && !plan.black.includes(seat) && !plan.sheriff.includes(seat));
    expect(canToggleTrainingDeathMark(empty, plan, 'black', blockedSeat!)).toBe(false);
    let selected: DeathProtocolSelection = { ...empty };
    for (const step of steps) {
      expect(nextTrainingDeathMark(selected, plan)).toEqual(step);
      expect(canToggleTrainingDeathMark(selected, plan, step.mark, step.seat)).toBe(true);
      selected = { ...selected, [step.mark]: [...selected[step.mark], step.seat] };
    }
    expect(matchesTrainingDeathProtocol(selected, plan)).toBe(true);
    expect(nextTrainingDeathMark(selected, plan)).toBeNull();
    expect(matchesTrainingDeathProtocol({ ...selected, red: [...selected.red, 10] }, plan)).toBe(false);
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
