import { describe, expect, it } from 'vitest';
import type { VotingRound } from '../shared/tournamentVoting';
import {
  clubLiveSessionKey,
  finalizeLiveVotingRounds,
  mergeLiveVotingRounds,
  shotFromResolvedNight,
  updateLiveProtocolEvidence,
} from '../lib/liveClubSession';

const round = (partial: Partial<VotingRound>): VotingRound => ({
  round_number: partial.round_number ?? 1,
  is_revote: partial.is_revote ?? false,
  nominated_seats: partial.nominated_seats ?? [2, 5],
  vote_counts: partial.vote_counts ?? { 2: 5, 5: 5 },
  day_number: partial.day_number ?? 0,
  eligible_voters: partial.eligible_voters ?? 10,
  parent_round_number: partial.parent_round_number ?? null,
  outcome: partial.outcome ?? 'pending',
  eliminated_seats: partial.eliminated_seats ?? [],
  table_leave_votes: partial.table_leave_votes ?? null,
});

describe('club live session evidence', () => {
  it('isolates autosave keys by club game id', () => {
    expect(clubLiveSessionKey(41)).toBe('mafia_live_session:club:41');
    expect(clubLiveSessionKey(42)).toBe('mafia_live_session:club:42');
    expect(clubLiveSessionKey(41)).not.toBe(clubLiveSessionKey(42));
  });

  it('keeps same round numbers from different game days independently', () => {
    const merged = mergeLiveVotingRounds(
      [round({ day_number: 0, round_number: 1, outcome: 'single_eliminated', eliminated_seats: [2] })],
      [round({ day_number: 1, round_number: 1, vote_counts: { 2: 4, 5: 3 }, eligible_voters: 7, outcome: 'single_eliminated', eliminated_seats: [2] })],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((item) => [item.day_number, item.round_number])).toEqual([[0, 1], [1, 1]]);
  });

  it('finalizes repeated seven-way tie as no elimination', () => {
    const seats = [1, 2, 3, 4, 5, 6, 7];
    const finalized = finalizeLiveVotingRounds({
      phase: 'day_voting',
      activeVotingRoundIndex: 1,
      votingRounds: [
        round({ day_number: 1, round_number: 1, nominated_seats: seats, vote_counts: Object.fromEntries(seats.map((seat) => [seat, 1])), eligible_voters: 7, outcome: 'tie_revote' }),
        round({ day_number: 1, round_number: 2, is_revote: true, nominated_seats: seats, vote_counts: Object.fromEntries(seats.map((seat) => [seat, 1])), eligible_voters: 7 }),
      ],
    });
    expect(finalized[1].outcome).toBe('no_elimination');
    expect(finalized[1].eliminated_seats).toEqual([]);
  });

  it('persists table decision result when leaving voting', () => {
    const previous = {
      phase: 'day_voting',
      activeVotingRoundIndex: 1,
      tableLeaveVotesInput: 6,
      votingRounds: [
        round({ day_number: 0, round_number: 1, outcome: 'tie_revote' }),
        round({ day_number: 0, round_number: 2, is_revote: true }),
      ],
    };
    const evidence = updateLiveProtocolEvidence({ votes: [], shots: [] }, { phase: 'night', votingRounds: [] }, previous);
    expect(evidence.votes).toHaveLength(2);
    expect(evidence.votes[1].outcome).toBe('all_tied_eliminated');
    expect(evidence.votes[1].eliminated_seats).toEqual([2, 5]);
    expect(evidence.votes[1].table_leave_votes).toBe(6);
  });

  it('records a selected night target as killed when it was alive before resolution', () => {
    expect(shotFromResolvedNight({
      phase: 'night', roundNumber: 1, nightSubPhase: 'morning', shotPlayerSlot: 4,
      activePlayers: [{ slot_num: 4, alive: true }],
    })).toEqual({ night_number: 1, target_seat: 4, result: 'killed' });
  });

  it('records a night without a target as agreement failure', () => {
    expect(shotFromResolvedNight({
      phase: 'night', roundNumber: 2, nightSubPhase: 'morning', shotPlayerSlot: null,
      activePlayers: [],
    })).toEqual({ night_number: 2, target_seat: 0, result: 'agreement_failed' });
  });
});
