import { describe, expect, it } from 'vitest';
import { advanceLiveEngineJournal, restoreLiveEngineJournal } from '../lib/liveEngineJournal.ts';
import { updateLiveProtocolEvidence, type LiveSessionSnapshot } from '../lib/liveClubSession.ts';
import { buildFinalChronology } from '../lib/liveGameEventLog.ts';

const snapshot = (patch: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot => ({
  phase: 'day_speeches', roundNumber: 2, nominations: [], nominationsMap: {},
  activePlayers: [{ slot_num: 1, alive: true, fouls: 0 }], ...patch,
});

describe('engine-owned protocol journal', () => {
  it('retains an action and its reversal even if consumers only see the final state', () => {
    const initial = snapshot();
    let journal = advanceLiveEngineJournal(null, initial);
    journal = advanceLiveEngineJournal(journal, snapshot({ nominations: [4], nominationsMap: { 4: 1 } }));
    journal = advanceLiveEngineJournal(journal, initial);
    const slowConsumer = updateLiveProtocolEvidence({ votes: [], shots: [] }, {
      ...initial, protocolEvidence: journal.evidence,
    }, initial);
    expect(slowConsumer.events?.map(e => e.kind)).toEqual(['game_start', 'nomination', 'nomination_removed']);
    expect(slowConsumer.events?.map(e => e.seq)).toEqual([1, 2, 3]);
    const reread = updateLiveProtocolEvidence(slowConsumer, { ...initial, protocolEvidence: journal.evidence }, initial);
    expect(reread).toEqual(slowConsumer);
    reread.events![1].seat = 9;
    expect(journal.evidence.events![1].seat).toBe(4);
  });

  it('reload continues the saved journal without fabricating a second start or losing Undo', () => {
    const initial = snapshot();
    let journal = advanceLiveEngineJournal(null, initial);
    journal = advanceLiveEngineJournal(journal, snapshot({ activePlayers: [{ slot_num: 1, alive: true, fouls: 1 }] }));
    const persisted = JSON.parse(JSON.stringify({ ...journal.snapshot, protocolEvidence: journal.evidence }));
    journal = restoreLiveEngineJournal(persisted)!;
    journal = advanceLiveEngineJournal(journal, persisted);
    journal = advanceLiveEngineJournal(journal, initial);
    expect(journal.evidence.events?.map(e => [e.kind, e.value])).toEqual([
      ['game_start', 'day_speeches'], ['foul', 1], ['foul', 0],
    ]);
    expect(restoreLiveEngineJournal(initial)).toBeNull();
  });

  it('captures a resolved night and the final exit before the polling recorder runs again', () => {
    const before = snapshot({ phase: 'night', nightSubPhase: 'morning', shotPlayerSlot: null });
    let journal = advanceLiveEngineJournal(null, before);
    journal = advanceLiveEngineJournal(journal, { ...before, shotPlayerSlot: 1 });
    const final = { ...before, shotPlayerSlot: 1, postNightStage: 'death_protocol', activePlayers: [{ slot_num: 1, alive: false, exit_reason: 'killed' }] };
    journal = advanceLiveEngineJournal(journal, final);
    expect(journal.evidence.shots).toEqual([{ night_number: 2, target_seat: 1, result: 'killed' }]);
    expect(journal.evidence.events?.filter(e => e.kind === 'exit')).toHaveLength(1);
    const events = buildFinalChronology({
      events: journal.evidence.events, lastSnapshot: journal.snapshot,
      gameData: { slots: final.activePlayers, winning_team: 'Чёрные' }, deathProtocols: {}, at: 'finish',
    });
    expect(events.filter(e => e.kind === 'exit')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ kind: 'game_end' });
  });
  it('carries a finalized voting round through a consumer that skipped the whole vote', () => {
    const initial = snapshot();
    let journal = advanceLiveEngineJournal(null, initial);
    journal = advanceLiveEngineJournal(journal, snapshot({
      phase: 'day_voting', activeVotingRoundIndex: 0,
      votingRounds: [{ round_number: 1, day_number: 1, is_revote: false, nominated_seats: [2, 5],
        vote_counts: { 2: 6, 5: 4 }, eligible_voters: 10, outcome: 'pending', eliminated_seats: [],
        parent_round_number: null, table_leave_votes: null }],
    }));
    journal = advanceLiveEngineJournal(journal, snapshot({ phase: 'night' }));
    const evidence = updateLiveProtocolEvidence({ votes: [], shots: [] }, {
      ...journal.snapshot, protocolEvidence: journal.evidence,
    }, initial);
    expect(evidence.votes).toHaveLength(1);
    expect(evidence.votes[0]).toMatchObject({ outcome: 'single_eliminated', eliminated_seats: [2] });
    expect(evidence.events?.filter(e => e.kind === 'vote_round_result')).toEqual([
      expect.objectContaining({ value: '1:single_eliminated' }),
    ]);
  });

});
