export type BestMoveSource = 'first_killed' | 'zero_round_voted';

export interface LiveProtocolMarkers {
  firstKilledSlot: number | null;
  zeroRoundVotedSlot: number | null;
  bestMoveSource: BestMoveSource | null;
  bestMoveSourceSlot: number | null;
  bestMoveSeats: number[];
  /**
   * Every confirmed ЛХ by its source. The single `bestMove*` fields above only describe the latest one (kept for
   * sessions saved before this existed); a game can have two — the zero-round one and the first-killed one.
   */
  bestMoves?: Partial<Record<BestMoveSource, { slot: number; seats: number[] }>>;
}

export interface ConfirmedBestMove { source: BestMoveSource; slot: number; seats: number[]; }

/** All confirmed ЛХ of the game, the zero-round one first; reads a legacy single-move marker too. */
export function confirmedBestMoves(state: Partial<LiveProtocolMarkers> | null | undefined): ConfirmedBestMove[] {
  if (!state) return [];
  const moves: ConfirmedBestMove[] = [];
  for (const source of ['zero_round_voted', 'first_killed'] as BestMoveSource[]) {
    const move = state.bestMoves?.[source];
    if (move && Number(move.slot) > 0 && Array.isArray(move.seats) && move.seats.length) {
      moves.push({ source, slot: Number(move.slot), seats: move.seats.slice(0, 3).map(Number) });
    }
  }
  if (!moves.length && state.bestMoveSource && Number(state.bestMoveSourceSlot) > 0 && Array.isArray(state.bestMoveSeats) && state.bestMoveSeats.length) {
    moves.push({ source: state.bestMoveSource, slot: Number(state.bestMoveSourceSlot), seats: state.bestMoveSeats.slice(0, 3).map(Number) });
  }
  return moves;
}

/** The seats already confirmed for a source and a player, so the best-move sheet reopens with them. */
export function savedBestMoveSeats(state: LiveProtocolMarkers, source: BestMoveSource, slot: number): number[] {
  const move = confirmedBestMoves(state).find((item) => item.source === source && item.slot === slot);
  return move ? [...move.seats] : [];
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
    bestMoves: { ...(state.bestMoves || {}), [source]: { slot: sourceSlot, seats: [...seats] } },
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
  if (next.bestMoves) {
    const kept = Object.fromEntries(Object.entries(next.bestMoves).filter(([, move]) => move && move.slot !== slotNum));
    if (Object.keys(kept).length) next.bestMoves = kept;
    else delete next.bestMoves;
  }
  return next;
}
