import type { Player } from '../../types.js';

export const CLUB_EVENING_ENGINE_JUDGE_NOTE = '__club_evening_engine_judge__';
export const TOURNAMENT_ENGINE_JUDGE_NOTE = '__tournament_engine_judge__';

export type LiveGameSetupMode = 'club' | 'tournament' | 'general';

export const getLiveGameSetupMode = (players: Player[]): LiveGameSetupMode => {
  if (players.some((player) => player.notes === CLUB_EVENING_ENGINE_JUDGE_NOTE)) return 'club';
  if (players.some((player) => player.notes === TOURNAMENT_ENGINE_JUDGE_NOTE)) return 'tournament';
  return 'general';
};
