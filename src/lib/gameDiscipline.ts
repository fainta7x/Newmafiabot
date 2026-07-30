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
  gamePenalty: number;
  pendingAction: PendingActionType | null;
  ppkCaused: boolean;
  has30SecPenalty: boolean;
}

export interface GameDiscipline {
  players: Record<string, PlayerDiscipline>;
  isNextVotingCancelled: boolean;
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

export const confirmAction = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || !player.pendingAction) return state;

  const updatedPlayer = { ...player, pendingAction: null as PendingActionType | null };
  const newState = { ...state, players: { ...state.players, [playerId]: updatedPlayer } };

  if (player.pendingAction === 'removal_4th_foul') {
    updatedPlayer.regularFouls = 4;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '4th_foul';
    updatedPlayer.has30SecPenalty = false;
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'minor_tech_causing_removal') {
    updatedPlayer.minorTechFouls += 1;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '2nd_tech';
    updatedPlayer.has30SecPenalty = false;
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'major_tech_causing_removal') {
    updatedPlayer.majorTechFouls += 1;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '2nd_tech';
    updatedPlayer.has30SecPenalty = false;
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'direct_removal') {
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = 'direct';
    updatedPlayer.has30SecPenalty = false;
    newState.isNextVotingCancelled = true;
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

export const setGamePenalty = (state: GameDiscipline, playerId: string, penalty: number): GameDiscipline => {
  const player = state.players[playerId];
  if (!player) return state;
  if (!Number.isFinite(penalty) || penalty < 0) return state;

  return { ...state, players: { ...state.players, [playerId]: { ...player, gamePenalty: penalty } } };
};

export const resetNextVotingCancelled = (state: GameDiscipline): GameDiscipline => {
  if (!state.isNextVotingCancelled) return state;
  return { ...state, isNextVotingCancelled: false };
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
