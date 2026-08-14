// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createNextRevoteRound, type VotingRound } from '../shared/tournamentVoting';
import {
  ClubLiveSessionRecorder,
  LEGACY_DEATH_PROTOCOL_KEY,
  LEGACY_LIVE_SESSION_KEY,
  clubLiveDeathProtocolKey,
  clubLiveEvidenceKey,
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
  parent_nominated_seats: partial.parent_nominated_seats,
  parent_vote_counts: partial.parent_vote_counts,
  outcome: partial.outcome ?? 'pending',
  eliminated_seats: partial.eliminated_seats ?? [],
  table_leave_votes: partial.table_leave_votes ?? null,
});

describe('club live session evidence', () => {
  beforeEach(() => localStorage.clear());

  it('isolates autosave keys by club game id', () => {
    expect(clubLiveSessionKey(41)).toBe('mafia_live_session:club:41');
    expect(clubLiveSessionKey(42)).toBe('mafia_live_session:club:42');
    expect(clubLiveSessionKey(41)).not.toBe(clubLiveSessionKey(42));
  });

  it('keeps live and death-protocol drafts scoped to the same game', () => {
    localStorage.setItem(clubLiveSessionKey(41), JSON.stringify({ phase: 'day_speeches', activePlayers: [] }));
    localStorage.setItem(clubLiveDeathProtocolKey(41), JSON.stringify({ 4: { red: [1], black: [], sheriff: [] } }));

    const game41 = new ClubLiveSessionRecorder(41);
    game41.mount();
    expect(localStorage.getItem(LEGACY_LIVE_SESSION_KEY)).toContain('day_speeches');
    expect(localStorage.getItem(LEGACY_DEATH_PROTOCOL_KEY)).toContain('"4"');
    game41.unmount();
    expect(localStorage.getItem(LEGACY_LIVE_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_DEATH_PROTOCOL_KEY)).toBeNull();

    const game42 = new ClubLiveSessionRecorder(42);
    game42.mount();
    expect(localStorage.getItem(LEGACY_LIVE_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_DEATH_PROTOCOL_KEY)).toBeNull();
    game42.unmount();
  });

  it('flushes the latest live snapshot when the page is hidden or closed', () => {
    const recorder = new ClubLiveSessionRecorder(51);
    recorder.mount();

    const latest = {
      phase: 'night',
      roundNumber: 3,
      nightSubPhase: 'sheriff',
      activePlayers: Array.from({ length: 10 }, (_, index) => ({ slot_num: index + 1, alive: index !== 3 })),
      votingRounds: [round({ day_number: 2, round_number: 1, outcome: 'single_eliminated', eliminated_seats: [4] })],
      activeVotingRoundIndex: 0,
      tableLeaveVotesInput: null,
      savedAt: '17:31',
    };
    localStorage.setItem(LEGACY_LIVE_SESSION_KEY, JSON.stringify(latest));

    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(clubLiveSessionKey(51)) || '{}')).toEqual(latest);

    recorder.unmount();
  });

  it('restores the exact game-scoped draft after closing and reopening the live engine', () => {
    const snapshot = {
      phase: 'day_voting',
      roundNumber: 4,
      activePlayers: Array.from({ length: 10 }, (_, index) => ({ slot_num: index + 1, alive: index < 7 })),
      votingRounds: [round({ day_number: 3, round_number: 2, is_revote: true, vote_counts: { 2: 4, 5: 3 }, eligible_voters: 7 })],
      activeVotingRoundIndex: 0,
      tableLeaveVotesInput: 4,
      savedAt: '17:32',
    };

    const firstOpen = new ClubLiveSessionRecorder(61);
    firstOpen.mount();
    localStorage.setItem(LEGACY_LIVE_SESSION_KEY, JSON.stringify(snapshot));
    firstOpen.unmount();

    expect(localStorage.getItem(LEGACY_LIVE_SESSION_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(clubLiveSessionKey(61)) || '{}')).toEqual(snapshot);

    const reopened = new ClubLiveSessionRecorder(61);
    reopened.mount();
    expect(JSON.parse(localStorage.getItem(LEGACY_LIVE_SESSION_KEY) || '{}')).toEqual(snapshot);
    reopened.unmount();
  });

  it('finishing one game clears only its recovery data and leaves another game draft intact', () => {
    localStorage.setItem(clubLiveSessionKey(71), JSON.stringify({ phase: 'night', activePlayers: [] }));
    localStorage.setItem(clubLiveEvidenceKey(71), JSON.stringify({ votes: [], shots: [] }));
    localStorage.setItem(clubLiveDeathProtocolKey(71), JSON.stringify({ 2: { red: [], black: [8], sheriff: [] } }));
    localStorage.setItem(clubLiveSessionKey(72), JSON.stringify({ phase: 'day_speeches', activePlayers: [] }));
    localStorage.setItem(clubLiveEvidenceKey(72), JSON.stringify({ votes: [round({})], shots: [] }));
    localStorage.setItem(clubLiveDeathProtocolKey(72), JSON.stringify({ 5: { red: [1], black: [], sheriff: [] } }));

    const recorder = new ClubLiveSessionRecorder(71);
    recorder.mount();
    recorder.finish();

    expect(localStorage.getItem(clubLiveSessionKey(71))).toBeNull();
    expect(localStorage.getItem(clubLiveEvidenceKey(71))).toBeNull();
    expect(localStorage.getItem(clubLiveDeathProtocolKey(71))).toBeNull();
    expect(localStorage.getItem(clubLiveSessionKey(72))).not.toBeNull();
    expect(localStorage.getItem(clubLiveEvidenceKey(72))).not.toBeNull();
    expect(localStorage.getItem(clubLiveDeathProtocolKey(72))).not.toBeNull();
  });

  it('keeps same round numbers from different game days independently', () => {
    const merged = mergeLiveVotingRounds(
      [round({ day_number: 0, round_number: 1, outcome: 'single_eliminated', eliminated_seats: [2] })],
      [round({ day_number: 1, round_number: 1, vote_counts: { 2: 4, 5: 3 }, eligible_voters: 7, outcome: 'single_eliminated', eliminated_seats: [2] })],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((item) => [item.day_number, item.round_number])).toEqual([[0, 1], [1, 1]]);
  });

  it('keeps immediate parent division on saved revote evidence', () => {
    const parent = round({
      day_number: 2,
      round_number: 3,
      nominated_seats: [1, 2, 3],
      vote_counts: { 1: 5, 2: 5, 3: 0 },
      outcome: 'tie_revote',
    });
    const child = createNextRevoteRound(parent, [1, 2]);
    child.round_number = 4;
    child.vote_counts = { 1: 5, 2: 5 };

    const merged = mergeLiveVotingRounds([], [parent, child]);
    expect(merged[1].parent_nominated_seats).toEqual([1, 2, 3]);
    expect(merged[1].parent_vote_counts).toEqual({ 1: 5, 2: 5, 3: 0 });
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
