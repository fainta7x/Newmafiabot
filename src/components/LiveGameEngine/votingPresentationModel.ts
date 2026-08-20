export interface VotingAssignmentPresentation {
  slot: number;
  target: number | null;
  automatic: boolean;
}

export interface CollectingVotingPresentation {
  eligible: number;
  remaining: number;
  currentVotes: number;
  isLast: boolean;
  nominee: number;
  assignments: VotingAssignmentPresentation[];
}

export const buildCollectingVotingPresentation = ({
  eligibleVoterSeats,
  eligibleVoters,
  nominatedSeats,
  currentNomineeIndex,
  votesByPlayer,
}: {
  eligibleVoterSeats: number[];
  eligibleVoters?: number | null;
  nominatedSeats: number[];
  currentNomineeIndex: number;
  votesByPlayer: Record<number, number>;
}): CollectingVotingPresentation => {
  const nominee = nominatedSeats[currentNomineeIndex] as number;
  const eligibleSeatSet = new Set(eligibleVoterSeats);
  const explicitEntries = Object.entries(votesByPlayer)
    .filter(([raw]) => eligibleSeatSet.has(Number(raw)));
  const explicitAssigned = explicitEntries.length;
  const currentVotes = explicitEntries
    .filter(([, target]) => target === nominee)
    .length;
  const eligible = eligibleVoters ?? eligibleVoterSeats.length;
  const remaining = Math.max(0, eligible - explicitAssigned);
  const isLast = currentNomineeIndex === nominatedSeats.length - 1;
  const assignments = eligibleVoterSeats
    .slice()
    .sort((a, b) => a - b)
    .map((slot) => ({
      slot,
      target: votesByPlayer[slot] ?? null,
      automatic: false,
    }));

  return { eligible, remaining, currentVotes, isLast, nominee, assignments };
};

export const buildTableDecisionPresentation = ({
  eligible,
  selectedVoterSlots,
}: {
  eligible: number;
  selectedVoterSlots: number[];
}) => {
  const majority = Math.floor(eligible / 2) + 1;
  const entered = selectedVoterSlots.length;
  return {
    majority,
    entered,
    hasMajority: entered >= majority,
    sortedSelectedVoterSlots: selectedVoterSlots.slice().sort((a, b) => a - b),
  };
};
