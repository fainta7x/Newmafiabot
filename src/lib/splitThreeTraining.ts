/**
 * Three-way split with nine at the table (user-approved 2026-09-26).
 *
 * One player is killed, nine remain, and the town splits the vote 3 : 3 : 3 between three nominees.
 * - The three split players vote first: all three vote for the first of them in nomination order.
 * - Everyone else still at the table votes in seat order: the first three for the second split
 *   player, the next three for the third. Other nominees get no votes.
 * Examples: 10 killed, nominated 5, 2, 8 → 258 vote for 5, 134 for 2, 679 for 8.
 * 10 killed, nominated 7, 2, 5, 9, 4, split 2, 9, 4 → 249 for 2, 135 for 9, 678 for 4.
 *
 * Levels: easy — three nominees, pick your own vote; medium — 4–6 nominees, three of them split,
 * distribute the whole table. Hard and expert come later.
 */
export type SplitThreeLevel = 'three_easy' | 'three_medium';

export type SplitThreeScenario = {
  killed: number;
  /** Nomination order. */
  candidates: number[];
  /** The three split players, in nomination order. */
  split: [number, number, number];
  /** The learner's seat (easy level). */
  seat: number;
};

const SEATS = Array.from({ length: 10 }, (_, index) => index + 1);

export const SPLIT_THREE_RULES = [
  'Убит один игрок, за столом 9 человек. Попил на троих: каждый из трёх пилящихся получает по 3 голоса.',
  'Первыми голосуют сами пилящиеся: все трое — в первого из них по порядку выставления.',
  'Остальные голосуют по порядку мест: первые трое — во второго пилящегося, следующие трое — в третьего.',
  'В остальных выставленных не голосуют.',
] as const;

export const splitThreeGroups = (scenario: Pick<SplitThreeScenario, 'killed' | 'split'>): Record<number, number[]> => {
  const [first, second, third] = scenario.split;
  const others = SEATS.filter((seat) => seat !== scenario.killed && !scenario.split.includes(seat));
  return {
    [first]: [...scenario.split].sort((a, b) => a - b),
    [second]: others.slice(0, 3),
    [third]: others.slice(3, 6),
  };
};

/** Every nominee with the seats that vote for them (nominees outside the split get nobody). */
export const splitThreeAssignments = (scenario: SplitThreeScenario): Record<number, number[]> => {
  const groups = splitThreeGroups(scenario);
  return Object.fromEntries(scenario.candidates.map((candidate) => [candidate, groups[candidate] ?? []]));
};

export const correctSplitThreeVote = (scenario: SplitThreeScenario): number => {
  const groups = splitThreeGroups(scenario);
  return scenario.split.find((candidate) => groups[candidate].includes(scenario.seat))!;
};

/** Seats still at the table. */
export const aliveSeats = (killed: number) => SEATS.filter((seat) => seat !== killed);

/** Players who vote for nobody go to the last nominee. */
export const completeSplitThreeAnswer = (scenario: SplitThreeScenario, answer: Record<number, number[]>) => {
  const complete: Record<number, number[]> = Object.fromEntries(scenario.candidates.map((candidate) => [candidate, [...(answer[candidate] ?? [])]]));
  const used = new Set(Object.values(complete).flat());
  const last = scenario.candidates[scenario.candidates.length - 1];
  for (const seat of aliveSeats(scenario.killed)) if (!used.has(seat)) complete[last].push(seat);
  return complete;
};

export const isCorrectSplitThreeAssignment = (scenario: SplitThreeScenario, answer: Record<number, number[]>) => {
  if (Object.keys(answer).some((key) => !scenario.candidates.includes(Number(key)))) return false;
  const complete = completeSplitThreeAnswer(scenario, answer);
  const expected = splitThreeAssignments(scenario);
  const all = Object.values(complete).flat();
  if (new Set(all).size !== all.length || all.includes(scenario.killed)) return false;
  return scenario.candidates.every((candidate) => {
    const got = complete[candidate];
    return got.length === expected[candidate].length && got.every((seat) => expected[candidate].includes(seat));
  });
};

const pick = <T>(items: T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const shuffle = <T>(items: T[], random: () => number) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

export const generateSplitThreeScenario = (
  level: SplitThreeLevel = 'three_easy',
  previous?: SplitThreeScenario,
  random: () => number = Math.random,
): SplitThreeScenario => {
  let scenario: SplitThreeScenario | null = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const killed = pick(SEATS, random);
    const alive = aliveSeats(killed);
    const count = level === 'three_easy' ? 3 : pick([4, 5, 6], random);
    const candidates = shuffle(alive, random).slice(0, count);
    const chosen = new Set(shuffle(candidates, random).slice(0, 3));
    const split = candidates.filter((candidate) => chosen.has(candidate)) as [number, number, number];
    scenario = { killed, candidates, split, seat: pick(alive, random) };
    // Consecutive tasks differ in the killed player and the learner's seat.
    if (!previous || (previous.killed !== killed && previous.seat !== scenario.seat)) return scenario;
  }
  return scenario!;
};

/** Server-side check of a submitted task. */
export const isValidSplitThreeScenario = (value: unknown, level: SplitThreeLevel): value is SplitThreeScenario => {
  if (!value || typeof value !== 'object') return false;
  const { killed, candidates, split, seat } = value as SplitThreeScenario;
  const isSeat = (item: unknown) => Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 10;
  if (!isSeat(killed) || !isSeat(seat) || seat === killed) return false;
  if (!Array.isArray(candidates) || !candidates.every(isSeat) || candidates.includes(killed) || new Set(candidates).size !== candidates.length) return false;
  if (level === 'three_easy' ? candidates.length !== 3 : candidates.length < 4 || candidates.length > 6) return false;
  if (!Array.isArray(split) || split.length !== 3 || new Set(split).size !== 3 || !split.every((item) => candidates.includes(item))) return false;
  // The split players keep their nomination order.
  return split.every((item, index) => index === 0 || candidates.indexOf(split[index - 1]) < candidates.indexOf(item));
};
