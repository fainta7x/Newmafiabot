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

export function registerFirstKilled(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {
  if (state.firstKilledSlot !== null) {
    return state; // repeated registration does not overwrite the original
  }
  return {
    ...state,
    firstKilledSlot: slot,
  };
}

export function registerZeroRoundVoted(state: LiveProtocolMarkers, slot: number): LiveProtocolMarkers {
  if (state.zeroRoundVotedSlot !== null) {
    return state; // repeated registration does not overwrite the original
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
  if (source === 'zero_round_voted') {
    return state.zeroRoundVotedSlot !== null;
  }
  return false;
}

export function validateBestMoveSeats(seats: number[]): boolean {
  if (seats.length > 3) return false;
  const unique = new Set(seats);
  if (unique.size !== seats.length) return false;
  for (const seat of seats) {
    if (seat < 1 || seat > 10) return false;
  }
  return true;
}

export function setBestMove(
  state: LiveProtocolMarkers,
  source: BestMoveSource,
  seats: number[]
): LiveProtocolMarkers {
  if (!validateBestMoveSeats(seats)) {
    return state; // reject invalid seats
  }

  const sourceSlot = source === 'first_killed' ? state.firstKilledSlot : state.zeroRoundVotedSlot;
  if (sourceSlot === null) {
    return state; // source not available for Best Move
  }

  return {
    ...state,
    bestMoveSource: source,
    bestMoveSourceSlot: sourceSlot,
    bestMoveSeats: [...seats],
  };
}

export function clearBestMove(state: LiveProtocolMarkers, slotNum: number): LiveProtocolMarkers {
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
