import type { DeathProtocolSelection } from './liveDeathProtocol.ts';

/** These are training guesses, NOT claims of the dead player's actual knowledge. */
export const TRAINING_BEST_MOVE_SEATS = [3, 5, 9] as const;
export type TrainingColorMark = keyof DeathProtocolSelection;

export type TrainingDeathMarkStep = {
  mark: TrainingColorMark;
  seat: number;
  label: string;
};

/**
 * Vary the simulated dead player's *words*, not any actual roles/scores.
 * Pure and repeatable: a recovered night has the same lesson after refresh.
 * One to four color claims; optionally a separate Sheriff claim.
 */
export const getTrainingDeathProtocolPlan = (night: number, killedSlot: number): DeathProtocolSelection => {
  const round = Number.isInteger(night) && night > 0 ? night : 1;
  const killed = Number.isInteger(killedSlot) && killedSlot >= 1 && killedSlot <= 10 ? killedSlot : 0;
  let state = (Math.imul(round, 0x9e3779b1) ^ Math.imul(killed, 0x85ebca6b) ^ 0x243f6a88) >>> 0;
  // Mulberry32: seeded pseudo-random choices, no Math.random during render.
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const available = Array.from({ length: 10 }, (_, i) => i + 1).filter((seat) => seat !== killed);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  const numberOfColors = 1 + Math.floor(random() * 4);
  const red: number[] = [];
  const black: number[] = [];
  for (const seat of available.slice(0, numberOfColors)) {
    (random() < 0.5 ? red : black).push(seat);
  }
  // Sheriff is an optional, independent guess and may also have a color mark.
  const sheriff = random() < 0.5 ? [available[Math.floor(random() * available.length)]] : [];
  return {
    red: red.sort((a, b) => a - b),
    black: black.sort((a, b) => a - b),
    sheriff,
  };
};

export const getTrainingDeathMarkSteps = (plan: DeathProtocolSelection): TrainingDeathMarkStep[] => [
  ...plan.red.map((seat) => ({ mark: 'red' as const, seat, label: 'Красные' })),
  ...plan.black.map((seat) => ({ mark: 'black' as const, seat, label: 'Чёрные' })),
  ...plan.sheriff.map((seat) => ({ mark: 'sheriff' as const, seat, label: 'Шериф' })),
];

export const nextTrainingBestMoveSeat = (selected: readonly number[]): number | null =>
  TRAINING_BEST_MOVE_SEATS.find((seat, index) =>
    selected[index] !== seat) ?? null;

export const nextTrainingDeathMark = (value: DeathProtocolSelection, plan: DeathProtocolSelection) =>
  getTrainingDeathMarkSteps(plan).find((step) => !value[step.mark].includes(step.seat)) ?? null;

export const matchesTrainingDeathProtocol = (value: DeathProtocolSelection, plan: DeathProtocolSelection): boolean =>
  (Object.keys(plan) as TrainingColorMark[]).every((mark) => {
    const expected = plan[mark];
    return expected.length === value[mark].length && expected.every((seat) => value[mark].includes(seat));
  });

export const canToggleTrainingDeathMark = (
  value: DeathProtocolSelection,
  plan: DeathProtocolSelection,
  mark: TrainingColorMark,
  seat: number,
): boolean => {
  const next = nextTrainingDeathMark(value, plan);
  // A previously selected seat can be cleared to correct a mistake.
  return value[mark].includes(seat) || (next?.mark === mark && next.seat === seat);
};
