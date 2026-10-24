import type { VotingRound } from './tournamentVoting';

const copy = (round: VotingRound): VotingRound => ({
  ...round,
  nominated_seats: [...(round.nominated_seats || [])],
  vote_counts: { ...(round.vote_counts || {}) },
  parent_nominated_seats: round.parent_nominated_seats ? [...round.parent_nominated_seats] : undefined,
  parent_vote_counts: round.parent_vote_counts ? { ...round.parent_vote_counts } : undefined,
  eliminated_seats: [...(round.eliminated_seats || [])],
});

const keyOf = (round: VotingRound) => `${Number(round.day_number ?? 0)}:${Number(round.round_number ?? 0)}`;

/**
 * The live engine numbers voting rounds from 1 on every day, but a protocol needs round numbers that are unique across
 * the whole game (and revotes point to their parent by that number). Renumbers the rounds one after another in game
 * order and re-points `parent_round_number` inside the same day.
 */
export const renumberVotingRoundsSequentially = (rounds: VotingRound[]): VotingRound[] => {
  const ordered = rounds.map(copy).sort((a, b) => {
    const dayDiff = Number(a.day_number ?? 0) - Number(b.day_number ?? 0);
    return dayDiff || Number(a.round_number ?? 0) - Number(b.round_number ?? 0);
  });
  const newNumberByKey = new Map<string, number>();
  ordered.forEach((round, index) => newNumberByKey.set(keyOf(round), index + 1));
  return ordered.map((round, index) => {
    const parent = round.parent_round_number;
    const parentKey = parent === null || parent === undefined ? null : `${Number(round.day_number ?? 0)}:${Number(parent)}`;
    return {
      ...round,
      round_number: index + 1,
      parent_round_number: parentKey === null ? (parent ?? null) : (newNumberByKey.get(parentKey) ?? parent ?? null),
    };
  });
};

/**
 * True when rounds still carry the engine's per-day numbering: two rounds share a number, but every (day, number) pair is
 * unique. Two rounds with the same day AND number are a malformed record, not a numbering style, and are left alone.
 */
export const hasPerDayRoundNumbers = (rounds: ReadonlyArray<Pick<VotingRound, 'round_number' | 'day_number'>>): boolean => {
  const numbers = new Set<number>();
  const pairs = new Set<string>();
  let repeated = false;
  for (const round of rounds) {
    const number = Number(round.round_number);
    const pair = keyOf(round as VotingRound);
    if (pairs.has(pair)) return false;
    pairs.add(pair);
    if (numbers.has(number)) repeated = true;
    numbers.add(number);
  }
  return repeated;
};
