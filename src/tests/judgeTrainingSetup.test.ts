import { describe, expect, it } from 'vitest';
import {
  TRAINING_PEOPLE, JUDGE_TRAINING_ROLES,
  createJudgeTrainingSeatingPlan, trainingSeatingComplete,
  trainingSeatPlacementAllowed, trainingRolePlacementAllowed,
} from '../lib/judgeTrainingSetup.ts';

describe('guided judge practice setup', () => {
  it('creates an independent seat order with all ten unique virtual participants', () => {
    const plan = createJudgeTrainingSeatingPlan(() => 0);
    expect(plan).toHaveLength(10);
    expect(new Set(plan).size).toBe(10);
    expect([...plan].sort()).toEqual([...TRAINING_PEOPLE].sort());
    expect(plan).not.toEqual(TRAINING_PEOPLE);
  });

  it('only accepts the instructed participant for each successive seat', () => {
    const plan = ['Игрок 5', 'Игрок 2', ...TRAINING_PEOPLE.filter((name) => name !== 'Игрок 5' && name !== 'Игрок 2')];
    expect(trainingSeatPlacementAllowed(plan, [], 'Игрок 2')).toBe(false);
    expect(trainingSeatPlacementAllowed(plan, [], 'Игрок 5')).toBe(true);
    expect(trainingSeatPlacementAllowed(plan, ['Игрок 5'], 'Игрок 5')).toBe(false);
    expect(trainingSeatPlacementAllowed(plan, ['Игрок 5'], 'Игрок 2')).toBe(true);
    expect(trainingSeatingComplete(plan, plan.slice(0, 9))).toBe(false);
    expect(trainingSeatingComplete(plan, plan)).toBe(true);
    expect(trainingSeatingComplete(plan, [...plan.slice(0, 9), 'Игрок 4'])).toBe(false);
  });

  it('uses the classic 10-seat deck and rejects wrong role cards', () => {
    const counts = Object.values(JUDGE_TRAINING_ROLES).reduce((acc, role) => ({ ...acc, [role]: (acc[role] || 0) + 1 }), {} as Record<string, number>);
    expect(counts).toEqual({ sheriff: 1, citizen: 6, mafia: 2, don: 1 });
    expect(trainingRolePlacementAllowed(JUDGE_TRAINING_ROLES, 3, 'mafia')).toBe(true);
    expect(trainingRolePlacementAllowed(JUDGE_TRAINING_ROLES, 3, 'citizen')).toBe(false);
    expect(trainingRolePlacementAllowed(JUDGE_TRAINING_ROLES, 5, 'don')).toBe(true);
    expect(trainingRolePlacementAllowed(JUDGE_TRAINING_ROLES, 7, 'citizen')).toBe(true);
  });
});
