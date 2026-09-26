/**
 * Expert level of the split-vote trainer (user-approved 2026-09-26): rescue a broken zero-round split
 * at a ten-seat table.
 *
 * - 3–5 nominees in random order; the agreed split pair is two of them.
 * - Something already went wrong before the task starts:
 *   - «stray»: during the votes for nominees outside the split (before the pair), 1–3 players voted
 *     by mistake, for one or several of those nominees — those votes are spent;
 *   - «short»: the first pair nominee got 4 votes instead of 5 — one player of that group did not
 *     vote.
 * - The task starts at the next nominee. The learner distributes the remaining players so the split
 *   still happens: both pair nominees end with the same number of votes, more than anyone else.
 * - Whoever insures (throws a vote to a nominee outside the split) does not matter. Every other
 *   player votes as the basic split rules say. A player whose own nominee has already passed can
 *   only insure.
 * - A player who votes for nobody votes for the last nominee automatically (for every trainer level).
 * - Only rescuable tasks are generated. 15 seconds per task. In an exam 4 of 5 tasks have №1 in the
 *   split and every task has a break.
 */
import { splitVoteGroups } from './splitVoteTraining.ts';

export const EXPERT_SECONDS = 15;
const SEATS = Array.from({ length: 10 }, (_, index) => index + 1);

export type ExpertBreak =
  | { kind: 'stray'; votes: Array<{ nominee: number; voter: number }> }
  | { kind: 'short'; nominee: number; voters: number[] };

export type ExpertScenario = {
  candidates: number[];
  pair: [number, number];
  broken: ExpertBreak;
};

/** Votes cast before the task starts, and the index of the nominee the task starts with. */
export const expertHistory = (scenario: ExpertScenario) => {
  const votes: Record<number, number[]> = Object.fromEntries(scenario.candidates.map((candidate) => [candidate, []]));
  const { broken } = scenario;
  if (broken.kind === 'stray') {
    for (const vote of broken.votes) votes[vote.nominee].push(vote.voter);
    // The task starts after the last nominee someone voted for by mistake.
    const lastIndex = Math.max(...broken.votes.map((vote) => scenario.candidates.indexOf(vote.nominee)));
    return { votes, startIndex: lastIndex + 1 };
  }
  votes[broken.nominee] = [...broken.voters];
  return { votes, startIndex: scenario.candidates.indexOf(broken.nominee) + 1 };
};

/** Which pair nominee each seat votes for under the basic rules. */
const intendedVote = (pair: [number, number]) => {
  const groups = splitVoteGroups(pair);
  return (seat: number) => (groups.first.includes(seat) ? pair[0] : pair[1]);
};

/** Unassigned players vote for the last nominee. Returns a complete assignment for the remaining nominees. */
export const completeExpertAnswer = (scenario: ExpertScenario, answer: Record<number, number[]>) => {
  const { votes, startIndex } = expertHistory(scenario);
  const spent = new Set(Object.values(votes).flat());
  const remaining = scenario.candidates.slice(startIndex);
  const complete: Record<number, number[]> = Object.fromEntries(remaining.map((candidate) => [candidate, [...(answer[candidate] ?? [])]]));
  const used = new Set(Object.values(complete).flat());
  const last = remaining[remaining.length - 1];
  for (const seat of SEATS) if (!spent.has(seat) && !used.has(seat)) complete[last].push(seat);
  return complete;
};

export type ExpertCheck = { ok: boolean; totals: Record<number, number>; reason?: string };

/** Checks a learner's rescue (unassigned players are added to the last nominee first). */
export const checkExpertAnswer = (scenario: ExpertScenario, answer: Record<number, number[]>): ExpertCheck => {
  const { votes, startIndex } = expertHistory(scenario);
  const remaining = scenario.candidates.slice(startIndex);
  const spent = new Set(Object.values(votes).flat());
  const totals: Record<number, number> = Object.fromEntries(scenario.candidates.map((candidate) => [candidate, votes[candidate].length]));
  const extra = Object.keys(answer).map(Number).filter((candidate) => !remaining.includes(candidate) && (answer[candidate] ?? []).length);
  if (extra.length) return { ok: false, totals, reason: 'За уже прошедших кандидатов голосовать нельзя.' };
  const complete = completeExpertAnswer(scenario, answer);
  const seen = new Set<number>();
  const intended = intendedVote(scenario.pair);
  const outside = remaining.filter((candidate) => !scenario.pair.includes(candidate));
  for (const candidate of remaining) {
    for (const seat of complete[candidate]) {
      if (!Number.isInteger(seat) || seat < 1 || seat > 10) return { ok: false, totals, reason: 'Неизвестный номер.' };
      if (spent.has(seat) || seen.has(seat)) return { ok: false, totals, reason: `${seat} голосует дважды.` };
      seen.add(seat);
      totals[candidate] += 1;
      const own = intended(seat);
      // Everyone votes as the basic rules say, except those who insure by voting outside the split.
      const followsRules = candidate === own && remaining.includes(own);
      if (!followsRules && !outside.includes(candidate)) return { ok: false, totals, reason: `${seat} должен голосовать в ${own} или страховать кандидата вне попила.` };
    }
  }
  const [a, b] = scenario.pair;
  const others = scenario.candidates.filter((candidate) => !scenario.pair.includes(candidate));
  const ok = totals[a] === totals[b] && others.every((candidate) => totals[candidate] < totals[a]);
  return { ok, totals, reason: ok ? undefined : `Попил не состоялся: у ${a} — ${totals[a]}, у ${b} — ${totals[b]}.` };
};

/** One correct rescue, shown after an answer. Returns null when the split cannot be rescued. */
export const solveExpert = (scenario: ExpertScenario): Record<number, number[]> | null => {
  const { votes, startIndex } = expertHistory(scenario);
  const remaining = scenario.candidates.slice(startIndex);
  const spent = new Set(Object.values(votes).flat());
  const intended = intendedVote(scenario.pair);
  const [a, b] = scenario.pair;
  const outside = remaining.filter((candidate) => !scenario.pair.includes(candidate));
  const free = SEATS.filter((seat) => !spent.has(seat));
  const boundA = free.filter((seat) => intended(seat) === a && remaining.includes(a));
  const boundB = free.filter((seat) => intended(seat) === b && remaining.includes(b));
  const mustInsure = free.filter((seat) => !boundA.includes(seat) && !boundB.includes(seat));
  for (let insureA = 0; insureA <= boundA.length; insureA += 1) {
    for (let insureB = 0; insureB <= boundB.length; insureB += 1) {
      const totalA = votes[a].length + boundA.length - insureA;
      const totalB = votes[b].length + boundB.length - insureB;
      if (totalA !== totalB) continue;
      const insurers = [...mustInsure, ...boundA.slice(boundA.length - insureA), ...boundB.slice(boundB.length - insureB)];
      if (insurers.length && !outside.length) continue;
      const pastOthers = scenario.candidates.filter((candidate) => !scenario.pair.includes(candidate) && !remaining.includes(candidate));
      if (pastOthers.some((candidate) => votes[candidate].length >= totalA)) continue;
      // Spread the insurers so every nominee outside the split stays below the pair.
      const counts = Object.fromEntries(outside.map((candidate) => [candidate, votes[candidate].length])) as Record<number, number>;
      const plan: Record<number, number[]> = Object.fromEntries(remaining.map((candidate) => [candidate, []]));
      let fits = true;
      for (const seat of insurers) {
        const target = outside.find((candidate) => counts[candidate] + 1 < totalA);
        if (target === undefined) { fits = false; break; }
        counts[target] += 1;
        plan[target].push(seat);
      }
      if (!fits) continue;
      if (remaining.includes(a)) plan[a].push(...boundA.slice(0, boundA.length - insureA));
      if (remaining.includes(b)) plan[b].push(...boundB.slice(0, boundB.length - insureB));
      return plan;
    }
  }
  return null;
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

/** A rescuable broken split. `withSeatOne` decides whether №1 is in the pair. */
export const generateExpertScenario = (random: () => number = Math.random, withSeatOne = random() < 0.8): ExpertScenario => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const count = pick([3, 4, 5], random);
    const first = withSeatOne ? 1 : pick(SEATS.filter((seat) => seat !== 1), random);
    const second = pick(SEATS.filter((seat) => seat !== first && (withSeatOne || seat !== 1)), random);
    const pair = [first, second].sort((x, y) => x - y) as [number, number];
    const others = shuffle(SEATS.filter((seat) => !pair.includes(seat) && (withSeatOne || seat !== 1)), random).slice(0, count - 2);
    const candidates = shuffle([...pair, ...others], random);
    const firstPairIndex = Math.min(candidates.indexOf(pair[0]), candidates.indexOf(pair[1]));
    const beforePair = candidates.slice(0, firstPairIndex);
    // Wrong votes are the more varied case, so they come up more often when possible.
    const kind: 'stray' | 'short' = beforePair.length && random() < 0.65 ? 'stray' : 'short';
    let broken: ExpertBreak;
    if (kind === 'stray') {
      const voters = shuffle(SEATS, random).slice(0, pick([1, 2, 3], random));
      broken = { kind, votes: voters.map((voter) => ({ nominee: pick(beforePair, random), voter })) };
    } else {
      const nominee = candidates[firstPairIndex];
      const groups = splitVoteGroups(pair);
      const group = nominee === pair[0] ? groups.first : groups.second;
      const missing = pick(group, random);
      broken = { kind, nominee, voters: group.filter((seat) => seat !== missing) };
    }
    const scenario: ExpertScenario = { candidates, pair, broken };
    if (solveExpert(scenario)) return scenario;
  }
  throw new Error('Не удалось составить задачу');
};

/** Five exam tasks: four with №1 in the split, one without, in random order. */
export const generateExpertExam = (random: () => number = Math.random): ExpertScenario[] => {
  const withoutSeatOne = Math.floor(random() * 5);
  return Array.from({ length: 5 }, (_, index) => generateExpertScenario(random, index !== withoutSeatOne));
};

/** Server-side shape check for a submitted scenario (the client generates tasks). */
export const isValidExpertScenario = (value: unknown): value is ExpertScenario => {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as ExpertScenario;
  const { candidates, pair, broken } = scenario;
  const seat = (item: unknown) => Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 10;
  if (!Array.isArray(candidates) || candidates.length < 3 || candidates.length > 5 || !candidates.every(seat) || new Set(candidates).size !== candidates.length) return false;
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((item) => candidates.includes(item)) || pair[0] >= pair[1]) return false;
  if (!broken || typeof broken !== 'object') return false;
  const firstPairIndex = Math.min(candidates.indexOf(pair[0]), candidates.indexOf(pair[1]));
  if (broken.kind === 'stray') {
    if (!Array.isArray(broken.votes) || broken.votes.length < 1 || broken.votes.length > 3) return false;
    if (new Set(broken.votes.map((vote) => vote?.voter)).size !== broken.votes.length) return false;
    const ok = broken.votes.every((vote) => {
      const index = candidates.indexOf(vote?.nominee);
      return index >= 0 && index < firstPairIndex && seat(vote.voter);
    });
    if (!ok) return false;
  } else if (broken.kind === 'short') {
    if (broken.nominee !== candidates[firstPairIndex] || !Array.isArray(broken.voters) || broken.voters.length !== 4) return false;
    const groups = splitVoteGroups(pair);
    const group = broken.nominee === pair[0] ? groups.first : groups.second;
    if (new Set(broken.voters).size !== 4 || !broken.voters.every((item) => group.includes(item))) return false;
  } else return false;
  return solveExpert(scenario) !== null;
};
