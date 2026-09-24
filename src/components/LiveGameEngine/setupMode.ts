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
/**
 * Seats at the table: a club game brings its own roster (10, or 8–9 at a novice table, plus the
 * judge marker); every other mode keeps the classic 10.
 */
export const getLiveGameTableSize = (players: Player[]): number => {
  if (!hasClubEveningEngineMarker(players)) return 10;
  const seated = players.filter((player) => player.notes !== CLUB_EVENING_ENGINE_JUDGE_NOTE).length;
  return seated >= 8 && seated <= 10 ? seated : 10;
};
