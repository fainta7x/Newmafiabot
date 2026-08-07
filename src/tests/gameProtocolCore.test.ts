import { describe, it, expect } from 'vitest';
import {
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  isBestMoveAvailable,
  validateBestMoveSeats,
  setBestMove,
  clearBestMove,
  isValidSeat,
} from '../lib/gameProtocolCore';

describe('Game Protocol Core shared rules', () => {
  it('initializes empty protocol markers correctly', () => {
    const markers = createEmptyLiveProtocolMarkers();
    expect(markers.firstKilledSlot).toBeNull();
    expect(markers.zeroRoundVotedSlot).toBeNull();
    expect(markers.bestMoveSource).toBeNull();
    expect(markers.bestMoveSourceSlot).toBeNull();
    expect(markers.bestMoveSeats).toEqual([]);
  });

  it('registers first killed exactly once', () => {
    let markers = createEmptyLiveProtocolMarkers();
    markers = registerFirstKilled(markers, 3);
    expect(markers.firstKilledSlot).toBe(3);
    markers = registerFirstKilled(markers, 5);
    expect(markers.firstKilledSlot).toBe(3);
  });

  it('registers zero-round voted player exactly once', () => {
    let markers = createEmptyLiveProtocolMarkers();
    markers = registerZeroRoundVoted(markers, 7);
    expect(markers.zeroRoundVotedSlot).toBe(7);
    markers = registerZeroRoundVoted(markers, 9);
    expect(markers.zeroRoundVotedSlot).toBe(7);
  });

  it('rejects invalid protocol marker slots without mutating state', () => {
    const initial = createEmptyLiveProtocolMarkers();
    for (const slot of [0, 11, -1, 2.5, Number.NaN]) {
      expect(isValidSeat(slot)).toBe(false);
      expect(registerFirstKilled(initial, slot)).toBe(initial);
      expect(registerZeroRoundVoted(initial, slot)).toBe(initial);
    }
    expect(isValidSeat(1)).toBe(true);
    expect(isValidSeat(10)).toBe(true);
  });

  it('checks Best Move availability correctly', () => {
    let markers = createEmptyLiveProtocolMarkers();
    expect(isBestMoveAvailable(markers, 'first_killed')).toBe(false);
    expect(isBestMoveAvailable(markers, 'zero_round_voted')).toBe(false);
    markers = registerFirstKilled(markers, 4);
    expect(isBestMoveAvailable(markers, 'first_killed')).toBe(true);
    markers = registerZeroRoundVoted(markers, 8);
    expect(isBestMoveAvailable(markers, 'zero_round_voted')).toBe(true);
  });

  it('validates Best Move seats correctly', () => {
    expect(validateBestMoveSeats([])).toBe(true);
    expect(validateBestMoveSeats([1])).toBe(true);
    expect(validateBestMoveSeats([1, 2])).toBe(true);
    expect(validateBestMoveSeats([1, 2, 3])).toBe(true);
    expect(validateBestMoveSeats([1, 2, 3, 4])).toBe(false);
    expect(validateBestMoveSeats([1, 1])).toBe(false);
    expect(validateBestMoveSeats([2, 5, 2])).toBe(false);
    expect(validateBestMoveSeats([0])).toBe(false);
    expect(validateBestMoveSeats([11])).toBe(false);
    expect(validateBestMoveSeats([2.5])).toBe(false);
  });

  it('sets and clears Best Move safely', () => {
    let markers = createEmptyLiveProtocolMarkers();
    let tried = setBestMove(markers, 'first_killed', [1, 2, 3]);
    expect(tried.bestMoveSource).toBeNull();
    markers = registerFirstKilled(markers, 4);
    markers = setBestMove(markers, 'first_killed', [1, 2, 3]);
    expect(markers.bestMoveSource).toBe('first_killed');
    expect(markers.bestMoveSourceSlot).toBe(4);
    expect(markers.bestMoveSeats).toEqual([1, 2, 3]);
    markers = clearBestMove(markers, 4);
    expect(markers.firstKilledSlot).toBeNull();
    expect(markers.bestMoveSource).toBeNull();
    expect(markers.bestMoveSeats).toEqual([]);
  });

  it('rejects invalid Best Move sets', () => {
    let markers = registerFirstKilled(createEmptyLiveProtocolMarkers(), 4);
    expect(setBestMove(markers, 'first_killed', [1, 11]).bestMoveSeats).toEqual([]);
    expect(setBestMove(markers, 'first_killed', [2, 2]).bestMoveSeats).toEqual([]);
  });

  it('Best Move does not mutate registered exits', () => {
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
