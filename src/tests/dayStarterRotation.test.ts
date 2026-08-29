import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getDaySpeakerQueue,
  getNextDayStarterSlot,
} from '../components/LiveGameEngine/daySpeechModel.js';
import {
  createEmptyActivePlayer,
  normalizeLiveSnapshotForRestore,
} from '../components/LiveGameEngine/engineStateModel.js';

const makePlayers = (dead: number[] = []) => Array.from({ length: 10 }, (_, index) => ({
  ...createEmptyActivePlayer(index + 1),
  alive: !dead.includes(index + 1),
}));

describe('day starter rotation', () => {
  it('advances from the actual previous starter instead of the nominal round number', () => {
    const players = makePlayers([2, 3, 4, 5]);

    // Real table regression: #6 started the previous circle. Even though the
    // old round-number formula would search from #3 and land on #6 again,
    // the next circle must continue clockwise from #6 and start with #7.
    expect(getNextDayStarterSlot(players, 6)).toBe(7);
  });

  it('skips eliminated players and wraps around the table', () => {
    expect(getNextDayStarterSlot(makePlayers([7, 8]), 6)).toBe(9);
    expect(getNextDayStarterSlot(makePlayers([1, 2]), 10)).toBe(3);
  });

  it('orders every speech from the selected actual starter', () => {
    const queue = getDaySpeakerQueue(makePlayers([8, 9]), 7);
    expect(queue.map((player) => player.slot_num)).toEqual([7, 10, 1, 2, 3, 4, 5, 6]);
  });

  it('persists the starter through live snapshots while keeping old saves compatible', () => {
    const base = {
      activePlayers: makePlayers(), nominations: [], nominationsMap: {}, phase: 'day_speeches' as const,
      roundNumber: 3, nightSubPhase: 'intro' as const, postNightStage: 'none' as const,
      protocolMarkers: { firstKilledSlot: null, zeroRoundVotedSlot: null, bestMoveSource: null, bestMoveSourceSlot: null, bestMoveSeats: [] },
      activeBestMoveSource: null, activeBestMoveSlot: null, pendingBestMoveSeats: [], votingRounds: [],
      activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {}, votingStage: 'setup' as const,
      revoteSpeakerIndex: 0, tableLeaveVotesInput: null, currentVotingNomineeIndex: 0,
      activeSpeakerSlot: null, customTimerLabel: null, timeLeft: 60, timerMax: 60, isTimerRunning: false,
      zeroNightSubPhase: null, zeroNightMusicState: 'pending' as const, shotPlayerSlot: null,
      donCheckSlot: null, donCheckResult: null, sheriffCheckSlot: null, sheriffCheckResult: null,
      nightLogs: [], votingFarewellQueue: [], votingFarewellIndex: 0,
      discipline: { players: {}, pendingActionPlayerId: null, isNextVotingCancelled: false, ppkWinnerTeam: null },
    };

    expect(normalizeLiveSnapshotForRestore({ ...base, dayStarterSlot: 6 } as any).dayStarterSlot).toBe(6);
    expect(normalizeLiveSnapshotForRestore(base as any).dayStarterSlot).toBe(3);
  });

  it('wires LiveGameEngine to the stored starter rather than roundNumber', () => {
    const source = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');
    expect(source).toContain('getNextDaySpeaker(activePlayers, dayStarterSlot)');
    expect(source).toContain('getNextDayStarterSlot(activePlayers, dayStarterSlot)');
    expect(source).toContain('dayStarterSlot,');
    expect(source).not.toContain('getNextDaySpeaker(activePlayers, roundNumber)');
  });
});
