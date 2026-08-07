import { describe, it, expect } from 'vitest';
import {
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  isBestMoveAvailable,
  validateBestMoveSeats,
  setBestMove,
  clearBestMove
} from '../lib/gameProtocolCore';

describe('Game Protocol Core shared rules', () => {
  it('1. Initializes empty protocol markers correctly', () => {
    const markers = createEmptyLiveProtocolMarkers();
    expect(markers.firstKilledSlot).toBeNull();
    expect(markers.zeroRoundVotedSlot).toBeNull();
    expect(markers.bestMoveSource).toBeNull();
    expect(markers.bestMoveSourceSlot).toBeNull();
    expect(markers.bestMoveSeats).toEqual([]);
  });

  it('2. Registers first night kill exactly once and rejects overwrites', () => {
    let markers = createEmptyLiveProtocolMarkers();
    markers = registerFirstKilled(markers, 3);
    expect(markers.firstKilledSlot).toBe(3);

    // Repeated registration must not change firstKilledSlot
    markers = registerFirstKilled(markers, 5);
    expect(markers.firstKilledSlot).toBe(3);
  });

  it('3. Registers zero-round voted player exactly once and rejects overwrites', () => {
    let markers = createEmptyLiveProtocolMarkers();
    markers = registerZeroRoundVoted(markers, 7);
    expect(markers.zeroRoundVotedSlot).toBe(7);

    // Repeated registration must not change zeroRoundVotedSlot
    markers = registerZeroRoundVoted(markers, 9);
    expect(markers.zeroRoundVotedSlot).toBe(7);
  });

  it('4. Checks Best Move availability correctly', () => {
    let markers = createEmptyLiveProtocolMarkers();
    expect(isBestMoveAvailable(markers, 'first_killed')).toBe(false);
    expect(isBestMoveAvailable(markers, 'zero_round_voted')).toBe(false);

    markers = registerFirstKilled(markers, 4);
    expect(isBestMoveAvailable(markers, 'first_killed')).toBe(true);
    expect(isBestMoveAvailable(markers, 'zero_round_voted')).toBe(false);

    markers = registerZeroRoundVoted(markers, 8);
    expect(isBestMoveAvailable(markers, 'zero_round_voted')).toBe(true);
  });

  it('5. Validates Best Move seats correctly', () => {
    expect(validateBestMoveSeats([])).toBe(true);
    expect(validateBestMoveSeats([1])).toBe(true);
    expect(validateBestMoveSeats([1, 2])).toBe(true);
    expect(validateBestMoveSeats([1, 2, 3])).toBe(true);

    // Reject too many seats
    expect(validateBestMoveSeats([1, 2, 3, 4])).toBe(false);

    // Reject duplicate seats
    expect(validateBestMoveSeats([1, 1])).toBe(false);
    expect(validateBestMoveSeats([2, 5, 2])).toBe(false);

    // Reject seat numbers outside 1..10
    expect(validateBestMoveSeats([0])).toBe(false);
    expect(validateBestMoveSeats([11])).toBe(false);
    expect(validateBestMoveSeats([2, 12, 4])).toBe(false);
  });

  it('6. Sets and clears Best Move safely', () => {
    let markers = createEmptyLiveProtocolMarkers();

    // Cannot set Best Move before source is registered
    let tried = setBestMove(markers, 'first_killed', [1, 2, 3]);
    expect(tried.bestMoveSource).toBeNull();
    expect(tried.bestMoveSeats).toEqual([]);

    markers = registerFirstKilled(markers, 4);
    markers = setBestMove(markers, 'first_killed', [1, 2, 3]);
    expect(markers.bestMoveSource).toBe('first_killed');
    expect(markers.bestMoveSourceSlot).toBe(4);
    expect(markers.bestMoveSeats).toEqual([1, 2, 3]);

    // Clearing Best Move
    markers = clearBestMove(markers, 4);
    expect(markers.bestMoveSource).toBeNull();
    expect(markers.bestMoveSourceSlot).toBeNull();
    expect(markers.bestMoveSeats).toEqual([]);
  });

  it('7. Rejects invalid Best Move sets', () => {
    let markers = createEmptyLiveProtocolMarkers();
    markers = registerFirstKilled(markers, 4);

    // Try invalid seats
    let tried = setBestMove(markers, 'first_killed', [1, 11]);
    expect(tried.bestMoveSeats).toEqual([]);

    // Try duplicate seats
    tried = setBestMove(markers, 'first_killed', [2, 2]);
    expect(tried.bestMoveSeats).toEqual([]);
  });

  it('8. Best Move does not mutate registered exits', () => {
    let markers = createEmptyLiveProtocolMarkers();
    markers = registerFirstKilled(markers, 2);
    markers = registerZeroRoundVoted(markers, 6);

    markers = setBestMove(markers, 'zero_round_voted', [3, 4, 5]);
    expect(markers.firstKilledSlot).toBe(2);
    expect(markers.zeroRoundVotedSlot).toBe(6);
    expect(markers.bestMoveSource).toBe('zero_round_voted');
    expect(markers.bestMoveSourceSlot).toBe(6);
  });
});
