import { loadPlayerTournamentAwards } from './tournamentAwardsService.ts';
import { winRatePercent } from '../../shared/stats.ts';
import type { EveningFormat } from '../../lib/eveningFormat.ts';
import { gameTeamOfRole, normalizeGameRole } from '../../shared/gameRoles.ts';
import { listPlayerGameResults } from './gameService.ts';

export type PlayerGameSource = 'club' | 'tournament';
export type PlayerGameTeam = 'red' | 'black' | null;

export interface PlayerGameHistoryItem {
  id: string;
  source: PlayerGameSource;
  evening_id: string | null;
  tournament_id: string | null;
  /** Format of the evening the game was played on; every tournament game is «TOURNAMENT». */
  evening_format: EveningFormat;
  title: string;
  date: string | null;
  game_number: number;
  global_game_number: number | null;
  table_name: string | null;
  judge_name: string | null;
  seat_number: number;
  role: string | null;
  team: PlayerGameTeam;
  winner_team: PlayerGameTeam;
  status: string;
  won: boolean | null;
  exit_type: string | null;
  regular_fouls: number;
  minor_technical_fouls: number;
  major_technical_fouls: number;
  judge_bonus: number;
  protocol_bonus: number;
  ci_points: number;
  penalty_points: number;
  disciplinary_penalty_points: number;
  best_move: boolean;
  best_move_source: 'first_killed' | 'zero_round_voted' | null;
  first_killed: boolean;
  zero_round_voted: boolean;
}

export interface PlayerGameProfileStats {
  totalGames: number;
  completedGames: number;
  wins: number;
  losses: number;
  winRate: number;
  clubGames: number;
  tournamentGames: number;
  redGames: number;
  blackGames: number;
  bestMoves: number;
  firstKilled: number;
  zeroRoundVoted: number;
  lastGameAt: string | null;
  roleCounts: {
    citizen: number;
    sheriff: number;
    mafia: number;
    don: number;
    unknown: number;
  };
}


const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

// Owner, 2026-10-23: the statistics count completed games only; a draft or a planned game is in the history, not in the numbers.
export const buildPlayerProfileStats = (history: PlayerGameHistoryItem[]): PlayerGameProfileStats => {
  const games = history.filter((game) => game.status === 'completed');
  const completed = games.filter((game) => game.winner_team !== null);
  const wins = completed.filter((game) => game.won === true).length;
  const roleCounts = { citizen: 0, sheriff: 0, mafia: 0, don: 0, unknown: 0 };

  for (const game of games) {
    const role = normalizeGameRole(game.role);
    if (role) roleCounts[role] += 1;
    else roleCounts.unknown += 1;
  }

  const dated = games
    .map((game) => game.date)
    .filter((date): date is string => Boolean(date && !Number.isNaN(new Date(date).getTime())))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return {
    totalGames: games.length,
    completedGames: completed.length,
    wins,
    losses: Math.max(0, completed.length - wins),
    winRate: winRatePercent(wins, completed.length),
    clubGames: games.filter((game) => game.source === 'club').length,
    tournamentGames: games.filter((game) => game.source === 'tournament').length,
    redGames: games.filter((game) => game.team === 'red').length,
    blackGames: games.filter((game) => game.team === 'black').length,
    bestMoves: games.filter((game) => game.best_move).length,
    firstKilled: games.filter((game) => game.first_killed).length,
    zeroRoundVoted: games.filter((game) => game.zero_round_voted).length,
    lastGameAt: dated[0] || null,
    roleCounts,
  };
};

/**
 * A player's games and results through the one «Игра» layer (docs/ARCHITECTURE_REVIEW_2026-11-03.md): every format, one
 * result shape. «completed» is the layer's rule (a tournament game with its protocol completed). Archived games and games
 * of a cancelled evening stay out of the history, as before.
 */
export const loadPlayerGameProfile = async (db: any, playerId: string) => {
  const clubGames: PlayerGameHistoryItem[] = [];
  const tournamentGames: PlayerGameHistoryItem[] = [];
  for (const { game, result } of await listPlayerGameResults(db, String(playerId))) {
    if (game.status === 'archived' || (game.storage === 'club' && game.status === 'cancelled')) continue;
    const role = normalizeGameRole(result.role);
    const team = gameTeamOfRole(role);
    const winner = game.winner;
    const completed = game.status === 'completed';
    const status = completed ? 'completed' : game.storage === 'club' ? 'draft' : game.status === 'running' ? 'active' : game.status;
    const item: PlayerGameHistoryItem = {
      id: game.key,
      source: game.storage,
      evening_id: game.eventKind === 'evening' ? game.eventId : null,
      tournament_id: game.eventKind === 'tournament' ? game.eventId : null,
      evening_format: game.format,
      title: game.eventTitle || (game.storage === 'club' ? 'Клубный вечер' : 'Турнир'),
      date: game.date,
      game_number: numberOrZero(game.number),
      global_game_number: game.storage === 'club' && game.number != null ? numberOrZero(game.number) : null,
      table_name: game.tableName,
      judge_name: game.judgeName,
      seat_number: result.seat,
      role,
      team,
      winner_team: winner,
      status,
      won: completed && team && winner ? team === winner : null,
      exit_type: result.exitType,
      regular_fouls: result.regularFouls,
      minor_technical_fouls: result.minorTechnicalFouls,
      major_technical_fouls: result.majorTechnicalFouls,
      judge_bonus: result.judgeBonus,
      protocol_bonus: result.protocolBonus,
      ci_points: result.ciPoints,
      penalty_points: result.penaltyPoints,
      disciplinary_penalty_points: result.disciplinaryPenaltyPoints,
      best_move: result.bestMove,
      best_move_source: result.bestMoveSource,
      first_killed: result.firstKilled,
      zero_round_voted: result.zeroRoundVoted,
    } as PlayerGameHistoryItem;
    (game.storage === 'club' ? clubGames : tournamentGames).push(item);
  }

  const allGames = [...clubGames, ...tournamentGames].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });

  const awardProfile = await loadPlayerTournamentAwards(db, playerId);

  return {
    clubGames,
    tournamentGames,
    gameStats: buildPlayerProfileStats(allGames),
    tournamentAwards: awardProfile.awards,
    awardStats: awardProfile.stats,
    awardTournaments: awardProfile.tournaments,
  };
};
