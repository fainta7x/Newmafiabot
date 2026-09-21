import { describe, expect, it } from 'vitest';
import { createEmptyLiveProtocolMarkers } from '../lib/gameProtocolCore.ts';
import {
  createEmptyActivePlayer,
  createInitialLiveDiscipline,
  type LiveSnapshot,
} from '../components/LiveGameEngine/engineStateModel.ts';
import {
  LIVE_GAME_SESSION_STORAGE_KEY,
  readRestorableLiveSession,
  removeLiveSession,
  writeLiveSession,
  type PersistedLiveSession,
} from '../components/LiveGameEngine/liveSessionStorage.ts';

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

const makeSnapshot = (phase: LiveSnapshot['phase'] = 'day_speeches'): PersistedLiveSession => ({
  activePlayers: Array.from({ length: 10 }, (_, index) => createEmptyActivePlayer(index + 1)),
  nominations: [],
  nominationsMap: {},
  phase,
  roundNumber: 2,
  dayStarterSlot: 2,
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
  historyStack: [],
  savedAt: '12:34',
});

describe('Live Game session storage', () => {
  it('round-trips a restorable interrupted session under the existing storage key', () => {
    const storage = makeStorage();
    const session = makeSnapshot();

    writeLiveSession(session, storage);

    expect(storage.values.has(LIVE_GAME_SESSION_STORAGE_KEY)).toBe(true);
    expect(readRestorableLiveSession(storage)).toEqual(session);
  });

  it('keeps setup sessions and incomplete rosters non-restorable', () => {
    const storage = makeStorage();

    writeLiveSession(makeSnapshot('setup'), storage);
    expect(readRestorableLiveSession(storage)).toBeNull();

    const incomplete = makeSnapshot();
    incomplete.activePlayers = incomplete.activePlayers.slice(0, 9);
    writeLiveSession(incomplete, storage);
    expect(readRestorableLiveSession(storage)).toBeNull();
  });

  it('fails closed for malformed JSON', () => {
    const storage = makeStorage();
    storage.setItem(LIVE_GAME_SESSION_STORAGE_KEY, '{not-json');

    expect(readRestorableLiveSession(storage)).toBeNull();
  });

  it('keeps persistence best-effort when browser storage rejects a write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => undefined,
    };

    expect(() => writeLiveSession(makeSnapshot(), storage)).not.toThrow();
  });

  it('removes the interrupted session through the adapter', () => {
    const storage = makeStorage();
    writeLiveSession(makeSnapshot(), storage);

    removeLiveSession(storage);

    expect(storage.getItem(LIVE_GAME_SESSION_STORAGE_KEY)).toBeNull();
  });
});
