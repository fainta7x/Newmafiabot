import type { DeathProtocolSelection } from './liveDeathProtocol.ts';

/** These are training guesses, NOT claims of the dead player's actual knowledge. */
export const TRAINING_BEST_MOVE_SEATS = [3, 5, 9] as const;
export const TRAINING_DEATH_PROTOCOL: Readonly<DeathProtocolSelection> = {
  red: [1, 2],
  black: [3, 5],
  sheriff: [8],
};
export type TrainingColorMark = keyof DeathProtocolSelection;

export const nextTrainingBestMoveSeat = (selected: readonly number[]): number | null =>
  TRAINING_BEST_MOVE_SEATS.find((seat, index) =>
    selected[index] !== seat) ?? null;

const deathOrder: readonly { mark: TrainingColorMark; seat: number; label: string }[] = [
  { mark: 'red', seat: 1, label: 'Красные' },
  { mark: 'red', seat: 2, label: 'Красные' },
  { mark: 'black', seat: 3, label: 'Чёрные' },
  { mark: 'black', seat: 5, label: 'Чёрные' },
  { mark: 'sheriff', seat: 8, label: 'Шериф' },
];

export const nextTrainingDeathMark = (value: DeathProtocolSelection) =>
  deathOrder.find((step) => !value[step.mark].includes(step.seat)) ?? null;

export const matchesTrainingDeathProtocol = (value: DeathProtocolSelection): boolean =>
  (Object.keys(TRAINING_DEATH_PROTOCOL) as TrainingColorMark[]).every((mark) => {
    const expected = TRAINING_DEATH_PROTOCOL[mark];
    return expected.length === value[mark].length && expected.every((seat) => value[mark].includes(seat));
  });

export const canToggleTrainingDeathMark = (
  value: DeathProtocolSelection,
  mark: TrainingColorMark,
  seat: number,
): boolean => {
  const next = nextTrainingDeathMark(value);
  // A previously selected seat can be cleared to correct a mistake.
  return value[mark].includes(seat) || (next?.mark === mark && next.seat === seat);
};
