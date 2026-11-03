import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { normalizeWinnerTeam } from '../../shared/gameRoles.ts';
import { gameKey, parseGameKey, type Game, type GameSeat, type GameSeatResult, type GameStatus } from '../../shared/game.ts';
import { isCompletedClubGame } from './completedClubGame.ts';

/**
 * The one reader of «Игра» (docs/ARCHITECTURE_REVIEW_2026-11-03.md, step 1): reads both storage tables into the one
 * `Game` shape. Read-only — protocols, results and every write path stay where they are until each consumer moves here.
 */

/** The parsed club protocol rides along inside the module only. */
const strip = (game: Game & { _payload?: unknown }): Game => { const { _payload: _ignored, ...rest } = game; return rest; };

const parse = (text: unknown): any => { try { return text ? JSON.parse(String(text)) : null; } catch { return null; } };

const tableExists = async (db: DatabaseWrapper, name: string) =>
  Boolean(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [name]));

/** A game of an evening runs while the device's session has a server copy («Продолжить игру»). */
const runningClubIds = async (db: DatabaseWrapper, ids: string[]): Promise<Set<string>> => {
  if (!ids.length || !(await tableExists(db, 'live_game_checkpoints'))) return new Set();
  const column = (await db.all<any>('PRAGMA table_info(live_game_checkpoints)')).some((c: any) => c.name === 'game_key') ? 'game_key' : 'game_id';
  const keys = column === 'game_key' ? ids.map((id) => `club:${id}`) : ids;
  const rows = await db.all<any>(`SELECT ${column} AS k FROM live_game_checkpoints WHERE ${column} IN (${keys.map(() => '?').join(',')})`, keys);
  return new Set(rows.map((row: any) => String(row.k).replace(/^club:/, '')));
};

/**
 * The club's one rule (the same as achievements and statistics): an archived game is archived; a game of a cancelled
 * evening is cancelled even with a protocol; a game counts as played when its protocol is a completed club protocol.
 */
export const clubGameStatus = (row: { archived_at?: unknown; payload?: unknown; evening_status?: unknown }, running: boolean): GameStatus => {
  if (row.archived_at) return 'archived';
  if (row.evening_status === 'cancelled') return 'cancelled';
  if (isCompletedClubGame(row.payload)) return 'completed';
  return running ? 'running' : 'planned';
};

/** A tournament game counts as played when the game AND its protocol are completed; one without the other is still open. */
export const tournamentGameStatus = (row: { status?: unknown; protocol_status?: unknown; tournament_status?: unknown }): GameStatus => {
  const status = String(row.status || '');
  if (row.tournament_status === 'cancelled') return 'cancelled';
  if (status === 'completed' && row.protocol_status === 'completed') return 'completed';
  if (status === 'active' || status === 'in_progress' || status === 'completed') return 'running';
  return 'planned';
};

const clubSeats = (payload: any): GameSeat[] => (Array.isArray(payload?.player_results) ? payload.player_results : [])
  .map((r: any) => ({ seat: Number(r.seat_number), playerId: r.player_id ? String(r.player_id) : null, nickname: String(r.display_name || ''), role: r.role ? String(r.role) : null }))
  .sort((a: GameSeat, b: GameSeat) => a.seat - b.seat);

async function loadClubGames(db: DatabaseWrapper, where: string, params: unknown[]): Promise<Array<Game & { _payload?: any }>> {
  const rows = await db.all<any>(`
    SELECT g.id, g.evening_id, g.global_game_number, g.game_date, g.created_at, g.archived_at, g.judge_player_id, g.judge_name, g.protocol_text,
           e.format AS evening_format, e.status AS evening_status, e.starts_at, e.title AS evening_title, et.name AS table_name
      FROM games g LEFT JOIN game_evenings e ON e.id = g.evening_id
 LEFT JOIN evening_tables et ON et.id = g.evening_table_id
     WHERE ${where}`, params);
  const running = await runningClubIds(db, rows.map((row: any) => String(row.id)));
  return rows.map((row: any) => {
    const payload = parse(row.protocol_text);
    const protocol = payload?.protocol || {};
    return {
      key: gameKey('club', row.id), storage: 'club', id: String(row.id),
      format: normalizeEveningFormat(row.evening_format),
      status: clubGameStatus({ archived_at: row.archived_at, payload, evening_status: row.evening_status }, running.has(String(row.id))),
      eventId: row.evening_id ? String(row.evening_id) : null, eventKind: row.evening_id ? 'evening' : null, eventStatus: row.evening_status ? String(row.evening_status) : null,
      number: row.global_game_number == null ? null : Number(row.global_game_number),
      date: String(protocol.completed_at || row.game_date || row.starts_at || row.created_at || '') || null,
      winner: normalizeWinnerTeam(protocol.winner_team) as Game['winner'],
      judgePlayerId: row.judge_player_id ? String(row.judge_player_id) : null,
      judgeName: row.judge_name ? String(row.judge_name) : null,
      eventTitle: row.evening_title ? String(row.evening_title) : null,
      tableName: row.table_name ? String(row.table_name) : null,
      seats: clubSeats(payload),
      _payload: payload,
    } as Game & { _payload?: any };
  });
}

async function loadTournamentGames(db: DatabaseWrapper, where: string, params: unknown[]): Promise<Game[]> {
  if (!(await tableExists(db, 'tournament_games'))) return [];
  const protocols = await tableExists(db, 'tournament_game_protocols');
  // The judge of a tournament game (owner, 2026-11-03): the judge of the game's table, else the tournament's judge, who conducts
  // every game of a one-table tournament. A table is not stored yet — the per-game judge is the table's judge.
  const judge = (await db.all<any>('PRAGMA table_info(tournaments)')).some((column: any) => column.name === 'judge_player_id')
    ? 'COALESCE(tg.judge_player_id, t.judge_player_id)' : 'tg.judge_player_id';
  where = where.replace(/\$\{judge\}/g, judge);
  const rows = await db.all<any>(`
    SELECT tg.id, tg.tournament_id, tg.game_number, tg.status, tg.winner_team, tg.started_at, tg.completed_at, tg.judge_name,
           ${judge} AS judge_player_id, tgp.status AS protocol_status,
           t.status AS tournament_status, t.date AS tournament_date, t.title AS tournament_title,
           (SELECT json_group_array(json_object('seat', s.seat_number, 'role', s.role, 'player_id', tp.player_id, 'nickname', tp.display_name))
              FROM tournament_game_seats s JOIN tournament_participants tp ON tp.id = s.participant_id WHERE s.game_id = tg.id) AS seats_json
      FROM tournament_games tg JOIN tournaments t ON t.id = tg.tournament_id
      ${protocols ? 'LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id' : 'LEFT JOIN (SELECT NULL AS game_id, NULL AS status) tgp ON 0'}
     WHERE ${where}`, params);
  return rows.map((row: any) => ({
    key: gameKey('tournament', row.id), storage: 'tournament', id: String(row.id),
    format: 'TOURNAMENT',
    status: tournamentGameStatus(row),
    eventId: String(row.tournament_id), eventKind: 'tournament', eventStatus: row.tournament_status ? String(row.tournament_status) : null,
    number: row.game_number == null ? null : Number(row.game_number),
    date: String(row.completed_at || row.started_at || row.tournament_date || '') || null,
    winner: normalizeWinnerTeam(row.winner_team) as Game['winner'],
    judgePlayerId: row.judge_player_id ? String(row.judge_player_id) : null,
    judgeName: row.judge_name ? String(row.judge_name) : null,
    eventTitle: row.tournament_title ? String(row.tournament_title) : null,
    tableName: null,
    seats: (parse(row.seats_json) || [])
      .map((s: any) => ({ seat: Number(s.seat), playerId: s.player_id ? String(s.player_id) : null, nickname: String(s.nickname || ''), role: s.role ? String(s.role) : null }))
      .sort((a: GameSeat, b: GameSeat) => a.seat - b.seat),
  } satisfies Game));
}

/** One game by its key (`club:7`, `tournament:<id>`); null when there is no such game. */
export async function getGame(db: DatabaseWrapper, key: string): Promise<Game | null> {
  const parsed = parseGameKey(key);
  if (!parsed) return null;
  const games = parsed.storage === 'club'
    ? await loadClubGames(db, 'g.id = ?', [Number(parsed.id)])
    : await loadTournamentGames(db, 'tg.id = ?', [parsed.id]);
  return games[0] ? strip(games[0]) : null;
}

/** Every game of one event (an evening or a tournament), in playing order. */
export async function listEventGames(db: DatabaseWrapper, eventKind: 'evening' | 'tournament', eventId: string): Promise<Game[]> {
  const games = eventKind === 'evening'
    ? await loadClubGames(db, 'g.evening_id = ?', [eventId])
    : await loadTournamentGames(db, 'tg.tournament_id = ?', [eventId]);
  return games.map(strip).sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.id.localeCompare(b.id));
}

/** Games judged by a player, of every format (one rule for the judge of a game, see `loadTournamentGames`). */
export async function listGamesJudgedBy(db: DatabaseWrapper, playerId: string): Promise<Game[]> {
  return [
    ...(await loadClubGames(db, 'g.judge_player_id = ?', [playerId])).map(strip),
    ...await loadTournamentGames(db, '${judge} = ?', [playerId]),
  ];
}

const n = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const bestSource = (value: unknown): GameSeatResult['bestMoveSource'] => (value === 'first_killed' || value === 'zero_round_voted' ? value : null);

/**
 * Every game a player sat in, of every format, with that player's result (profile, cabinet). The club games are picked
 * by the player in SQLite (`json_each` over the results), not by parsing every protocol in JavaScript.
 */
export async function listPlayerGameResults(db: DatabaseWrapper, playerId: string): Promise<Array<{ game: Game; result: GameSeatResult }>> {
  const out: Array<{ game: Game; result: GameSeatResult }> = [];
  const club = await loadClubGames(db, `g.evening_id IS NOT NULL AND g.protocol_text IS NOT NULL AND json_valid(g.protocol_text)
      AND EXISTS (SELECT 1 FROM json_each(g.protocol_text, '$.player_results') r WHERE CAST(json_extract(r.value, '$.player_id') AS TEXT) = ?)`, [playerId]);
  for (const entry of club) {
    const payload = entry._payload;
    if (!payload || payload.kind !== 'club_evening_protocol' || !Array.isArray(payload.player_results)) continue;
    const result = payload.player_results.find((item: any) => String(item.player_id || '') === playerId);
    if (!result) continue;
    const protocol = payload.protocol || {};
    const participant = String(result.participant_id || '');
    const best = Array.isArray(protocol.best_moves) ? protocol.best_moves.find((item: any) => String(item.participant_id || '') === participant) : null;
    out.push({ game: strip(entry), result: {
      seat: n(result.seat_number), participantId: participant || null, playerId, nickname: String(result.display_name || ''), role: result.role ? String(result.role) : null,
      exitType: result.exit_type || null, regularFouls: n(result.regular_fouls), minorTechnicalFouls: n(result.minor_technical_fouls), majorTechnicalFouls: n(result.major_technical_fouls),
      judgeBonus: n(result.judge_bonus), protocolBonus: n(result.protocol_bonus), ciPoints: n(result.ci_points), penaltyPoints: n(result.penalty_points),
      disciplinaryPenaltyPoints: n(result.disciplinary_penalty_points), bestMove: Boolean(best), bestMoveSource: bestSource(best?.source),
      firstKilled: Boolean(participant) && String(protocol.first_killed_participant_id || '') === participant,
      zeroRoundVoted: Boolean(participant) && String(protocol.zero_round_voted_participant_id || '') === participant,
    } });
  }
  if (!(await tableExists(db, 'tournament_games'))) return out;
  const rows = await db.all<any>(`
    SELECT tgs.game_id, tp.id AS participant_id, tp.display_name, tgs.seat_number, tgs.role,
           tgpr.exit_type, tgpr.regular_fouls, tgpr.minor_technical_fouls, tgpr.major_technical_fouls, tgpr.judge_bonus, tgpr.protocol_bonus,
           tgpr.ci_points, tgpr.penalty_points, tgpr.disciplinary_penalty_points,
           tgp.first_killed_participant_id, tgp.zero_round_voted_participant_id, tgbm.source AS best_move_source
      FROM tournament_participants tp
      JOIN tournament_game_seats tgs ON tgs.participant_id = tp.id
 LEFT JOIN tournament_game_player_results tgpr ON tgpr.game_id = tgs.game_id AND tgpr.participant_id = tp.id
 LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tgs.game_id
 LEFT JOIN tournament_game_best_moves tgbm ON tgbm.game_id = tgs.game_id AND tgbm.participant_id = tp.id
     WHERE tp.player_id = ?`, [playerId]);
  if (!rows.length) return out;
  const games = new Map((await loadTournamentGames(db, `tg.id IN (${rows.map(() => '?').join(',')})`, rows.map((row: any) => row.game_id))).map((game) => [game.id, game]));
  for (const row of rows) {
    const game = games.get(String(row.game_id));
    if (!game) continue;
    const participant = String(row.participant_id);
    const source = bestSource(row.best_move_source);
    out.push({ game, result: {
      seat: n(row.seat_number), participantId: participant, playerId, nickname: String(row.display_name || ''), role: row.role ? String(row.role) : null,
      exitType: row.exit_type || null, regularFouls: n(row.regular_fouls), minorTechnicalFouls: n(row.minor_technical_fouls), majorTechnicalFouls: n(row.major_technical_fouls),
      judgeBonus: n(row.judge_bonus), protocolBonus: n(row.protocol_bonus), ciPoints: n(row.ci_points), penaltyPoints: n(row.penalty_points),
      disciplinaryPenaltyPoints: n(row.disciplinary_penalty_points), bestMove: Boolean(source), bestMoveSource: source,
      firstKilled: String(row.first_killed_participant_id || '') === participant,
      zeroRoundVoted: String(row.zero_round_voted_participant_id || '') === participant,
    } });
  }
  return out;
}

/** The latest completed games of every format, newest first (the cabinet's archive of the club). */
export async function listRecentCompletedGames(db: DatabaseWrapper, limitPerStorage = 250): Promise<Game[]> {
  const limit = Math.max(1, Math.min(1000, Math.trunc(limitPerStorage)));
  const club = (await loadClubGames(db, `g.evening_id IS NOT NULL AND g.archived_at IS NULL AND g.protocol_text IS NOT NULL
      AND COALESCE(e.status, '') <> 'cancelled' AND json_valid(g.protocol_text) AND json_extract(g.protocol_text, '$.protocol.status') = 'completed'
    ORDER BY COALESCE(e.starts_at, g.game_date) DESC, g.global_game_number DESC, g.id DESC LIMIT ${limit}`, [])).map(strip);
  const tournament = await loadTournamentGames(db, `tg.status = 'completed' AND tgp.status = 'completed'
    ORDER BY COALESCE(tg.completed_at, t.date) DESC, tg.game_number DESC LIMIT ${limit}`, []);
  const time = (game: Game) => (game.date ? new Date(game.date).getTime() : 0);
  return [...club, ...tournament].filter((game) => game.status === 'completed').sort((a, b) => time(b) - time(a));
}

/**
 * SQL of «who played in which completed game», every format, for counts inside one query (ratings, lists). The same
 * rules as `Game.status === 'completed'`: a completed club protocol of a game that is not archived and whose evening is
 * not cancelled; a tournament game completed with its protocol, of a tournament that is not cancelled.
 * Columns: game_key, player_id.
 */
export const COMPLETED_GAME_PLAYERS_SQL = `
  SELECT 'club:' || g.id AS game_key, CAST(json_extract(r.value, '$.player_id') AS TEXT) AS player_id
    FROM games g
    LEFT JOIN game_evenings e ON e.id = g.evening_id,
         json_each(CASE WHEN json_valid(g.protocol_text) THEN g.protocol_text ELSE '{}' END, '$.player_results') r
   WHERE g.evening_id IS NOT NULL AND g.archived_at IS NULL AND COALESCE(e.status, '') <> 'cancelled'
     AND json_extract(g.protocol_text, '$.kind') = 'club_evening_protocol'
     AND json_extract(g.protocol_text, '$.protocol.status') = 'completed'
     AND json_extract(r.value, '$.player_id') IS NOT NULL
  UNION ALL
  SELECT 'tournament:' || tg.id AS game_key, CAST(tp.player_id AS TEXT) AS player_id
    FROM tournament_participants tp
    JOIN tournament_game_seats tgs ON tgs.participant_id = tp.id
    JOIN tournament_games tg ON tg.id = tgs.game_id
    JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
    JOIN tournaments t ON t.id = tg.tournament_id
   WHERE tg.status = 'completed' AND tgp.status = 'completed' AND COALESCE(t.status, '') <> 'cancelled' AND tp.player_id IS NOT NULL`;
