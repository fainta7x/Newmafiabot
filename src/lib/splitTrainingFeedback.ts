/** Explanation-only feedback for split trainers. Correctness stays in canonical vote engines. */
import { splitVoteGroups, type SplitVoteScenario } from './splitVoteTraining.ts';

export const explainPairRule = ([first, second]: [number, number]): string => {
  if (first === 1 && second <= 5) return 'Когда 1 пилится с 2–5, за 1 голосуют места 2–6. Остальные — за второго.';
  if (first === 1) return 'Когда 1 пилится с 6–10, за 1 голосуют места 6–10. Места 1–5 — за второго.';
  if (first <= 5 && second >= 6) return 'Кандидаты из разных половин: места 6–10 голосуют в меньший номер, 1–5 — в больший.';
  return 'Кандидаты из одной половины: пять следующих мест после меньшего номера голосуют в него (после 10 снова идёт 1). Остальные — во второго.';
};

export const explainPersonalPairVote = (scenario: SplitVoteScenario): string => {
  const groups = splitVoteGroups(scenario.pair);
  const inFirst = groups.first.includes(scenario.seat);
  const voters = inFirst ? groups.first : groups.second;
  return explainPairRule(scenario.pair) + ' Место ' + scenario.seat + ' в группе ' + voters.join(', ') + ', поэтому голос в ' + (inFirst ? scenario.pair[0] : scenario.pair[1]) + '.';
};

/** Point out specific misplaced hands; show no more than three to avoid another wall of text. */
export const assignmentMistakes = (expected: Record<number, number[]>, actual: Record<number, number[]>, voters: number[], limit = 3): string[] => {
  const targets = (votes: Record<number, number[]>) => {
    const map = new Map<number, number>();
    for (const [candidate, seats] of Object.entries(votes)) for (const seat of seats) map.set(seat, Number(candidate));
    return map;
  };
  const right = targets(expected);
  const chosen = targets(actual);
  return voters.filter((seat) => right.get(seat) !== chosen.get(seat)).slice(0, limit).map((seat) =>
    'Игрок ' + seat + ': ' + (chosen.has(seat) ? 'поставил руку в ' + chosen.get(seat) : 'не проголосовал') +
      ', а нужно в ' + (right.get(seat) ?? 'никого') + '.');
};
