import type { Player } from '../../types.js';

export const CLUB_EVENING_ENGINE_JUDGE_NOTE = '__club_evening_engine_judge__';
export const TOURNAMENT_ENGINE_JUDGE_NOTE = '__tournament_engine_judge__';

export type LiveGameSetupMode = 'club' | 'tournament' | 'general';

export const hasClubEveningEngineMarker = (players: Player[]): boolean =>
  players.some((player) => player.notes === CLUB_EVENING_ENGINE_JUDGE_NOTE);

export const hasTournamentEngineMarker = (players: Player[]): boolean =>
  players.some((player) => player.notes === TOURNAMENT_ENGINE_JUDGE_NOTE);

export const getLiveGameSetupMode = (players: Player[]): LiveGameSetupMode => {
  if (hasClubEveningEngineMarker(players)) return 'club';
  if (hasTournamentEngineMarker(players)) return 'tournament';
  return 'general';
};