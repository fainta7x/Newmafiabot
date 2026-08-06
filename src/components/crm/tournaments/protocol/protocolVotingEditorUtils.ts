import type { VotingRound } from '../../../../shared/tournamentVoting';

export interface ParsedVoteCountInput {
  draftValue: string;
  value: number;
}

export interface ParsedOptionalVoteInput {
  draftValue: string;
  value: number | null;
}

const parseBoundedDigits = (
  rawValue: string,
  eligibleVoters: number
): { digits: string; value: number | null } => {
  const digits = rawValue.replace(/\D/g, '');
  if (digits === '') {
    return { digits: '', value: null };
  }

  const parsed = Math.min(parseInt(digits, 10), eligibleVoters);
  return {
    digits: String(parsed),
    value: parsed
  };
};

export const updateVotingDay = (
  round: VotingRound,
  rawDay: string
): VotingRound => {
  const dayNumber = parseInt(rawDay, 10) || 0;

  return {
    ...round,
    day_number: dayNumber,
    eligible_voters: dayNumber === 0 ? 10 : round.eligible_voters
  };
};

export const updateEligibleVoters = (
  round: VotingRound,
  rawEligibleVoters: string
): VotingRound => ({
  ...round,
  eligible_voters: parseInt(rawEligibleVoters, 10) || 10
});

export const toggleNominatedSeat = (
  round: VotingRound,
  seatNumber: number
): VotingRound => {
  const nominatedSeats = round.nominated_seats || [];
  const voteCounts = { ...(round.vote_counts || {}) };

  if (nominatedSeats.includes(seatNumber)) {
    delete voteCounts[seatNumber];
    return {
      ...round,
      nominated_seats: nominatedSeats.filter((seat) => seat !== seatNumber),
      vote_counts: voteCounts
    };
  }

  voteCounts[seatNumber] = voteCounts[seatNumber] || 0;
  return {
    ...round,
    nominated_seats: Array.from(new Set([...nominatedSeats, seatNumber])),
    vote_counts: voteCounts
  };
};

export const moveNominatedSeat = (
  round: VotingRound,
  seatNumber: number,
  direction: 'earlier' | 'later'
): VotingRound => {
  const nominatedSeats = [...(round.nominated_seats || [])];
  const currentIndex = nominatedSeats.indexOf(seatNumber);
  const targetIndex = direction === 'earlier'
    ? currentIndex - 1
    : currentIndex + 1;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= nominatedSeats.length
  ) {
    return {
      ...round,
      nominated_seats: nominatedSeats
    };
  }

  [nominatedSeats[currentIndex], nominatedSeats[targetIndex]] = [
    nominatedSeats[targetIndex],
    nominatedSeats[currentIndex]
  ];

  return {
    ...round,
    nominated_seats: nominatedSeats
  };
};

export const parseVoteCountInput = (
  rawValue: string,
  eligibleVoters: number
): ParsedVoteCountInput => {
  const parsed = parseBoundedDigits(rawValue, eligibleVoters);

  return {
    draftValue: parsed.digits,
    value: parsed.value ?? 0
  };
};

export const parseOptionalVoteInput = (
  rawValue: string,
  eligibleVoters: number
): ParsedOptionalVoteInput => {
  const parsed = parseBoundedDigits(rawValue, eligibleVoters);

  return {
    draftValue: parsed.digits,
    value: parsed.value
  };
};

export const setVotingSeatCount = (
  round: VotingRound,
  seatNumber: number,
  value: number
): VotingRound => ({
  ...round,
  vote_counts: {
    ...(round.vote_counts || {}),
    [seatNumber]: value
  }
});

export const setTableLeaveVotes = (
  round: VotingRound,
  value: number | null
): VotingRound => ({
  ...round,
  table_leave_votes: value
});
