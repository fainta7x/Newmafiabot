import { describe, expect, it } from 'vitest';
import { createEmptyLiveProtocolMarkers } from '../lib/gameProtocolCore.ts';
import { determineLiveWinner } from '../lib/liveGameFlow.ts';
import {
  createEmptyActivePlayer,
  createInitialLiveDiscipline,
  normalizeLiveSnapshotForRestore,
  type LiveSnapshot,
} from '../components/LiveGameEngine/engineStateModel.ts';

const makeSnapshot = (phase: LiveSnapshot['phase']): LiveSnapshot => ({
  activePlayers: Array.from({ length: 10 }, (_, index) => createEmptyActivePlayer(index + 1)),
  nominations: [],
  nominationsMap: {},
  phase,
  roundNumber: 5,
  dayStarterSlot: 8,
  nightSubPhase: 'intro',
  postNightStage: 'none',
  protocolMarkers: createEmptyLiveProtocolMarkers(),
  activeBestMoveSource: null,
  activeBestMoveSlot: null,
  pendingBestMoveSeats: [],
  bestMoveDeadlineMs: null,
  votingRounds: [],
  activeVotingRoundIndex: 0,
  votesByPlayer: {},
  votes: {},
  votingStage: 'setup',
  revoteSpeakerIndex: 0,
  tableLeaveVotesInput: null,
  tableDecisionSelectionKey: null,
  tableDecisionSelectedVoterSlots: [],
  currentVotingNomineeIndex: 0,
  activeSpeakerSlot: null,
  customTimerLabel: null,
  timeLeft: 60,
  timerMax: 60,
  isTimerRunning: false,
  zeroNightSubPhase: null,
  zeroNightMusicState: 'pending',
  shotPlayerSlot: null,
  donCheckSlot: null,
  donCheckResult: null,
  sheriffCheckSlot: null,
  sheriffCheckResult: null,
  nightLogs: [],
  votingFarewellQueue: [],
  votingFarewellIndex: 0,
  discipline: createInitialLiveDiscipline(),
});

describe('live game restore winner regression', () => {
  it('drops stale final-action state on an ordinary day so a red win can resolve', () => {
    const snapshot = makeSnapshot('day_speeches');
    snapshot.activePlayers = snapshot.activePlayers.map((player, index) => ({
      ...player,
      team: index >= 7 ? 'Чёрные' : 'Красные',
      alive: index < 7,
    }));
    snapshot.votingFarewellQueue = [9];
    snapshot.votingFarewellIndex = 0;
    snapshot.postNightStage = 'death_protocol';
    snapshot.activeBestMoveSource = 'zero_round_voted';
    snapshot.activeBestMoveSlot = 9;
    snapshot.pendingBestMoveSeats = [1, 2, 3];

    const restored = normalizeLiveSnapshotForRestore(snapshot);

    expect(determineLiveWinner(restored.activePlayers)).toBe('Красные');
    expect(restored.votingFarewellQueue).toEqual([]);
    expect(restored.votingFarewellIndex).toBe(0);
    expect(restored.postNightStage).toBe('none');
    expect(restored.activeBestMoveSource).toBeNull();
    expect(restored.activeBestMoveSlot).toBeNull();
    expect(restored.pendingBestMoveSeats).toEqual([]);
  });

  it('keeps a real voting farewell while the game is still in day voting', () => {
    const snapshot = makeSnapshot('day_voting');
    snapshot.votingFarewellQueue = [9, 10];
    snapshot.votingFarewellIndex = 1;
    snapshot.activeBestMoveSource = 'zero_round_voted';
    snapshot.activeBestMoveSlot = 9;

    const restored = normalizeLiveSnapshotForRestore(snapshot);

    expect(restored.votingFarewellQueue).toEqual([9, 10]);
    expect(restored.votingFarewellIndex).toBe(1);
    expect(restored.activeBestMoveSource).toBe('zero_round_voted');
    expect(restored.activeBestMoveSlot).toBe(9);
  });

  it('keeps real post-night final actions during the night', () => {
    const snapshot = makeSnapshot('night');
    snapshot.postNightStage = 'death_protocol';

    const restored = normalizeLiveSnapshotForRestore(snapshot);

    expect(restored.postNightStage).toBe('death_protocol');
  });

  it('keeps first-killed best move recovery only in the night best-move phase', () => {
    const snapshot = makeSnapshot('night');
    snapshot.nightSubPhase = 'best_move';
    snapshot.protocolMarkers = { ...snapshot.protocolMarkers, firstKilledSlot: 4 };
    snapshot.activeBestMoveSource = 'first_killed';
    snapshot.activeBestMoveSlot = 4;
    snapshot.pendingBestMoveSeats = [2, 5, 8];

    const restored = normalizeLiveSnapshotForRestore(snapshot);

    expect(restored.activeBestMoveSource).toBe('first_killed');
    expect(restored.activeBestMoveSlot).toBe(4);
    expect(restored.pendingBestMoveSeats).toEqual([2, 5, 8]);
  });
});
