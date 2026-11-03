import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { normalizeWinnerTeam } from '../../shared/gameRoles.ts';
import { gameKey, parseGameKey, type Game, type GameSeat, type GameStatus } from '../../shared/game.ts';
import { isCompletedClubGame } from './completedClubGame.ts';

/**
 * The one reader of «Игра» (docs/ARCHITECTURE_REVIEW_2026-11-03.md, step 1): reads both storage tables into the one
 * `Game` shape. Read-only — protocols, results and every write path stay where they are until each consumer moves here.
 */

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

async function loadClubGames(db: DatabaseWrapper, where: string, params: unknown[]): Promise<Game[]> {
  const rows = await db.all<any>(`
    SELECT g.id, g.evening_id, g.global_game_number, g.game_date, g.created_at, g.archived_at, g.judge_player_id, g.protocol_text,
           e.format AS evening_format, e.status AS evening_status, e.starts_at
      FROM games g LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE ${where}`, params);
  const running = await runningClubIds(db, rows.map((row: any) => String(row.id)));
  return rows.map((row: any) => {
    const payload = parse(row.protocol_text);
    const protocol = payload?.protocol || {};
    return {
      key: gameKey('club', row.id), storage: 'club', id: String(row.id),
      format: normalizeEveningFormat(row.evening_format),
      status: clubGameStatus({ archived_at: row.archived_at, payload, evening_status: row.evening_status }, running.has(String(row.id))),
      eventId: row.evening_id ? String(row.evening_id) : null, eventKind: row.evening_id ? 'evening' : null,
      number: row.global_game_number == null ? null : Number(row.global_game_number),
      date: String(protocol.completed_at || row.game_date || row.starts_at || row.created_at || '') || null,
      winner: normalizeWinnerTeam(protocol.winner_team) as Game['winner'],
      judgePlayerId: row.judge_player_id ? String(row.judge_player_id) : null,
      seats: clubSeats(payload),
    } satisfies Game;
  });
}

async function loadTournamentGames(db: DatabaseWrapper, where: string, params: unknown[]): Promise<Game[]> {
  if (!(await tableExists(db, 'tournament_games'))) return [];
  const protocols = await tableExists(db, 'tournament_game_protocols');
  // The judge of a tournament game: the game's own judge, else the tournament's (managed tournament evenings), as achievements count it.
  const judge = (await db.all<any>('PRAGMA table_info(tournaments)')).some((column: any) => column.name === 'judge_player_id')
    ? 'COALESCE(tg.judge_player_id, t.judge_player_id)' : 'tg.judge_player_id';
  where = where.replace(/\$\{judge\}/g, judge);
  const rows = await db.all<any>(`
    SELECT tg.id, tg.tournament_id, tg.game_number, tg.status, tg.winner_team, tg.started_at, tg.completed_at,
           ${judge} AS judge_player_id, tgp.status AS protocol_status,
           t.status AS tournament_status, t.date AS tournament_date,
           (SELECT json_group_array(json_object('seat', s.seat_number, 'role', s.role, 'player_id', tp.player_id, 'nickname', tp.display_name))
              FROM tournament_game_seats s JOIN tournament_participants tp ON tp.id = s.participant_id WHERE s.game_id = tg.id) AS seats_json
      FROM tournament_games tg JOIN tournaments t ON t.id = tg.tournament_id
      ${protocols ? 'LEFT JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id' : 'LEFT JOIN (SELECT NULL AS game_id, NULL AS status) tgp ON 0'}
     WHERE ${where}`, params);
  return rows.map((row: any) => ({
    key: gameKey('tournament', row.id), storage: 'tournament', id: String(row.id),
    format: 'TOURNAMENT',
    status: tournamentGameStatus(row),
    eventId: String(row.tournament_id), eventKind: 'tournament',
    number: row.game_number == null ? null : Number(row.game_number),
    date: String(row.completed_at || row.started_at || row.tournament_date || '') || null,
    winner: normalizeWinnerTeam(row.winner_team) as Game['winner'],
    judgePlayerId: row.judge_player_id ? String(row.judge_player_id) : null,
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
  return games[0] || null;
}

/** Every game of one event (an evening or a tournament), in playing order. */
export async function listEventGames(db: DatabaseWrapper, eventKind: 'evening' | 'tournament', eventId: string): Promise<Game[]> {
  const games = eventKind === 'evening'
    ? await loadClubGames(db, 'g.evening_id = ?', [eventId])
    : await loadTournamentGames(db, 'tg.tournament_id = ?', [eventId]);
  return games.sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.id.localeCompare(b.id));
}

/** Games judged by a player, of every format (one rule for the judge of a game, see `loadTournamentGames`). */
export async function listGamesJudgedBy(db: DatabaseWrapper, playerId: string): Promise<Game[]> {
  return [
    ...await loadClubGames(db, 'g.judge_player_id = ?', [playerId]),
    ...await loadTournamentGames(db, '${judge} = ?', [playerId]),
  ];
}
