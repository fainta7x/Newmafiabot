import { describe, expect, it } from 'vitest';
import { createEmptyLiveProtocolMarkers } from '../lib/gameProtocolCore.js';
import {
  cloneLiveSnapshot,
  createEmptyActivePlayer,
  createInitialLiveDiscipline,
  normalizeLiveSnapshotForRestore,
  type LiveSnapshot,
} from '../components/LiveGameEngine/engineStateModel.js';

const createSnapshot = (): LiveSnapshot => ({
  activePlayers: [createEmptyActivePlayer(1)],
  nominations: [3, 7],
  nominationsMap: { 3: 1, 7: 2 },
  phase: 'day_voting',
  roundNumber: 2,
  nightSubPhase: 'intro',
  postNightStage: 'none',
  protocolMarkers: {
    ...createEmptyLiveProtocolMarkers(),
    firstKilledSlot: 1,
    bestMoveSeats: [3, 5, 8],
  },
  activeBestMoveSource: 'first_killed',
  activeBestMoveSlot: 1,
  pendingBestMoveSeats: [3, 5],
  votingRounds: [{
    round_number: 1,
    nominated_seats: [3, 7],
    vote_counts: { 3: 4, 7: 6 },
    eligible_voters: 10,
    outcome: 'pending',
    eliminated_seats: [],
    table_leave_votes: null,
  }],
  activeVotingRoundIndex: 0,
  votesByPlayer: { 1: 3, 2: 7 },
  votes: { 3: 4, 7: 6 },
  votingStage: 'collecting',
  revoteSpeakerIndex: 0,
  tableLeaveVotesInput: null,
  currentVotingNomineeIndex: 1,
  activeSpeakerSlot: 2,
  customTimerLabel: 'Речь #2',
  timeLeft: 42,
  timerMax: 60,
  isTimerRunning: true,
  zeroNightSubPhase: null,
  zeroNightMusicState: 'pending',
  shotPlayerSlot: null,
  donCheckSlot: null,
  donCheckResult: null,
  sheriffCheckSlot: null,
  sheriffCheckResult: null,
  nightLogs: [{ round: 1, log: 'Н1: промах мафии.' }],
  votingFarewellQueue: [3, 7],
  votingFarewellIndex: 0,
  discipline: createInitialLiveDiscipline(),
});

describe('Live Game engine state model', () => {
  it('creates the same empty red alive seat state used by engine setup', () => {
    expect(createEmptyActivePlayer(4)).toEqual({
      slot_num: 4,
      user_id: 0,
      nickname: '',
      role: 'Мирный',
      team: 'Красные',
      fouls: 0,
      minor_tech_fouls: 0,
      major_tech_fouls: 0,
      removal_reason: null,
      alive: true,
      nominated_this_round: false,
      has_spoken_this_round: false,
      mute_this_round: false,
      is_pu: false,
      best_move_guesses: [],
      kick: false,
      ppk: false,
      bonus_points: 0,
      lh_points: 0,
      will_protocol_points: 0,
      will_opinion_points: 0,
      dc_points: 0,
      eliminated_phase: '',
      has_foul_penalty: false,
      exit_reason: 'alive',
    });
  });

  it('creates ten red discipline seats with no pending penalties or game-ending state', () => {
    const discipline = createInitialLiveDiscipline();
    expect(Object.keys(discipline.players)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(discipline.players['1']).toMatchObject({
      id: '1',
      team: 'red',
      regularFouls: 0,
      minorTechFouls: 0,
      majorTechFouls: 0,
      isRemoved: false,
      pendingAction: null,
      ppkCaused: false,
      has30SecPenalty: false,
    });
    expect(discipline.players['10']).toMatchObject({ id: '10', team: 'red' });
    expect(discipline.isNextVotingCancelled).toBe(false);
    expect(discipline.pendingVotingCancellationPlayerIds).toEqual([]);
    expect(discipline.isPpk).toBe(false);
    expect(discipline.ppkWinnerTeam).toBeNull();
    expect(discipline.ppkCulpritId).toBeNull();
    expect(discipline.requiresProtocolReview).toBe(false);
  });

  it('returns fresh mutable state on every factory call', () => {
    const firstPlayer = createEmptyActivePlayer(1);
    const secondPlayer = createEmptyActivePlayer(1);
    firstPlayer.best_move_guesses.push(3);
    expect(secondPlayer.best_move_guesses).toEqual([]);

    const firstDiscipline = createInitialLiveDiscipline();
    const secondDiscipline = createInitialLiveDiscipline();
    firstDiscipline.players['1'].regularFouls = 3;
    expect(secondDiscipline.players['1'].regularFouls).toBe(0);
  });

  it('clones the same snapshot collections the engine previously copied inline', () => {
    const source = createSnapshot();
    const cloned = cloneLiveSnapshot(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);

    cloned.activePlayers[0].best_move_guesses.push(9);
    cloned.nominations.push(9);
    cloned.nominationsMap[9] = 4;
    cloned.protocolMarkers.bestMoveSeats.push(10);
    cloned.pendingBestMoveSeats.push(10);
    cloned.votingRounds[0].nominated_seats.push(9);
    cloned.votesByPlayer[5] = 3;
    cloned.votes[3] = 5;
    cloned.nightLogs[0].log = 'changed';
    cloned.votingFarewellQueue.push(9);
    cloned.discipline.players['1'].regularFouls = 3;

    expect(source.activePlayers[0].best_move_guesses).toEqual([]);
    expect(source.nominations).toEqual([3, 7]);
    expect(source.nominationsMap).toEqual({ 3: 1, 7: 2 });
    expect(source.protocolMarkers.bestMoveSeats).toEqual([3, 5, 8]);
    expect(source.pendingBestMoveSeats).toEqual([3, 5]);
    expect(source.votingRounds[0].nominated_seats).toEqual([3, 7]);
    expect(source.votesByPlayer).toEqual({ 1: 3, 2: 7 });
    expect(source.votes).toEqual({ 3: 4, 7: 6 });
    expect(source.nightLogs[0].log).toBe('Н1: промах мафии.');
    expect(source.votingFarewellQueue).toEqual([3, 7]);
    expect(source.discipline.players['1'].regularFouls).toBe(0);
  });

  it('preserves legacy restore fallbacks and nullish zero/false values exactly', () => {
    const degraded = {
      ...createSnapshot(),
      nominationsMap: undefined,
      postNightStage: undefined,
      protocolMarkers: undefined,
      activeBestMoveSource: undefined,
      activeBestMoveSlot: 0,
      pendingBestMoveSeats: undefined,
      votingRounds: undefined,
      activeVotingRoundIndex: undefined,
      votesByPlayer: undefined,
      votes: undefined,
      votingStage: undefined,
      revoteSpeakerIndex: undefined,
      tableLeaveVotesInput: 0,
      currentVotingNomineeIndex: undefined,
      activeSpeakerSlot: 0,
      customTimerLabel: undefined,
      timeLeft: 0,
      timerMax: 0,
      isTimerRunning: undefined,
      zeroNightSubPhase: undefined,
      zeroNightMusicState: undefined,
      shotPlayerSlot: 0,
      donCheckSlot: 0,
      donCheckResult: false,
      sheriffCheckSlot: 0,
      sheriffCheckResult: '',
      nightLogs: undefined,
      votingFarewellQueue: undefined,
      votingFarewellIndex: undefined,
      discipline: undefined,
    } as unknown as LiveSnapshot;

    const restored = normalizeLiveSnapshotForRestore(degraded);

    expect(restored.nominationsMap).toEqual({});
    expect(restored.postNightStage).toBe('none');
    expect(restored.protocolMarkers).toEqual(createEmptyLiveProtocolMarkers());
    expect(restored.activeBestMoveSource).toBeNull();
    expect(restored.activeBestMoveSlot).toBe(0);
    expect(restored.pendingBestMoveSeats).toEqual([]);
    expect(restored.votingRounds).toEqual([]);
    expect(restored.activeVotingRoundIndex).toBe(0);
    expect(restored.votesByPlayer).toEqual({});
    expect(restored.votes).toEqual({});
    expect(restored.votingStage).toBe('setup');
    expect(restored.revoteSpeakerIndex).toBe(0);
    expect(restored.tableLeaveVotesInput).toBe(0);
    expect(restored.currentVotingNomineeIndex).toBe(0);
    expect(restored.activeSpeakerSlot).toBe(0);
    expect(restored.customTimerLabel).toBeNull();
    expect(restored.timeLeft).toBe(0);
    expect(restored.timerMax).toBe(0);
    expect(restored.isTimerRunning).toBe(false);
    expect(restored.zeroNightSubPhase).toBeNull();
    expect(restored.zeroNightMusicState).toBe('pending');
    expect(restored.shotPlayerSlot).toBe(0);
    expect(restored.donCheckSlot).toBe(0);
    expect(restored.donCheckResult).toBe(false);
    expect(restored.sheriffCheckSlot).toBe(0);
    expect(restored.sheriffCheckResult).toBe('');
    expect(restored.nightLogs).toEqual([]);
    expect(restored.votingFarewellQueue).toEqual([]);
    expect(restored.votingFarewellIndex).toBe(0);
    expect(Object.keys(restored.discipline.players)).toHaveLength(10);
    expect(restored.discipline.players['1']).toMatchObject({ id: '1', team: 'red', regularFouls: 0 });
  });
});
