export type PendingActionType = 
  | 'removal_4th_foul' 
  | 'minor_tech_causing_removal' 
  | 'major_tech_causing_removal' 
  | 'direct_removal' 
  | 'ppk';

export interface PlayerDiscipline {
  id: string;
  regularFouls: number;
  minorTechFouls: number;
  majorTechFouls: number;
  isRemoved: boolean;
  removedReason: '4th_foul' | '2nd_tech' | 'direct' | null;
  gamePenalty: number;
  pendingAction: PendingActionType | null;
  ppkCaused: boolean;
}

export interface GameDiscipline {
  players: Record<string, PlayerDiscipline>;
  isNextVotingCancelled: boolean;
  isPpk: boolean;
  ppkWinnerTeam: 'red' | 'black' | null;
}

export interface PlayerPenaltyResult {
  disciplinaryPenalty: number;
  gamePenalty: number;
  totalPenalty: number;
  nominationPenalty: number;
  nextSpeechDuration: number | null;
}

export const createInitialPlayerDiscipline = (id: string): PlayerDiscipline => ({
  id,
  regularFouls: 0,
  minorTechFouls: 0,
  majorTechFouls: 0,
  isRemoved: false,
  removedReason: null,
  gamePenalty: 0,
  pendingAction: null,
  ppkCaused: false,
});

export const createInitialGameDiscipline = (playerIds: string[]): GameDiscipline => {
  const players: Record<string, PlayerDiscipline> = {};
  for (const id of playerIds) {
    players[id] = createInitialPlayerDiscipline(id);
  }
  return {
    players,
    isNextVotingCancelled: false,
    isPpk: false,
    ppkWinnerTeam: null,
  };
};

export const addRegularFoul = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;

  if (player.regularFouls === 3) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'removal_4th_foul' } } };
  }

  return { ...state, players: { ...state.players, [playerId]: { ...player, regularFouls: player.regularFouls + 1 } } };
};

export const addMinorTechFoul = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;

  const totalTechFoulsBefore = player.minorTechFouls + player.majorTechFouls;
  
  if (totalTechFoulsBefore >= 1) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'minor_tech_causing_removal' } } };
  }

  return { ...state, players: { ...state.players, [playerId]: { ...player, minorTechFouls: player.minorTechFouls + 1 } } };
};

export const addMajorTechFoul = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;

  const totalTechFoulsBefore = player.minorTechFouls + player.majorTechFouls;
  
  if (totalTechFoulsBefore >= 1) {
    return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'major_tech_causing_removal' } } };
  }

  return { ...state, players: { ...state.players, [playerId]: { ...player, majorTechFouls: player.majorTechFouls + 1 } } };
};

export const requestDirectRemoval = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || player.isRemoved || player.pendingAction) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'direct_removal' } } };
};

export const requestPpk = (state: GameDiscipline, playerId: string): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || player.pendingAction) return state;
  return { ...state, players: { ...state.players, [playerId]: { ...player, pendingAction: 'ppk' } } };
};

export const confirmAction = (state: GameDiscipline, playerId: string, ppkWinnerTeam?: 'red' | 'black'): GameDiscipline => {
  const player = state.players[playerId];
  if (!player || !player.pendingAction) return state;

  const updatedPlayer = { ...player, pendingAction: null as PendingActionType | null };
  const newState = { ...state, players: { ...state.players, [playerId]: updatedPlayer } };

  if (player.pendingAction === 'removal_4th_foul') {
    updatedPlayer.regularFouls = 4;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '4th_foul';
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'minor_tech_causing_removal') {
    updatedPlayer.minorTechFouls += 1;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '2nd_tech';
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'major_tech_causing_removal') {
    updatedPlayer.majorTechFouls += 1;
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = '2nd_tech';
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'direct_removal') {
    updatedPlayer.isRemoved = true;
    updatedPlayer.removedReason = 'direct';
    newState.isNextVotingCancelled = true;
  } else if (player.pendingAction === 'ppk') {
    updatedPlayer.ppkCaused = true;
    newState.isPpk = true;
    if (ppkWinnerTeam) {
      newState.ppkWinnerTeam = ppkWinnerTeam;
    }
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
  if (penalty < 0) return state;

  return { ...state, players: { ...state.players, [playerId]: { ...player, gamePenalty: penalty } } };
};

export const resetNextVotingCancelled = (state: GameDiscipline): GameDiscipline => {
  if (!state.isNextVotingCancelled) return state;
  return { ...state, isNextVotingCancelled: false };
};

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
  
  const totalPenalty = discPenalty + player.gamePenalty;
  
  return {
    disciplinaryPenalty: Number(discPenalty.toFixed(1)),
    gamePenalty: player.gamePenalty,
    totalPenalty: Number(totalPenalty.toFixed(1)),
    nominationPenalty: player.gamePenalty,
    nextSpeechDuration: (player.regularFouls === 3 && !player.isRemoved) ? 30 : null
  };
};
