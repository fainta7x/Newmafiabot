export interface VotingRound {
  round_number: number;
  is_revote?: boolean;
  nominated_seats: number[];
  vote_counts: Record<number, number>;
  day_number?: number;
  eligible_voters?: number | null;
  parent_round_number?: number | null;
  /** Snapshot of the immediate parent division. New live rounds use it to distinguish a changed tie from an identical repeated tie. */
  parent_nominated_seats?: number[];
  parent_vote_counts?: Record<number, number>;
  outcome?: 'pending' | 'single_eliminated' | 'tie_revote' | 'all_tied_eliminated' | 'no_elimination';
  eliminated_seats?: number[];
  table_leave_votes?: number | null;
}

export type VotingOutcomeType =
  | 'single_eliminated'
  | 'needs_revote'
  | 'requires_table_decision'
  | 'auto_no_elimination'
  | 'pending';

export interface VotingResult {
  outcome: VotingOutcomeType;
  resolvedOutcome?: 'single_eliminated' | 'tie_revote' | 'all_tied_eliminated' | 'no_elimination' | 'pending';
  winners: number[];
  maxVotes: number;
  description: string;
  eliminatedSeats: number[];
}

/**
 * Find candidates with the maximum number of votes.
 */
export function getLeadersAndMaxVotes(
  nominatedSeats: number[],
  voteCounts: Record<number | string, number>
): { leaders: number[]; maxVotes: number } {
  let maxVotes = -1;
  let leaders: number[] = [];

  for (const seat of nominatedSeats) {
    const v = Number(voteCounts[seat] ?? voteCounts[String(seat)] ?? 0);
    if (v > maxVotes) {
      maxVotes = v;
      leaders = [seat];
    } else if (v === maxVotes) {
      leaders.push(seat);
    }
  }

  return { leaders, maxVotes };
}

/**
 * Return candidate order preserving parent leaders (if any).
 */
export function preserveCandidateOrder(nominatedSeats: number[], parentLeaders: number[]): number[] {
  // If we are in a revote, candidate order should exactly match the order of parent leaders
  const parentLeaderSet = new Set(parentLeaders);
  const remaining = nominatedSeats.filter(s => !parentLeaderSet.has(s));
  return [...parentLeaders.filter(s => nominatedSeats.includes(s)), ...remaining];
}

/**
 * Calculate the voting remainder.
 * If there is only 1 candidate, they automatically get all votes.
 * Otherwise, the last candidate gets the remainder.
 */
export function calculateVoteRemainder(
  nominatedSeats: number[],
  eligibleVoters: number,
  voteCounts: Record<number | string, number>
): Record<number, number> {
  const counts: Record<number, number> = {};
  nominatedSeats.forEach(seat => {
    counts[seat] = Number(voteCounts[seat] ?? voteCounts[String(seat)] ?? 0);
  });

  if (nominatedSeats.length === 1) {
    counts[nominatedSeats[0]] = eligibleVoters;
    return counts;
  }

  if (nominatedSeats.length >= 2) {
    const lastSeat = nominatedSeats[nominatedSeats.length - 1];
    let sumPrev = 0;
    for (let i = 0; i < nominatedSeats.length - 1; i++) {
      sumPrev += Number(counts[nominatedSeats[i]] || 0);
    }
    const remainder = Math.max(0, eligibleVoters - sumPrev);
    counts[lastSeat] = remainder;
  }

  return counts;
}

const sameSeatOrder = (left: number[], right: number[]) =>
  left.length === right.length && left.every((seat, index) => Number(seat) === Number(right[index]));

/**
 * Determine the outcome of a voting round.
 */
export function determineVotingResult(round: Partial<VotingRound>): VotingResult {
  const nominatedSeats = round.nominated_seats || [];
  const eligibleVoters = round.eligible_voters ?? 10;
  const isRevote = !!round.is_revote;
  const voteCounts = round.vote_counts || {};

  if (nominatedSeats.length === 0) {
    return {
      outcome: 'pending',
      resolvedOutcome: 'pending',
      winners: [],
      maxVotes: 0,
      description: 'Нет кандидатов на голосование.',
      eliminatedSeats: []
    };
  }

  // Calculate sum of votes
  const sumVotes = nominatedSeats.reduce((sum, s) => {
    const counts = voteCounts as any;
    return sum + Number(counts[s] ?? counts[String(s)] ?? 0);
  }, 0);
  if (sumVotes !== eligibleVoters) {
    return {
      outcome: 'pending',
      resolvedOutcome: 'pending',
      winners: [],
      maxVotes: 0,
      description: `Распределите ${eligibleVoters} голосов для подведения итогов.`,
      eliminatedSeats: []
    };
  }

  const { leaders: winners, maxVotes } = getLeadersAndMaxVotes(nominatedSeats, voteCounts);

  // 1. One leader -> single_eliminated
  if (winners.length === 1) {
    return {
      outcome: 'single_eliminated',
      resolvedOutcome: 'single_eliminated',
      winners,
      maxVotes,
      description: `Игрок #${winners[0]} набрал большинство голосов (${maxVotes}) и покидает стол.`,
      eliminatedSeats: [winners[0]]
    };
  }

  // 2. Multiple leaders (Tie)
  if (!isRevote) {
    // Main vote tie
    return {
      outcome: 'needs_revote',
      resolvedOutcome: 'tie_revote',
      winners,
      maxVotes,
      description: `Ничья между игроками #${winners.join(', #')} (${maxVotes} голосов у каждого). Требуется переголосование.`,
      eliminatedSeats: []
    };
  }

  // Once a disputed candidate set has received its 30-second speeches and remains
  // tied on the next vote, do not repeat the speeches. The exact vote numbers may
  // change; the deciding fact is whether the disputed candidate set changed.
  const sameDisputedComposition = winners.length === nominatedSeats.length
    && sameSeatOrder(nominatedSeats, winners);

  if (!sameDisputedComposition) {
    return {
      outcome: 'needs_revote',
      resolvedOutcome: 'tie_revote',
      winners,
      maxVotes,
      description: `Ничья на переголосовании между новым составом лидеров: игроки #${winners.join(', #')} (${maxVotes} голосов у каждого). Требуется следующее переголосование.`,
      eliminatedSeats: []
    };
  }

  // The same disputed candidate set tied again -> raise / leave decision.
  const isAllowedDecision = winners.length <= (eligibleVoters / 2);

  if (!isAllowedDecision) {
    // Candidates count is more than half of voters -> automatic no_elimination
    return {
      outcome: 'auto_no_elimination',
      resolvedOutcome: 'no_elimination',
      winners,
      maxVotes,
      description: 'Спорных игроков больше половины стола — никто не покидает стол, наступает ночь.',
      eliminatedSeats: []
    };
  }

  // Candidates count is <= half of voters -> requires table decision
  const tableLeaveVotes = round.table_leave_votes;
  if (tableLeaveVotes === undefined || tableLeaveVotes === null) {
    return {
      outcome: 'requires_table_decision',
      resolvedOutcome: undefined,
      winners,
      maxVotes,
      description: `Тот же состав спорных игроков остался в ничьей после переголосования. Требуется решение стола за уход всех спорных игроков (#${winners.join(', #')}).`,
      eliminatedSeats: []
    };
  }

  const majorityRequired = Math.floor(eligibleVoters / 2) + 1;
  const leavesTable = tableLeaveVotes >= majorityRequired;

  return {
    outcome: 'requires_table_decision',
    resolvedOutcome: leavesTable ? 'all_tied_eliminated' : 'no_elimination',
    winners,
    maxVotes,
    description: leavesTable
      ? `Большинство голосующих (${tableLeaveVotes} из ${majorityRequired}) высказались за уход. Все спорные игроки (#${winners.join(', #')}) покидают стол.`
      : `Большинство голосов за уход не набрано (${tableLeaveVotes} из ${majorityRequired}). Никто не покидает стол.`,
    eliminatedSeats: leavesTable ? winners : []
  };
}

/**
 * Create a new revote round from parent round.
 */
export function createNextRevoteRound(parentRound: VotingRound, winners: number[]): VotingRound {
  const parentVoteCounts = parentRound.nominated_seats.reduce<Record<number, number>>((acc, seat) => {
    acc[seat] = Number(parentRound.vote_counts[seat] ?? 0);
    return acc;
  }, {});

  return {
    round_number: 9999, // temporary
    is_revote: true,
    nominated_seats: [...winners],
    vote_counts: winners.reduce<Record<number, number>>((acc, s) => {
      acc[s] = 0;
      return acc;
    }, {}),
    day_number: parentRound.day_number ?? 0,
    eligible_voters: parentRound.eligible_voters ?? 10,
    parent_round_number: parentRound.round_number,
    parent_nominated_seats: [...parentRound.nominated_seats],
    parent_vote_counts: parentVoteCounts,
    outcome: 'pending',
    eliminated_seats: [],
    table_leave_votes: null
  };
}

/**
 * Recursively find all descendant round numbers of given starting round numbers.
 */
export function findDescendantRoundNumbers(
  rounds: { round_number?: number; parent_round_number?: number }[],
  startRoundNumbers: Set<number>
): Set<number> {
  const descendants = new Set<number>();
  const queue = Array.from(startRoundNumbers);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const r of rounds) {
      if (r.round_number !== undefined && r.parent_round_number === current) {
        if (!descendants.has(r.round_number)) {
          descendants.add(r.round_number);
          queue.push(r.round_number);
        }
      }
    }
  }

  return descendants;
}

/**
 * Validate that the child round's nominated seats contain exactly the leaders of the parent round in the same order.
 */
export function validateChildLeadersOrder(parentRound: VotingRound, childRound: VotingRound): boolean {
  const parentResult = determineVotingResult(parentRound);
  const parentLeaders = parentResult.winners;
  const childNominated = childRound.nominated_seats || [];

  if (parentLeaders.length !== childNominated.length) {
    return false;
  }
  for (let i = 0; i < parentLeaders.length; i++) {
    if (parentLeaders[i] !== childNominated[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Validate voting hierarchy: every round (including revotes) with outcome 'tie_revote'
 * must have exactly one logically correct child revote stage.
 */
export function validateVotingHierarchy(votes: Partial<VotingRound>[]): string | null {
  for (const r of votes) {
    if (r.outcome === 'tie_revote') {
      const parentNum = r.round_number;
      const dayNum = r.day_number ?? 0;

      if (parentNum === undefined || parentNum === null) {
        continue;
      }

      const children = votes.filter(
        v => v.is_revote && v.parent_round_number !== undefined && v.parent_round_number !== null && Number(v.parent_round_number) === Number(parentNum)
      );

      if (children.length === 0) {
        return `Голосование: раунд #${parentNum} завершился ничьей, но для него отсутствует связанное переголосование.`;
      }
      if (children.length > 1) {
        return `Голосование (этап #${parentNum}, день ${dayNum}): обнаружено более одного переголосования для одного этапа.`;
      }

      const child = children[0];
      const parentResult = determineVotingResult(r);
      const parentLeaders = parentResult.winners;
      const childNominated = child.nominated_seats || [];

      if (parentLeaders.length !== childNominated.length) {
        return `Голосование (этап #${child.round_number}, день ${child.day_number ?? ''}): количество кандидатов (${childNominated.length}) не соответствует спорным игрокам предыдущего раунда (${parentLeaders.length}).`;
      }

      for (let i = 0; i < parentLeaders.length; i++) {
        if (Number(parentLeaders[i]) !== Number(childNominated[i])) {
          return `Голосование (этап #${child.round_number}, день ${child.day_number ?? ''}): список кандидатов переголосования (${childNominated.join(', ')}) не соответствует спорным игрокам предыдущего раунда (${parentLeaders.join(', ')}).`;
        }
      }
    }
  }
  return null;
}

/**
 * Assign new sequential numbers from 1 to each round, preserving hierarchy mappings.
 */
export function safeRenumberVotes(votesList: VotingRound[]): VotingRound[] {
  const newVotes = votesList.map((r, idx) => {
    return {
      ...r,
      _newRoundNum: idx + 1
    };
  });

  const oldToNewNum = new Map<number, number>();
  for (let idx = 0; idx < votesList.length; idx++) {
    const oldR = votesList[idx];
    const newR = newVotes[idx];
    if (oldR.round_number !== undefined && oldR.round_number !== null) {
      oldToNewNum.set(oldR.round_number, newR._newRoundNum);
    }
  }

  return newVotes.map(r => {
    const parentNum = r.parent_round_number;
    let newParentNum = undefined;
    if (parentNum !== undefined && parentNum !== null) {
      newParentNum = oldToNewNum.get(parentNum);
    }

    const { _newRoundNum, ...rest } = r as any;
    return {
      ...rest,
      round_number: _newRoundNum,
      parent_round_number: newParentNum
    };
  });
}

/**
 * Filter, sync, propagate and renumber a list of voting rounds.
 */
export function cleanAndSyncVotes(votesList: VotingRound[]): VotingRound[] {
  let current = [...votesList];

  // Helper: recursively filter out revotes whose parents are missing or not tie_revote/pending
  let changed = true;
  while (changed) {
    const initialLength = current.length;
    const existingRoundNums = new Set(current.map(v => v.round_number).filter((n): n is number => n !== undefined));
    const roundMap = new Map<number, VotingRound>();
    current.forEach(r => {
      if (r.round_number !== undefined) {
        roundMap.set(r.round_number, r);
      }
    });

    current = current.filter(r => {
      if (r.is_revote) {
        if (r.parent_round_number === undefined || r.parent_round_number === null) {
          return false;
        }
        if (!existingRoundNums.has(r.parent_round_number)) {
          return false;
        }
        const parent = roundMap.get(r.parent_round_number);
        if (!parent || parent.outcome !== 'tie_revote') {
          return false;
        }
      }
      return true;
    });

    if (current.length === initialLength) {
      changed = false;
    }
  }

  // Propagate day_number, eligible_voters and the immediate parent division to children.
  const parentRoundMap = new Map<number, VotingRound>();
  current.forEach(r => {
    if (r.round_number !== undefined) {
      parentRoundMap.set(r.round_number, r);
    }
  });

  current = current.map(r => {
    if (!r.is_revote && r.day_number === 0) {
      return {
        ...r,
        eligible_voters: 10
      };
    }
    if (r.is_revote && r.parent_round_number !== undefined && r.parent_round_number !== null) {
      const parent = parentRoundMap.get(r.parent_round_number);
      if (parent) {
        return {
          ...r,
          day_number: parent.day_number ?? 0,
          eligible_voters: parent.eligible_voters ?? 10,
          parent_nominated_seats: [...parent.nominated_seats],
          parent_vote_counts: { ...parent.vote_counts },
        };
      }
    }
    return r;
  });

  // If a child revote is deleted, return parent round to 'pending'
  const activeParentNums = new Set<number>();
  current.forEach(r => {
    if (r.is_revote && r.parent_round_number !== undefined && r.parent_round_number !== null) {
      activeParentNums.add(r.parent_round_number);
    }
  });

  current = current.map(r => {
    if (r.outcome === 'tie_revote') {
      if (r.round_number !== undefined && !activeParentNums.has(r.round_number)) {
        return {
          ...r,
          outcome: 'pending',
          eliminated_seats: [],
          table_leave_votes: undefined
        };
      }
    }
    return r;
  });

  return safeRenumberVotes(current);
}