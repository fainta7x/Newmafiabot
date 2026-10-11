/**
 * Practice-only exploration of a two-candidate sports Mafia vote.
 * The first candidate has already been called and some hands are up.
 * Other players can still raise for the first candidate (while it is called),
 * or wait until the last candidate, when an uncast hand goes there.
 *
 * We explore possible votes, NOT intent or a proof of hidden roles.
 * A tie initiates revoting; the judge still runs required game protocols.
 */
export type Seat = number;
export type CandidatePair = [Seat, Seat];
export type TreeScenario = {
  id: string;
  title: string;
  alive: Seat[];
  black: Seat[]; // Known to the learner only for this tactical exercise
  nominated: CandidatePair;
  firstHands: Seat[]; // Already fixed; these players cannot move their hands
  context: string;
};
export type TreeOutcome = 'black_win' | 'red_win' | 'continue' | 'revote';
export type TreeLeaf = {
  votes: Record<Seat, Seat>;
  counts: Record<Seat, number>;
  votedOut: Seat | null;
  outcome: TreeOutcome;
};

const isSeat = (seat: number) => Number.isInteger(seat) && seat >= 1 && seat <= 10;
const unique = (seats: number[]) => new Set(seats).size === seats.length;

export const validateTreeScenario = (scenario: TreeScenario): void => {
  const { alive, black, nominated, firstHands } = scenario;
  const [first, last] = nominated;
  if (alive.length < 5 || alive.length > 10 ||
    !unique(alive) || !alive.every(isSeat) ||
    !unique(black) || black.length < 1 || black.length > 3 || black.length >= alive.length / 2 ||
    alive.length - black.length > 7 ||
    black.some((seat) => !alive.includes(seat)) ||
    first === last || !alive.includes(first) || !alive.includes(last) ||
    !unique(firstHands) || firstHands.some((seat) => !alive.includes(seat))
  ) throw new Error('Некорректное состояние голосования');
};

/** The only valid decisions for hands not yet raised in the CURRENT first-candidate stage. */
export const availableVotes = (scenario: TreeScenario, voter: Seat): Seat[] => {
  validateTreeScenario(scenario);
  if (!scenario.alive.includes(voter) || scenario.firstHands.includes(voter)) return [];
  return [...scenario.nominated];
};

export const pendingVoters = (scenario: TreeScenario): Seat[] => {
  validateTreeScenario(scenario);
  return scenario.alive.filter((voter) => !scenario.firstHands.includes(voter)).sort((a, b) => a - b);
};

export const evaluateVotes = (scenario: TreeScenario, choices: Record<Seat, Seat>): TreeLeaf => {
  validateTreeScenario(scenario);
  const [first, last] = scenario.nominated;
  const pending = pendingVoters(scenario);
  if (Object.keys(choices).length !== pending.length ||
    pending.some((voter) => !availableVotes(scenario, voter).includes(choices[voter])) ||
    Object.keys(choices).some((seat) => !pending.includes(Number(seat)))
  ) throw new Error('Не все руки распределены или нарушен порядок голосования');
  const votes: Record<number, number> = Object.fromEntries([
    ...scenario.firstHands.map((voter) => [voter, first]),
    ...pending.map((voter) => [voter, choices[voter]]),
  ]);
  const counts = { [first]: 0, [last]: 0 };
  for (const vote of Object.values(votes)) counts[vote] += 1;
  if (counts[first] === counts[last]) {
    return { votes, counts, votedOut: null, outcome: 'revote' };
  }
  const votedOut = counts[first] > counts[last] ? first : last;
  const blacksRemaining = scenario.black.length - Number(scenario.black.includes(votedOut));
  const redsRemaining = scenario.alive.length - scenario.black.length - Number(!scenario.black.includes(votedOut));
  const outcome: TreeOutcome = blacksRemaining === 0 ? 'red_win'
    : blacksRemaining >= redsRemaining ? 'black_win'
      : 'continue';
  return { votes, counts, votedOut, outcome };
};

export const exploreVotes = (scenario: TreeScenario, locked: Record<number, Seat> = {}): TreeLeaf[] => {
  const voters = pendingVoters(scenario);
  if (Object.keys(locked).some((voter) => !voters.includes(Number(voter)) ||
    !availableVotes(scenario, Number(voter)).includes(locked[Number(voter)])))
    throw new Error('В решении есть недопустимая рука');
  const leaves: TreeLeaf[] = [];
  const walk = (position: number, choices: Record<Seat, Seat>) => {
    if (position === voters.length) {
      leaves.push(evaluateVotes(scenario, choices));
      return;
    }
    const voter = voters[position];
    for (const vote of locked[voter] === undefined ? availableVotes(scenario, voter) : [locked[voter]]) {
      walk(position + 1, { ...choices, [voter]: vote });
    }
  };
  walk(0, {});
  return leaves;
};

export const outcomeSummary = (leaves: TreeLeaf[]) => {
  if (leaves.length === 0) throw new Error('Дерево не должно быть пустым');
  const outcomes = [...new Set(leaves.map((leaf) => leaf.outcome))];
  return {
    alternatives: leaves.length,
    possible: outcomes,
    forced: outcomes.length === 1 ? outcomes[0] : null,
    winners: [...new Set(leaves.map((leaf) => leaf.votedOut).filter((voter): voter is number => voter !== null))],
  };
};

export const TREE_SCENARIOS: TreeScenario[] = [
  {
    id: 'five-choice', title: 'Пять игроков: есть выбор',
    alive: [1, 2, 3, 4, 5], black: [2, 5], nominated: [2, 4],
    firstHands: [1, 4],
    context: 'У №2 уже две руки. Остальные могут поддержать №2 или дождаться №4. Это упражнение с известными ролями, а не реальная проверка цветов.',
  },
  {
    id: 'five-forced', title: 'Пять игроков: исход предрешён?',
    alive: [1, 2, 3, 4, 5], black: [2, 5], nominated: [1, 4],
    firstHands: [2, 4],
    context: 'Голоса за №1 уже отданы. Остальные ещё выбирают, но один и тот же цвет может быть заголосован при любом выборе.',
  },
  {
    id: 'six-revote', title: 'Шесть игроков: возможен попил?',
    alive: [1, 2, 3, 4, 5, 6], black: [2, 6], nominated: [2, 4],
    firstHands: [1, 4],
    context: 'Ничья на текущем голосовании запускает переголосование, но не означает автоматический вывод обоих кандидатов.',
  },
  {
    id: 'seven-price', title: 'Семь игроков: цена руки',
    alive: [1, 2, 3, 4, 5, 6, 7], black: [2, 6, 7], nominated: [2, 4],
    firstHands: [1, 3, 4],
    context: 'Победа мафии может быть доступна, но не любой путь её гарантирует. Нужно сравнивать все допустимые действия оставшихся игроков.',
  },
  {
    id: 'five-red-win', title: 'Последний чёрный',
    alive: [1, 2, 3, 4, 5], black: [2], nominated: [2, 4],
    firstHands: [1, 4],
    context: 'В этом учебном эпизоде чёрный остался один. Если заголосуют №2, после протокольных действий победят красные.',
  },
];

export const treeScenarioForAttempt = (attempt: number): TreeScenario =>
  TREE_SCENARIOS[Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % TREE_SCENARIOS.length : 0];

export const outcomeName = (outcome: TreeOutcome): string => ({
  black_win: 'Победа мафии после обязательных процедур',
  red_win: 'Победа красных после обязательных процедур',
  continue: 'Партия продолжается',
  revote: 'Ничья — переголосование',
})[outcome];
