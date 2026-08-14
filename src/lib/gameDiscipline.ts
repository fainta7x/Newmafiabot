export type PendingActionType =
  | 'removal_4th_foul'
  | 'minor_tech_causing_removal'
  | 'major_tech_causing_removal'
  | 'direct_removal'
  | 'ppk';

export interface PlayerDiscipline {
  id: string;
  team: 'red' | 'black';
  regularFouls: number;
  minorTechFouls: number;
  majorTechFouls: number;
  isRemoved: boolean;
  removedReason: '4th_foul' | '2nd_tech' | 'direct' | null;
  /** The second tech type is retained so a manual restore can reverse the exact triggering tech. */
  secondTechFoulType?: 'minor' | 'major' | null;
  gamePenalty: number;
  pendingAction: PendingActionType | null;
  ppkCaused: boolean;
  has30SecPenalty: boolean;
}

export interface GameDiscipline {
  players: Record<string, PlayerDiscipline>;
  isNextVotingCancelled: boolean;
  /**
   * Players whose confirmed removal still has an unconsumed cancellation of the
   * nearest voting. Optional for backwards compatibility with saved sessions.
   */
  pendingVotingCancellationPlayerIds?: string[];
  isPpk: boolean;
  ppkWinnerTeam: 'red' | 'black' | null;
  ppkCulpritId: string | null;
  requiresProtocolReview: boolean;
}

export interface PlayerPenaltyResult {
  disciplinaryPenalty: number;
  gamePenalty: number;
  totalPenalty: number;
  nominationPenalty: number;
  has30SecPenalty: boolean;
}

export const createInitialPlayerDiscipline = (id: string, team: 'red' | 'black'): PlayerDiscipline => ({
  id,
  team,
  regularFouls: 0,
  minorTechFouls: 0,
  majorTechFouls: 0,
  isRemoved: false,
  removedReason: null,
  secondTechFoulType: null,
  gamePenalty: 0,
  pendingAction: null,
  ppkCaused: false,
  has30SecPenalty: false,
});

export const createInitialGameDiscipline = (playersData: { id: string, team: 'red' | 'black' }[]): GameDiscipline => {
  const players: Record<string, PlayerDiscipline> = {};
  for (const data of playersData) {
    players[data.id] = createInitialPlayerDiscipline(data.id, data.team);
  }
  return {
    players,
    isNextVotingCancelled: false,
    pendingVotingCancellationPlayerIds: [],
    isPpk: false,
    ppkWinnerTeam: null,
    ppkCulpritId: null,
    requiresProtocolReview: false,
  };
};

export const consumeNextSpeech = (state: GameDiscipline, playerId: string): { duration: number | null, newState: GameDiscipline } => {
  const player = state.players[playerId];
  if (!player || !player.has30SecPenalty) {
    return { duration: null, newState: state };
  }

  return {
    duration: 30,
    newState: {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          has30SecPenalty: false,
        }
      }
    }
  };
};

export const addRegularFoul = (state: GameDiscipline, playerId: string): GameDiscipline => {
  if (state.isPpk) return state;
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;

  if (player.regularFouls === 2) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, regularFouls: 3, has30SecPenalty: true } } };
  }
  if (player.regularFouls === 3) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'removal_4th_foul' } } };
  }

  return { ...state, players: { ...state.players, [playerId]: { ...player, regularFouls: player.regularFouls + 1 } } };
};

export const addMinorTechFoul = (state: GameDiscipline, playerId: string): GameDiscipline => {
  if (state.isPpk) return state;
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;

  const totalTechFoulsBefore = player.minorTechFouls + player.majorTechFouls;

  if (totalTechFoulsBefore >= 1) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'minor_tech_causing_removal' } } };
  }

  return { ...state, players: { ...state.players, [playerId]: { ...player, minorTechFouls: player.minorTechFouls + 1 } } };
};

export const addMajorTechFoul = (state: GameDiscipline, playerId: string): GameDiscipline => {
  if (state.isPpk) return state;
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;

  const totalTechFoulsBefore = player.minorTechFouls + player.majorTechFouls;

  if (totalTechFoulsBefore >= 1) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'major_tech_causing_removal' } } };
  }

  return { ...state, players: { ...state.players, [playerId]: { ...player, majorTechFouls: player.majorTechFouls + 1 } } };
};

export const requestDirectRemoval = (state: GameDiscipline, playerId: string): GameDiscipline => {
  if (state.isPpk) return state;
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'direct_removal' } } };
};

export const requestPpk = (state: GameDiscipline, playerId: string): GameDiscipline => {
  if (state.isPpk) return state;
  const player = state.players[playerId];
  if (!player || player.pendingAction) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'ppk' } } };
};

const registerVotingCancellation = (state: GameDiscipline, playerId: string) => {
  const pending = state.pendingVotingCancellationPlayerIds || [];
  state.pendingVotingCancellationPlayerIds = pending.includes(playerId) ? pending : [...pending, playerId];
  state.isNextVotingCancelled = true;
};

export const confirmAction = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || !player.pendingAction) return state;

  const updatedPlayer = { ...player, pendingAction: null as PendingActionType | null };
  const newState = {
    ...state,
    pendingVotingCancellationPlayerIds: [...(state.pendingVotingCancellationPlayerIds || [])],
    players: { ...state.players, [playerId]: updatedPlayer },
  };

  if (player.pendingAction === 'removal_4th_foul') {
    updatedPlayer.regularFouls = 4;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '4th_foul';
    updatedPlayer.secondTechFoulType = null;
    updatedPlayer.has30SecPenalty = false;
    registerVotingCancellation(newState, playerId);
  } else if (player.pendingAction === 'minor_tech_causing_removal') {
    updatedPlayer.minorTechFouls += 1;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '2nd_tech';
    updatedPlayer.secondTechFoulType = 'minor';
    updatedPlayer.has30SecPenalty = false;
    registerVotingCancellation(newState, playerId);
  } else if (player.pendingAction === 'major_tech_causing_removal') {
    updatedPlayer.majorTechFouls += 1;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '2nd_tech';
    updatedPlayer.secondTechFoulType = 'major';
    updatedPlayer.has30SecPenalty = false;
    registerVotingCancellation(newState, playerId);
  } else if (player.pendingAction === 'direct_removal') {
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = 'direct';
    updatedPlayer.secondTechFoulType = null;
    updatedPlayer.has30SecPenalty = false;
    registerVotingCancellation(newState, playerId);
  } else if (player.pendingAction === 'ppk') {
    updatedPlayer.ppkCaused = true;
    newState.isPpk = true;
    newState.ppkWinnerTeam = player.team === 'red' ? 'black' : 'red';
    newState.ppkCulpritId = playerId;
    newState.requiresProtocolReview = true;
  }

  return newState;
};

export const cancelAction = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || !player.pendingAction) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        pendingAction: null
      }
    }
  };
};

export const restoreRemovedPlayer = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || !player.isRemoved) return state;

  const trackedSources = state.pendingVotingCancellationPlayerIds;
  let remainingSources: string[];
  if (Array.isArray(trackedSources)) {
    remainingSources = trackedSources.filter((id) => id !== playerId);
  } else if (state.isNextVotingCancelled) {
    // Compatibility with an old saved session that predates tracked sources.
    remainingSources = Object.values(state.players)
      .filter((candidate) => candidate.id !== playerId && candidate.isRemoved)
      .map((candidate) => candidate.id);
  } else {
    remainingSources = [];
  }

  let regularFouls = player.regularFouls;
  let minorTechFouls = player.minorTechFouls;
  let majorTechFouls = player.majorTechFouls;
  if (player.removedReason === '4th_foul') regularFouls = Math.min(3, regularFouls);
  if (player.removedReason === '2nd_tech') {
    const techType = player.secondTechFoulType
      || (majorTechFouls > 0 ? 'major' : 'minor');
    if (techType === 'major') majorTechFouls = Math.max(0, majorTechFouls - 1);
    else minorTechFouls = Math.max(0, minorTechFouls - 1);
  }

  return {
    ...state,
    isNextVotingCancelled: remainingSources.length > 0,
    pendingVotingCancellationPlayerIds: remainingSources,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        regularFouls,
        minorTechFouls,
        majorTechFouls,
        isRemoved: false,
        removedReason: null,
        secondTechFoulType: null,
        pendingAction: null,
        has30SecPenalty: false,
      },
    },
  };
};

export const setGamePenalty = (state: GameDiscipline, playerId: string, penalty: number): GameDiscipline => {
  const player = state.players[playerId];
  if (!player) return state;
  if (!Number.isFinite(penalty) || penalty < 0) return state;

  return { ...state, players: { ...state.players, [playerId]: { ...player, gamePenalty: penalty } } };
};

export const resetNextVotingCancelled = (state: GameDiscipline): GameDiscipline => {
  if (!state.isNextVotingCancelled && !(state.pendingVotingCancellationPlayerIds?.length)) return state;
  return { ...state, isNextVotingCancelled: false, pendingVotingCancellationPlayerIds: [] };
};

export function calculateDisciplinaryPenalty(
  minorTechFouls: number,
  majorTechFouls: number,
  isRemoved: boolean,
  isPpkCulprit: boolean
): number {
  let disc = 0;
  disc += minorTechFouls * 0.3;
  disc += majorTechFouls * 0.6;
  if (isRemoved) {
    disc += 1.0;
  }
  if (isPpkCulprit) {
    disc += 1.0;
  }
  return Number(disc.toFixed(1));
}

export const getPlayerPenaltyStatus = (player: PlayerDiscipline): PlayerPenaltyResult => {
  let discPenalty = 0;

  if (player.regularFouls >= 4 || player.removedReason === '4th_foul') {
    discPenalty += 1.0;
  }

  discPenalty += player.minorTechFouls * 0.3;
  discPenalty += player.majorTechFouls * 0.6;

  if (player.removedReason === '2nd_tech') {
    discPenalty += 1.0;
  }

  if (player.removedReason === 'direct') {
    discPenalty += 1.0;
  }

  if (player.ppkCaused) {
    discPenalty += 1.0;
  }

  discPenalty = Number(discPenalty.toFixed(1));

  const totalPenalty = discPenalty + player.gamePenalty;

  return {
    disciplinaryPenalty: discPenalty,
    gamePenalty: player.gamePenalty,
    totalPenalty: totalPenalty,
    nominationPenalty: player.gamePenalty,
    has30SecPenalty: player.has30SecPenalty
  };
};
