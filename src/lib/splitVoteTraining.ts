/** The approved zero-round, ten-seat split-vote patterns. */
export type SplitVoteScenario = {
  candidates: number[];
  pair: [number, number];
  seat: number;
};

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

export const generateSplitVoteScenario = (previous?: SplitVoteScenario, random: () => number = Math.random): SplitVoteScenario => {
  const count = pick(SEATS.slice(1).filter((value) => value !== previous?.candidates.length), random);
  const pair = pick(PAIRS.filter(([a, b]) => a !== previous?.pair[0] || b !== previous?.pair[1]), random);
  const seat = pick(SEATS.filter((value) => value !== previous?.seat), random);
  const others = SEATS.filter((value) => !pair.includes(value));
  // Fisher-Yates: choose additional nominees without bias or duplicates.
  for (let index = others.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [others[index], others[swap]] = [others[swap], others[index]];
  }
  return { candidates: [...pair, ...others.slice(0, count - 2)].sort((a, b) => a - b), pair, seat };
};
