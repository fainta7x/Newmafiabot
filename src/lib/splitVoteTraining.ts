/** The approved zero-round, ten-seat split-vote patterns. */
export type SplitVoteScenario = {
  candidates: number[];
  pair: [number, number];
  seat: number;
};
export type SplitVoteDifficulty = 'basic' | 'advanced' | 'interactive' | 'all';

const SEATS = Array.from({ length: 10 }, (_, index) => index + 1);
export const SPLIT_VOTE_RULES = [
  '№1 с №2–5: №2–6 голосуют в №1, остальные — во второго игрока.',
  '№1 с №6–10: №6–10 голосуют в №1, №1–5 — во второго игрока.',
  'Игрок из №2–5 с игроком из №6–10: №6–10 голосуют в кандидата из первой половины, №1–5 — в кандидата из второй.',
  'Двое из одной половины (№2–5 или №6–10): пять мест после меньшего номера голосуют в него; остальные — во второго игрока.',
] as const;
const PAIRS: Array<[number, number]> = SEATS.flatMap((first) =>
  SEATS.filter((second) => second > first)
    .map((second): [number, number] => [first, second]));

const pick = <T>(items: T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export const splitVoteGroups = ([first, second]: [number, number]): { first: number[]; second: number[] } => {
  if (!PAIRS.some(([a, b]) => a === first && b === second)) throw new Error('Схема попила ещё не согласована');
  const firstVoters = first === 1
    ? (second <= 5 ? [2, 3, 4, 5, 6] : [6, 7, 8, 9, 10])
    : first <= 5 && second >= 6
      ? [6, 7, 8, 9, 10]
      : SEATS.filter((seat) => {
        const distance = (seat - first + 10) % 10;
        return distance >= 1 && distance <= 5;
      });
  return { first: firstVoters, second: SEATS.filter((seat) => !firstVoters.includes(seat)) };
};

export const correctSplitVote = (scenario: SplitVoteScenario): number => {
  const groups = splitVoteGroups(scenario.pair);
  return groups.first.includes(scenario.seat) ? scenario.pair[0] : scenario.pair[1];
};

export const splitVoteAssignments = (scenario: SplitVoteScenario): Record<number, number[]> => {
  const groups = splitVoteGroups(scenario.pair);
  return Object.fromEntries(scenario.candidates.map((candidate) => [candidate,
    candidate === scenario.pair[0] ? groups.first : candidate === scenario.pair[1] ? groups.second : [],
  ]));
};

export const isCorrectSplitVoteAssignment = (scenario: SplitVoteScenario, selected: Record<number, number[]>): boolean => {
  const expected = splitVoteAssignments(scenario);
  return scenario.candidates.every((candidate) => {
    const actual = selected[candidate] ?? [];
    return actual.length === expected[candidate].length &&
      actual.every((seat) => expected[candidate].includes(seat));
  });
};

export const generateSplitVoteScenario = (previous?: SplitVoteScenario, random: () => number = Math.random, difficulty: SplitVoteDifficulty = 'all'): SplitVoteScenario => {
  const counts = difficulty === 'basic' ? [2, 3, 4] : SEATS.slice(1);
  const count = pick(counts.filter((value) => value !== previous?.candidates.length), random);
  const pairs = PAIRS.filter(([first]) => difficulty === 'all' || difficulty === 'interactive' || (difficulty === 'basic' ? first === 1 : first !== 1));
  const pair = pick(pairs.filter(([a, b]) => a !== previous?.pair[0] || b !== previous?.pair[1]), random);
  const seat = pick(SEATS.filter((value) => value !== previous?.seat), random);
  const others = SEATS.filter((value) => !pair.includes(value));
  // Fisher-Yates: choose additional nominees without bias or duplicates.
  for (let index = others.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [others[index], others[swap]] = [others[swap], others[index]];
  }
  const candidates = [...pair, ...others.slice(0, count - 2)].sort((a, b) => a - b);
  if (difficulty === 'advanced' || difficulty === 'interactive') {
    // Nomination order is independent of seat numbers and the chosen split pair.
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = Math.min(index, Math.floor(random() * (index + 1)));
      [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
    }
  }
  return { candidates, pair, seat };
};
