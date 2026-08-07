import { loadPlayerTournamentAwards } from './tournamentAwardsService.ts';

export type PlayerGameSource = 'club' | 'tournament';
export type PlayerGameTeam = 'red' | 'black' | null;

export interface PlayerGameHistoryItem {
  id: string;
  source: PlayerGameSource;
  evening_id: string | null;
  tournament_id: string | null;
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

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeRole = (role: unknown): 'citizen' | 'sheriff' | 'mafia' | 'don' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (!value) return null;
  if (value === 'citizen' || value === 'мирный' || value === 'мирный житель' || value === 'красный') return 'citizen';
  if (value === 'sheriff' || value === 'шериф') return 'sheriff';
  if (value === 'mafia' || value === 'мафия' || value === 'маф') return 'mafia';
  if (value === 'don' || value === 'дон') return 'don';
  return null;
};

const teamFromRole = (role: unknown): PlayerGameTeam => {
  const normalized = normalizeRole(role);
  if (normalized === 'mafia' || normalized === 'don') return 'black';
  if (normalized === 'citizen' || normalized === 'sheriff') return 'red';
  return null;
};

const normalizeWinner = (winner: unknown): PlayerGameTeam => {
  const value = String(winner || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (value === 'red' || value === 'красные' || value === 'красная' || value === 'город') return 'red';
  if (value === 'black' || value === 'черные' || value === 'черная' || value === 'мафия') return 'black';
  return null;
};

const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const buildPlayerProfileStats = (games: PlayerGameHistoryItem[]): PlayerGameProfileStats => {
  const completed = games.filter((game) => game.status === 'completed' && game.winner_team !== null);
  const wins = completed.filter((game) => game.won === true).length;
  const roleCounts = { citizen: 0, sheriff: 0, mafia: 0, don: 0, unknown: 0 };

  for (const game of games) {
    const role = normalizeRole(game.role);
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
    winRate: completed.length ? Math.round((wins / completed.length) * 100) : 0,
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

export const loadPlayerGameProfile = async (db: any, playerId: string) => {
  const clubRows = await db.all(`
    SELECT g.id, g.global_game_number, g.game_date, g.winner_team, g.judge_name, g.protocol_text,
           g.evening_id, e.title AS evening_title, e.starts_at AS evening_date,
           et.name AS table_name
      FROM games g
 LEFT JOIN game_evenings e ON e.id = g.evening_id
 LEFT JOIN evening_tables et ON et.id = g.evening_table_id
     WHERE g.evening_id IS NOT NULL
       AND g.archived_at IS NULL
       AND g.protocol_text IS NOT NULL
  ORDER BY COALESCE(e.starts_at, g.game_date) DESC, g.global_game_number DESC, g.id DESC
  `);

  const clubGames: PlayerGameHistoryItem[] = [];
  for (const row of clubRows) {
    const payload = safeJsonParse<any>(row.protocol_text, null);
    if (!payload || payload.kind !== 'club_evening_protocol' || !Array.isArray(payload.player_results)) continue;
    const result = payload.player_results.find((item: any) => String(item.player_id || '') === String(playerId));
    if (!result) continue;

    const protocol = payload.protocol || {};
    const role = normalizeRole(result.role);
    const team = teamFromRole(role);
    const winner = normalizeWinner(protocol.winner_team || row.winner_team);
    const status = protocol.status === 'completed' ? 'completed' : 'draft';
    const bestMove = Array.isArray(protocol.best_moves)
      ? protocol.best_moves.find((item: any) => String(item.participant_id || '') === String(result.participant_id || ''))
      : null;

    clubGames.push({
      id: `club:${row.id}`,
      source: 'club',
      evening_id: row.evening_id ? String(row.evening_id) : null,
      tournament_id: null,
      title: row.evening_title || 'Клубный вечер',
      date: row.evening_date || row.game_date || null,
      game_number: numberOrZero(row.global_game_number),
      global_game_number: row.global_game_number == null ? null : numberOrZero(row.global_game_number),
      table_name: row.table_name || null,
      judge_name: row.judge_name || null,
      seat_number: numberOrZero(result.seat_number),
      role,
      team,
      winner_team: winner,
      status,
      won: status === 'completed' && team && winner ? team === winner : null,
      exit_type: result.exit_type || null,
      regular_fouls: numberOrZero(result.regular_fouls),
      minor_technical_fouls: numberOrZero(result.minor_technical_fouls),
      major_technical_fouls: numberOrZero(result.major_technical_fouls),
      judge_bonus: numberOrZero(result.judge_bonus),
      protocol_bonus: numberOrZero(result.protocol_bonus),
      ci_points: numberOrZero(result.ci_points),
      penalty_points: numberOrZero(result.penalty_points),
      disciplinary_penalty_points: numberOrZero(result.disciplinary_penalty_points),
      best_move: Boolean(bestMove),
      best_move_source: bestMove?.source === 'first_killed' || bestMove?.source === 'zero_round_voted' ? bestMove.source : null,
      first_killed: String(protocol.first_killed_participant_id || '') === String(result.participant_id || ''),
      zero_round_voted: String(protocol.zero_round_voted_participant_id || '') === String(result.participant_id || ''),
    });
  }

  const tournamentRows = await db.all(`
    SELECT t.id AS tournament_id, t.title AS tournament_title, t.date AS tournament_date,
           tg.id AS game_id, tg.game_number, tg.status AS game_status, tg.winner_team,
           tg.judge_name, tg.completed_at,
           tp.id AS participant_id,
           tgs.seat_number, tgs.role,
           tgpr.exit_type, tgpr.regular_fouls, tgpr.minor_technical_fouls,
           tgpr.major_technical_fouls, tgpr.judge_bonus, tgpr.protocol_bonus,
           tgpr.ci_points, tgpr.penalty_points, tgpr.disciplinary_penalty_points,
           tgp.first_killed_participant_id, tgp.zero_round_voted_participant_id,
           tgbm.source AS best_move_source
      FROM tournament_participants tp
      JOIN tournaments t ON t.id = tp.tournament_id
      JOIN tournament_game_seats tgs ON tgs.participant_id = tp.id
      JOIN tournament_games tg ON tg.id = tgs.game_id
 LEFT JOIN tournament_game_player_results tgpr ON tgpr.game_id = tg.id AND tgpr.participant_id = tp.id
 LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
 LEFT JOIN tournament_game_best_moves tgbm ON tgbm.game_id = tg.id AND tgbm.participant_id = tp.id
     WHERE tp.player_id = ?
  ORDER BY t.date DESC, tg.game_number DESC
  `, [playerId]);

  const tournamentGames: PlayerGameHistoryItem[] = tournamentRows.map((row: any) => {
    const role = normalizeRole(row.role);
    const team = teamFromRole(role);
    const winner = normalizeWinner(row.winner_team);
    const status = row.game_status === 'completed' ? 'completed' : row.game_status || 'planned';
    const bestMoveSource = row.best_move_source === 'first_killed' || row.best_move_source === 'zero_round_voted'
      ? row.best_move_source
      : null;

    return {
      id: `tournament:${row.game_id}`,
      source: 'tournament' as const,
      evening_id: null,
      tournament_id: String(row.tournament_id),
      title: row.tournament_title || 'Турнир',
      date: row.completed_at || row.tournament_date || null,
      game_number: numberOrZero(row.game_number),
      global_game_number: null,
      table_name: null,
      judge_name: row.judge_name || null,
      seat_number: numberOrZero(row.seat_number),
      role,
      team,
      winner_team: winner,
      status,
      won: status === 'completed' && team && winner ? team === winner : null,
      exit_type: row.exit_type || null,
      regular_fouls: numberOrZero(row.regular_fouls),
      minor_technical_fouls: numberOrZero(row.minor_technical_fouls),
      major_technical_fouls: numberOrZero(row.major_technical_fouls),
      judge_bonus: numberOrZero(row.judge_bonus),
      protocol_bonus: numberOrZero(row.protocol_bonus),
      ci_points: numberOrZero(row.ci_points),
      penalty_points: numberOrZero(row.penalty_points),
      disciplinary_penalty_points: numberOrZero(row.disciplinary_penalty_points),
      best_move: Boolean(bestMoveSource),
      best_move_source: bestMoveSource,
      first_killed: String(row.first_killed_participant_id || '') === String(row.participant_id || ''),
      zero_round_voted: String(row.zero_round_voted_participant_id || '') === String(row.participant_id || ''),
    };
  });

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
