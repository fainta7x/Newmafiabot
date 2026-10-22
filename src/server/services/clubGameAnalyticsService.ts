import { analyticsInputsVersion, CLUB_SNAPSHOT_INPUTS } from './analyticsInputsVersion.ts';
import { completedClubGameDate, isCompletedClubGamePayload } from './completedClubGame.ts';
import { gameTeamOfRole, normalizeGameRole, normalizeWinnerTeam } from '../../shared/gameRoles.ts';
export type AnalyticsTeam = 'red' | 'black';

export type AnalyticsPlayerResult = {
  player_id: string;
  nickname: string;
  role: 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
  team: AnalyticsTeam;
  won: boolean;
  seat_number: number;
};

export type CompletedGameSnapshot = {
  id: string;
  source: 'club' | 'tournament';
  event_id: string;
  date: string;
  dateMs: number;
  played_at: string;
  title: string;
  game_number: number;
  winner_team: AnalyticsTeam;
  players: AnalyticsPlayerResult[];
  /** The legacy projection omitted an unidentifiable or unclassified original seat. */
  has_unresolved_players?: boolean;
};

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const validDate = (value: unknown): { iso: string; ms: number } | null => {
  if (!value) return null;
  const date = new Date(String(value));
  const ms = date.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return { iso: date.toISOString(), ms };
};

// Many independent player screens request the same finished-game history at
// once. Keep the parsed projection until one of its real inputs changes (a trigger counter, see
// analyticsInputsVersion.ts: a poker save or a token change must not drop it); every save, protocol correction
// or cross-process commit of a game invalidates it automatically.
// Always hand callers their own outer array so sort/reverse cannot mutate cache.
const snapshotCache = new WeakMap<object, { version: string; promise: Promise<CompletedGameSnapshot[]> }>();

export function loadCompletedGameSnapshots(db: any): Promise<CompletedGameSnapshot[]> {
  const version = analyticsInputsVersion(db, 'club_snapshots', CLUB_SNAPSHOT_INPUTS);
  const cached = snapshotCache.get(db as object);
  if (version !== null && cached?.version === version) return cached.promise.then((rows) => rows.slice());
  const promise = loadCompletedGameSnapshotsUncached(db);
  if (version !== null) {
    snapshotCache.set(db as object, { version, promise });
    void promise.catch(() => {
      if (snapshotCache.get(db as object)?.promise === promise) snapshotCache.delete(db as object);
    });
  }
  return promise.then((rows) => rows.slice());
}

async function loadCompletedGameSnapshotsUncached(db: any): Promise<CompletedGameSnapshot[]> {
  const [clubRows, tournamentRows] = await Promise.all([
    db.all(`
      SELECT g.id, g.evening_id, g.global_game_number, g.game_date, g.created_at,
             g.winner_team, g.protocol_text,
             e.title AS evening_title, e.starts_at AS evening_date
        FROM games g
   LEFT JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.evening_id IS NOT NULL
         AND g.archived_at IS NULL
         AND g.protocol_text IS NOT NULL
    `),
    db.all(`
      SELECT t.id AS tournament_id, tg.id AS game_id, tg.game_number, tg.winner_team, tg.completed_at,
             t.title AS tournament_title, t.date AS tournament_date,
             tp.player_id, p.nickname, tgs.seat_number, tgs.role
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        JOIN tournament_games tg ON tg.id = tgs.game_id
        JOIN tournaments t ON t.id = tg.tournament_id
   LEFT JOIN players p ON p.id = tp.player_id
       WHERE tg.status = 'completed'
    `),
  ]);

  const snapshots: CompletedGameSnapshot[] = [];

  for (const row of clubRows) {
    const payload = safeJsonParse(row.protocol_text);
    if (!isCompletedClubGamePayload(payload)) continue;
    const winner = normalizeWinnerTeam(payload.protocol?.winner_team || row.winner_team);
    const eventDate = validDate(row.evening_date || row.game_date || row.created_at);
    // A game can be saved before it ends. Season placements must follow the completed-at date,
    // matching detailed statistics, not the creation date of its draft record.
    const playedDate = validDate(completedClubGameDate(payload, row)) || eventDate;
    const eventId = String(row.evening_id || '').trim();
    if (!winner || !eventDate || !playedDate || !eventId) continue;

    const players = payload.player_results.flatMap((result: any) => {
      const playerId = String(result.player_id || '').trim();
      const team = gameTeamOfRole(result.role);
      if (!playerId || !team) return [];
      return [{
        player_id: playerId,
        nickname: String(result.display_name || 'Игрок'),
        role: normalizeGameRole(result.role),
        team,
        won: team === winner,
        seat_number: Number(result.seat_number || 0),
      } satisfies AnalyticsPlayerResult];
    });
    if (!players.length) continue;

    snapshots.push({
      id: `club:${row.id}`,
      source: 'club',
      event_id: eventId,
      date: eventDate.iso,
      dateMs: playedDate.ms,
      played_at: playedDate.iso,
      title: String(row.evening_title || 'Клубный вечер'),
      game_number: Number(row.global_game_number || 0),
      winner_team: winner,
      has_unresolved_players: players.length !== payload.player_results.length,
      players,
    });
  }

  const tournamentByGame = new Map<string, any[]>();
  for (const row of tournamentRows) {
    const key = String(row.game_id);
    const bucket = tournamentByGame.get(key) || [];
    bucket.push(row);
    tournamentByGame.set(key, bucket);
  }

  for (const [gameId, rows] of tournamentByGame.entries()) {
    const head = rows[0];
    const winner = normalizeWinnerTeam(head?.winner_team);
    const eventDate = validDate(head?.tournament_date || head?.completed_at);
    const playedDate = validDate(head?.completed_at || head?.tournament_date) || eventDate;
    const eventId = String(head?.tournament_id || '').trim();
    if (!winner || !eventDate || !playedDate || !eventId) continue;
    const players = rows.flatMap((row: any) => {
      const playerId = String(row.player_id || '').trim();
      const team = gameTeamOfRole(row.role);
      if (!playerId || !team) return [];
      return [{
        player_id: playerId,
        nickname: String(row.nickname || 'Игрок'),
        role: normalizeGameRole(row.role),
        team,
        won: team === winner,
        seat_number: Number(row.seat_number || 0),
      } satisfies AnalyticsPlayerResult];
    });
    if (!players.length) continue;

    snapshots.push({
      id: `tournament:${gameId}`,
      source: 'tournament',
      event_id: eventId,
      date: eventDate.iso,
      dateMs: playedDate.ms,
      played_at: playedDate.iso,
      title: String(head?.tournament_title || 'Турнир'),
      game_number: Number(head?.game_number || 0),
      winner_team: winner,
      has_unresolved_players: players.length !== rows.length,
      players,
    });
  }

  return snapshots.sort((a, b) => b.dateMs - a.dateMs || b.game_number - a.game_number);
}