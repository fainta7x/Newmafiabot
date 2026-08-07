export type BestMoveSource = 'first_killed' | 'zero_round_voted';

export interface LiveProtocolMarkers {
  firstKilledSlot: number | null;
  zeroRoundVotedSlot: number | null;
  bestMoveSource: BestMoveSource | null;
  bestMoveSourceSlot: number | null;
  bestMoveSeats: number[];
}

export function createEmptyLiveProtocolMarkers(): LiveProtocolMarkers {
  return {
    firstKilledSlot: null,
    zeroRoundVotedSlot: null,
    bestMoveSource: null,
    bestMoveSourceSlot: null,
    bestMoveSeats: [],
  };
}

export function isValidSeat(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= 10;
}

export function registerFirstKilled(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {
  if (!isValidSeat(slot) || state.firstKilledSlot !== null) {
    return state;
  }
  return {
    ...state,
    firstKilledSlot: slot,
  };
}

export function registerZeroRoundVoted(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {
  if (!isValidSeat(slot) || state.zeroRoundVotedSlot !== null) {
    return state;
  }
  return {
    ...state,
    zeroRoundVotedSlot: slot,
  };
}

export function isBestMoveAvailable(state: LiveProtocolMarkers, source: BestMoveSource): boolean {
  if (source === 'first_killed') {
    return state.firstKilledSlot !== null;
  }
  return state.zeroRoundVotedSlot !== null;
}

export function validateBestMoveSeats(seats: number[]): boolean {
  if (seats.length > 3) return false;
  const unique = new Set(seats);
  if (unique.size !== seats.length) return false;
  return seats.every(isValidSeat);
}

export function setBestMove(
  state: LiveProtocolMarkers,
  source: BestMoveSource,
  seats: number[]
): LiveProtocolMarkers {
  if (!validateBestMoveSeats(seats)) {
    return state;
  }

  const sourceSlot = source === 'first_killed' ? state.firstKilledSlot : state.zeroRoundVotedSlot;
  if (sourceSlot === null) {
    return state;
  }

  return {
    ...state,
    bestMoveSource: source,
    bestMoveSourceSlot: sourceSlot,
    bestMoveSeats: [...seats],
  };
}

export function clearBestMove(state: LiveProtocolMarkers, slotNum: number): LiveProtocolMarkers {
  if (!isValidSeat(slotNum)) return state;

  const next = { ...state };
  if (next.firstKilledSlot === slotNum) {
    next.firstKilledSlot = null;
  }
  if (next.zeroRoundVotedSlot === slotNum) {
    next.zeroRoundVotedSlot = null;
  }
  if (next.bestMoveSourceSlot === slotNum) {
    next.bestMoveSource = null;
    next.bestMoveSourceSlot = null;
    next.bestMoveSeats = [];
  }
  return next;
}
