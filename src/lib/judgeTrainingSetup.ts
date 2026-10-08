import type { PhysicalRole } from '../components/game/PhysicalRoleDeal.tsx';

export const TRAINING_PEOPLE = Array.from({ length: 10 }, (_, index) => 'Игрок ' + (index + 1));

/** Seat numbers are deliberately independent from the names of the virtual participants. */
export const createJudgeTrainingSeatingPlan = (random = Math.random): string[] => {
  const plan = [...TRAINING_PEOPLE];
  for (let i = plan.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.max(0, Math.min(random(), 0.999999)) * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
};

export const trainingSeatPlacementAllowed = (plan: string[], lineup: string[], player: string) =>
  lineup.length < plan.length && !lineup.includes(player) && plan[lineup.length] === player;

export const trainingSeatingComplete = (plan: string[], lineup: string[]) =>
  plan.length === 10 && lineup.length === 10 && plan.every((name, index) => lineup[index] === name);

/** Real Live Game role deck counts: 6 citizens, 1 sheriff, 2 mafia, 1 don. */
export const JUDGE_TRAINING_ROLES: Record<number, PhysicalRole> = {
  1: 'citizen',
  2: 'citizen',
  3: 'mafia',
  4: 'citizen',
  5: 'don',
  6: 'citizen',
  7: 'citizen',
  8: 'sheriff',
  9: 'mafia',
  10: 'citizen',
};

export const JUDGE_TRAINING_ROLE_LABELS: Record<PhysicalRole, string> = {
  citizen: 'Мирный',
  sheriff: 'Шериф',
  mafia: 'Мафия',
  don: 'Дон',
};

export const trainingRolePlacementAllowed = (targets: Record<number, PhysicalRole>, seat: number, role: PhysicalRole) =>
  targets[seat] === role;
