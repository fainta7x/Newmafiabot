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
 * distribute the whole table; hard — two sheriffs (see below). Expert comes later.
 *
 * Hard level (user-approved 2026-09-26). Two players claim the sheriff; the town trusts one of them
 * less. Nobody knows which sheriff is real, so there are two versions: if a sheriff is real, the
 * other sheriff and everyone he checked black are mafia. Who is split:
 * - only the less trusted sheriff has a black check: that sheriff, his black check and one more player;
 * - both sheriffs have a black check: both black checks and the less trusted sheriff;
 * - only the trusted sheriff has a black check: the less trusted sheriff, the trusted sheriff's black
 *   check and one more player (by the trusted version two black players leave).
 * - Who votes where: everyone who is black by one version votes for a split player who is black by
 *   the other version. As mafia they then vote against a red player and have no spare hand to break
 *   the split. Order: first such hands with one possible split player; then the other split players as
 *   usual (the first split player with a free vote, even themselves); then such hands with a choice
 *   (where a vote is still free, in nomination order); then everyone else in seat order.
 *   Example: sheriff 9 checked 1 black, 2 claims against him, split 1, 2, 3 → 123 for 1, and 9 votes
 *   for 2 so he cannot add a fourth hand to 2.
 * Example: 10 killed, sheriffs 1 and 4, the town trusts 4 less, 4 checked 2 black, 1 checked 6 red;
 * nominated 4, 2, 7 → 127 vote for 4, 345 for 2, 689 for 7.
 */
export type SplitThreeLevel = 'three_easy' | 'three_medium' | 'three_hard';

/** Hard level: the two sheriff claims. */
export type SplitThreeSheriffs = {
  /** The sheriff the town trusts more, and his check (black or red). */
  trusted: { seat: number; check: number; black: boolean };
  /** The sheriff the town trusts less, and his check (black or red). At least one check is black. */
  doubted: { seat: number; check: number; black: boolean };
};

export type SplitThreeScenario = {
  killed: number;
  /** Nomination order. */
  candidates: number[];
  /** The three split players, in nomination order. */
  split: [number, number, number];
  /** The learner's seat (easy level). */
  seat: number;
  /** Hard level only. */
  sheriffs?: SplitThreeSheriffs;
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

export const SPLIT_THREE_HARD_RULES = [
  'За столом два шерифа. Кто из них настоящий, неизвестно — значит, есть две версии.',
  'Если прав один шериф, то второй шериф и все, кого тот проверил в чёрного, — мафия.',
  'Кто пилится. Чёрная проверка только у шерифа, которому город верит меньше, — пилятся он, его чёрная проверка и ещё один игрок.',
  'Чёрные проверки у обоих шерифов — пилятся обе чёрные проверки и шериф, которому город верит меньше.',
  'Чёрная проверка только у шерифа, которому город верит больше, — пилятся второй шериф, эта чёрная проверка и ещё один игрок.',
  'Руки, которые могут сломать попил: кто чёрный по одной версии, голосует в пилящегося, который чёрный по другой версии. Если они мафия, они голосуют против красного, и лишней руки у них нет. Если таких пилящихся нет, они голосуют как обычно.',
  'Порядок: сначала такие руки, у которых один вариант; потом остальные пилящиеся как обычно — в первого пилящегося, где есть место (даже в себя); потом такие руки, у которых есть выбор, — туда, где осталось место; остальные добивают кандидатов по порядку мест.',
] as const;

/** Hard level: who is mafia if this sheriff is the real one. */
export const blackIfReal = (sheriffs: SplitThreeSheriffs, sheriff: 'trusted' | 'doubted'): number[] => (sheriff === 'trusted'
  ? [sheriffs.doubted.seat, ...(sheriffs.trusted.black ? [sheriffs.trusted.check] : [])]
  : [sheriffs.trusted.seat, ...(sheriffs.doubted.black ? [sheriffs.doubted.check] : [])]).sort((a, b) => a - b);

/** Hard level: for each version, its black players and the split players they must vote for. */
export const splitThreeVersions = (scenario: SplitThreeScenario) => {
  const sheriffs = scenario.sheriffs!;
  return (['trusted', 'doubted'] as const).map((sheriff) => {
    const other = sheriff === 'trusted' ? 'doubted' : 'trusted';
    const targets = blackIfReal(sheriffs, other);
    return {
      sheriff: sheriffs[sheriff].seat,
      blacks: blackIfReal(sheriffs, sheriff).filter((seat) => seat !== scenario.killed),
      into: scenario.split.filter((seat) => targets.includes(seat)),
    };
  });
};

const hardAssignments = (scenario: SplitThreeScenario): Record<number, number[]> => {
  const groups: Record<number, number[]> = Object.fromEntries(scenario.split.map((seat) => [seat, []]));
  const used = new Set<number>();
  const place = (voter: number, options: number[]) => {
    const target = options.find((seat) => groups[seat].length < 3);
    if (target === undefined) return;
    groups[target].push(voter);
    used.add(voter);
  };
  const constrained = splitThreeVersions(scenario).flatMap(({ blacks, into }) => blacks.map((voter) => ({ voter, into })))
    .filter(({ into }) => into.length > 0)
    .sort((a, b) => a.voter - b.voter);
  const choosing = new Set(constrained.filter(({ into }) => into.length > 1).map(({ voter }) => voter));
  // 1. The hands that could break the split and have only one place to go.
  for (const { voter, into } of constrained) if (into.length === 1 && !used.has(voter)) place(voter, into);
  // 2. The other split players, as usual: into the first split player with a free vote, even themselves.
  for (const voter of [...scenario.split].sort((a, b) => a - b)) if (!used.has(voter) && !choosing.has(voter)) place(voter, scenario.split);
  // 3. The breaking hands with a choice go where a vote is still free (sheriff 9 → 2 in the user's example).
  for (const { voter, into } of constrained) if (into.length > 1 && !used.has(voter)) place(voter, into);
  // 4. Everyone else in seat order.
  for (const voter of aliveSeats(scenario.killed)) if (!used.has(voter)) place(voter, scenario.split);
  for (const seat of scenario.split) groups[seat].sort((a, b) => a - b);
  return groups;
};

/** Every nominee with the seats that vote for them (nominees outside the split get nobody). */
export const splitThreeAssignments = (scenario: SplitThreeScenario): Record<number, number[]> => {
  const groups = scenario.sheriffs ? hardAssignments(scenario) : splitThreeGroups(scenario);
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

/** Hard level: the split the town makes from the sheriff claims (the third player only when it is free). */
const hardSplitSeats = ({ trusted, doubted }: SplitThreeSheriffs) => (trusted.black && doubted.black
  ? [trusted.check, doubted.check, doubted.seat]
  : [doubted.seat, trusted.black ? trusted.check : doubted.check]);

const generateHardScenario = (random: () => number): SplitThreeScenario => {
  const killed = pick(SEATS, random);
  const [trusted, doubted, doubtedCheck, trustedCheck, ...others] = shuffle(aliveSeats(killed), random);
  // Only the doubted sheriff, both, or only the trusted sheriff have a black check.
  const kind = pick(['doubted', 'both', 'trusted'] as const, random);
  const sheriffs: SplitThreeSheriffs = {
    trusted: { seat: trusted, check: trustedCheck, black: kind !== 'doubted' },
    doubted: { seat: doubted, check: doubtedCheck, black: kind !== 'trusted' },
  };
  const splitSeats = hardSplitSeats(sheriffs);
  // Without a second black check the third split player is anyone outside the claims.
  if (splitSeats.length === 2) splitSeats.push(others[0]);
  const extras = others.filter((seat) => !splitSeats.includes(seat)).slice(0, pick([0, 1, 2], random));
  const candidates = shuffle([...splitSeats, ...extras], random);
  const split = candidates.filter((seat) => splitSeats.includes(seat)) as [number, number, number];
  return { killed, candidates, split, seat: pick(aliveSeats(killed), random), sheriffs };
};

export const generateSplitThreeScenario = (
  level: SplitThreeLevel = 'three_easy',
  previous?: SplitThreeScenario,
  random: () => number = Math.random,
): SplitThreeScenario => {
  let scenario: SplitThreeScenario | null = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (level === 'three_hard') {
      scenario = generateHardScenario(random);
      if (!previous || previous.killed !== scenario.killed || previous.sheriffs?.doubted.seat !== scenario.sheriffs?.doubted.seat) return scenario;
      continue;
    }
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

const isValidHardClaims = (value: unknown, killed: number, split: number[]) => {
  if (!value || typeof value !== 'object') return false;
  const { trusted, doubted } = value as SplitThreeSheriffs;
  if (!trusted || !doubted || typeof trusted.black !== 'boolean' || typeof doubted.black !== 'boolean' || (!trusted.black && !doubted.black)) return false;
  const seats = [trusted.seat, trusted.check, doubted.seat, doubted.check];
  if (!seats.every((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10 && seat !== killed) || new Set(seats).size !== 4) return false;
  const required = hardSplitSeats({ trusted, doubted });
  if (!required.every((seat) => split.includes(seat))) return false;
  // The third split player (one black check only) is outside the claims.
  return required.length === 3 || !split.some((seat) => [trusted.seat, trusted.check, doubted.check, doubted.seat].includes(seat) && !required.includes(seat));
};

/** Server-side check of a submitted task. */
export const isValidSplitThreeScenario = (value: unknown, level: SplitThreeLevel): value is SplitThreeScenario => {
  if (!value || typeof value !== 'object') return false;
  const { killed, candidates, split, seat } = value as SplitThreeScenario;
  const isSeat = (item: unknown) => Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 10;
  if (!isSeat(killed) || !isSeat(seat) || seat === killed) return false;
  if (!Array.isArray(candidates) || !candidates.every(isSeat) || candidates.includes(killed) || new Set(candidates).size !== candidates.length) return false;
  if (level === 'three_easy' ? candidates.length !== 3 : level === 'three_medium' ? candidates.length < 4 || candidates.length > 6 : candidates.length < 3 || candidates.length > 5) return false;
  if (!Array.isArray(split) || split.length !== 3 || new Set(split).size !== 3 || !split.every((item) => candidates.includes(item))) return false;
  if (level === 'three_hard' && !isValidHardClaims((value as SplitThreeScenario).sheriffs, killed, split)) return false;
  if (level !== 'three_hard' && (value as SplitThreeScenario).sheriffs !== undefined) return false;
  // The split players keep their nomination order.
  return split.every((item, index) => index === 0 || candidates.indexOf(split[index - 1]) < candidates.indexOf(item));
};
