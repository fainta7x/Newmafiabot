import { analyticsInputsVersion, CLUB_SNAPSHOT_INPUTS } from './analyticsInputsVersion.ts';
import { gameTeamOfRole, normalizeGameRole } from '../../shared/gameRoles.ts';
import { listCompletedGames } from './gameService.ts';
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

/** Completed games of every format through the one «Игра» layer (docs/ARCHITECTURE_REVIEW_2026-11-03.md). */
async function loadCompletedGameSnapshotsUncached(db: any): Promise<CompletedGameSnapshot[]> {
  const snapshots: CompletedGameSnapshot[] = [];
  for (const game of await listCompletedGames(db)) {
    const winner = game.winner;
    const eventDate = validDate(game.eventDate || game.date);
    const playedDate = validDate(game.date) || eventDate;
    const eventId = String(game.eventId || '').trim();
    if (!winner || !eventDate || !playedDate || !eventId) continue;
    const players = game.seats.flatMap((seat) => {
      const playerId = String(seat.playerId || '').trim();
      const team = gameTeamOfRole(seat.role);
      if (!playerId || !team) return [];
      return [{
        player_id: playerId,
        nickname: String(seat.nickname || 'Игрок'),
        role: normalizeGameRole(seat.role),
        team,
        won: team === winner,
        seat_number: Number(seat.seat || 0),
      } satisfies AnalyticsPlayerResult];
    });
    if (!players.length) continue;
    snapshots.push({
      id: game.key,
      source: game.storage,
      event_id: eventId,
      date: eventDate.iso,
      dateMs: playedDate.ms,
      played_at: playedDate.iso,
      title: String(game.eventTitle || (game.storage === 'club' ? 'Клубный вечер' : 'Турнир')),
      game_number: Number(game.number || 0),
      winner_team: winner,
      has_unresolved_players: players.length !== game.seats.length,
      players,
    } as CompletedGameSnapshot);
  }

  return snapshots.sort((a, b) => b.dateMs - a.dateMs || b.game_number - a.game_number);
}