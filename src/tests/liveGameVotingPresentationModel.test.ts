import { describe, expect, it } from 'vitest';
import {
  buildCollectingVotingPresentation,
  buildTableDecisionPresentation,
} from '../components/LiveGameEngine/votingPresentationModel.js';

describe('Live Game voting presentation model', () => {
  it('keeps explicit votes and leaves unassigned voters blank before the last candidate', () => {
    const view = buildCollectingVotingPresentation({
      eligibleVoterSeats: [3, 1, 2],
      nominatedSeats: [4, 7],
      currentNomineeIndex: 0,
      votesByPlayer: { 1: 4 },
    });

    expect(view.eligible).toBe(3);
    expect(view.remaining).toBe(2);
    expect(view.isLast).toBe(false);
    expect(view.assignments).toEqual([
      { slot: 1, target: 4, automatic: false },
      { slot: 2, target: null, automatic: false },
      { slot: 3, target: null, automatic: false },
    ]);
  });

  it('shows every missing mandatory vote on the last candidate without replacing explicit votes', () => {
    const view = buildCollectingVotingPresentation({
      eligibleVoterSeats: [1, 2, 3, 4],
      eligibleVoters: 4,
      nominatedSeats: [6, 9],
      currentNomineeIndex: 1,
      votesByPlayer: { 1: 6, 3: 9 },
    });

    expect(view.nominee).toBe(9);
    expect(view.remaining).toBe(2);
    expect(view.assignments).toEqual([
      { slot: 1, target: 6, automatic: false },
      { slot: 2, target: 9, automatic: true },
      { slot: 3, target: 9, automatic: false },
      { slot: 4, target: 9, automatic: true },
    ]);
  });

  it('ignores vote-map keys that are not eligible voters when counting remaining votes', () => {
    const view = buildCollectingVotingPresentation({
      eligibleVoterSeats: [1, 2, 3],
      nominatedSeats: [8],
      currentNomineeIndex: 0,
      votesByPlayer: { 1: 8, 99: 8 },
    });

    expect(view.remaining).toBe(2);
  });

  it('keeps table-decision majority arithmetic and selected-seat ordering deterministic', () => {
    expect(buildTableDecisionPresentation({ eligible: 7, selectedVoterSlots: [7, 2, 5, 1] })).toEqual({
      majority: 4,
      entered: 4,
      hasMajority: true,
      sortedSelectedVoterSlots: [1, 2, 5, 7],
    });
    expect(buildTableDecisionPresentation({ eligible: 10, selectedVoterSlots: [1, 2, 3, 4, 5] }).hasMajority).toBe(false);
  });
});
