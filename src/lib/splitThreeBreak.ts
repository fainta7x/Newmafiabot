/**
 * Two more levels of «Попил на троих» (user-approved 2026-09-28).
 *
 * «Сложный» — a broken split, 15 seconds. The split players vote first, for the first split player;
 * one of them does not raise his hand. Everyone who has not voted yet (not the breaker, not the ones
 * whose hands are already up) votes for the breaker. Tasks come with and without sheriff claims; with
 * claims the planned votes are those of the two-sheriffs level.
 * Examples: split 1, 2, 3 and 1 does not vote for himself → 2 and 3 are already up for 1, everyone else
 * votes for 1. Split 1, 2, 3 and 3 does not vote for 1 → 1 and 2 are up for 1, everyone else votes for 3.
 *
 * «Кого пилить» — given the sheriff claims and the nominees, pick the three split players by the rules
 * of the two-sheriffs level. When the third player is free, any nominee outside the claims is right.
 */
import {
  aliveSeats, generateHardScenario, generateSplitThreeScenario, hardSplitSeats, isValidHardClaims, isValidSplitThreeScenario,
  pick, shuffle, splitThreeAssignments, type SplitThreeScenario,
} from './splitThreeTraining.ts';

export const SPLIT_THREE_BREAK_SECONDS = 15;

export type SplitThreeBreakScenario = SplitThreeScenario & { breaker: number };

/** Split players who were meant to raise a hand for the first split player — only they can break it. */
export const possibleBreakers = (scenario: SplitThreeScenario) => {
  const firstVoters = splitThreeAssignments(scenario)[scenario.split[0]];
  return scenario.split.filter((seat) => firstVoters.includes(seat));
};

/** The moment of the break: who already raised a hand for the first split player and who is left. */
export const splitThreeBreakState = (scenario: SplitThreeBreakScenario) => {
  const first = scenario.split[0];
  const voted = splitThreeAssignments(scenario)[first].filter((seat) => seat !== scenario.breaker);
  const pool = aliveSeats(scenario.killed).filter((seat) => seat !== scenario.breaker && !voted.includes(seat));
  return { first, voted, pool, startIndex: scenario.candidates.indexOf(first) };
};

/** Whoever the learner leaves unassigned goes to the last nominee (the club rule). */
export const completeSplitThreeBreak = (scenario: SplitThreeBreakScenario, answer: Record<number, number[]>) => {
  const { pool, startIndex } = splitThreeBreakState(scenario);
  const remaining = scenario.candidates.slice(startIndex);
  const complete: Record<number, number[]> = Object.fromEntries(remaining.map((candidate) => [candidate, (answer[candidate] ?? []).filter((seat) => pool.includes(seat))]));
  const used = new Set(Object.values(complete).flat());
  const last = remaining[remaining.length - 1];
  for (const seat of pool) if (!used.has(seat)) complete[last].push(seat);
  return complete;
};

export const isCorrectSplitThreeBreak = (scenario: SplitThreeBreakScenario, answer: Record<number, number[]>) => {
  const { pool, startIndex } = splitThreeBreakState(scenario);
  const remaining = scenario.candidates.slice(startIndex);
  if (Object.keys(answer).some((key) => !remaining.includes(Number(key)))) return false;
  const given = Object.values(answer).flat();
  if (given.some((seat) => !pool.includes(seat)) || new Set(given).size !== given.length) return false;
  const complete = completeSplitThreeBreak(scenario, answer);
  return pool.every((seat) => complete[scenario.breaker]?.includes(seat));
};

/** Every vote after the answer: the hands already up plus the learner's distribution. */
export const splitThreeBreakVotes = (scenario: SplitThreeBreakScenario, answer: Record<number, number[]>) => {
  const { first, voted } = splitThreeBreakState(scenario);
  const complete = completeSplitThreeBreak(scenario, answer);
  return { ...complete, [first]: [...voted, ...(complete[first] ?? [])] };
};

export const generateSplitThreeBreak = (previous?: SplitThreeBreakScenario, random: () => number = Math.random): SplitThreeBreakScenario => {
  let scenario: SplitThreeBreakScenario | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const withClaims = random() < 0.5;
    const base = withClaims ? generateHardScenario(random) : generateSplitThreeScenario(random() < 0.4 ? 'three_easy' : 'three_medium', undefined, random);
    const breakers = possibleBreakers(base);
    if (!breakers.length) continue;
    scenario = { ...base, breaker: pick(breakers, random) };
    if (!previous || previous.killed !== scenario.killed || previous.breaker !== scenario.breaker) return scenario;
  }
  return scenario!;
};

export const isValidSplitThreeBreak = (value: unknown): value is SplitThreeBreakScenario => {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as SplitThreeBreakScenario;
  const base = scenario.sheriffs !== undefined ? isValidSplitThreeScenario(scenario, 'three_hard')
    : Array.isArray(scenario.candidates) && isValidSplitThreeScenario(scenario, scenario.candidates.length === 3 ? 'three_easy' : 'three_medium');
  return base && possibleBreakers(scenario).includes(scenario.breaker);
};

/** «Кого пилить»: nominees include the split players the town must take and some players it must not. */
export const generateSplitThreeChoice = (previous?: SplitThreeScenario, random: () => number = Math.random): SplitThreeScenario => {
  let scenario: SplitThreeScenario | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const base = generateHardScenario(random);
    const { trusted, doubted } = base.sheriffs!;
    const required = hardSplitSeats(base.sheriffs!);
    const claims = [trusted.seat, trusted.check, doubted.seat, doubted.check];
    const decoys = shuffle(claims.filter((seat) => !required.includes(seat)), random).slice(0, 1);
    const free = shuffle(aliveSeats(base.killed).filter((seat) => !claims.includes(seat)), random).slice(0, required.length === 3 ? 1 : pick([1, 2], random));
    const candidates = shuffle([...required, ...decoys, ...free], random);
    const splitSeats = required.length === 3 ? required : [...required, free[0]];
    const split = candidates.filter((seat) => splitSeats.includes(seat)) as [number, number, number];
    scenario = { ...base, candidates, split };
    if (!previous || previous.killed !== scenario.killed) return scenario;
  }
  return scenario!;
};

export const isCorrectSplitThreeChoice = (scenario: SplitThreeScenario, chosen: unknown) => Array.isArray(chosen) && chosen.length === 3 &&
  new Set(chosen).size === 3 && chosen.every((seat) => scenario.candidates.includes(seat)) &&
  isValidHardClaims(scenario.sheriffs, scenario.killed, chosen as number[]);

/** Which players the claims force into the split, and whether the third one is free. */
export const splitThreeChoiceRule = (scenario: SplitThreeScenario) => {
  const required = hardSplitSeats(scenario.sheriffs!);
  return { required, freeThird: required.length === 2 };
};
