import type { DatabaseWrapper } from '../../db/index.ts';
import { sqliteReadVersion } from './sqliteReadVersion.ts';
import {
  prepareCanonicalEloEvents,
  calculateCanonicalEloGame,
  currentEloInputsGeneration,
  DEFAULT_ELO,
  type CanonicalEloGamePlayer,
  type CanonicalEloPlayerDelta,
  type EloTeam,
  type PreparedEloEvent as PreparedEvent,
} from './eloRatingService.ts';


export interface PlayerEloHistoryRow extends CanonicalEloPlayerDelta {
  eloBefore: number;
  eloAfter: number;
  team: EloTeam;
  won: boolean;
  canonicalPersonalGamePoints: number;
}

export interface PlayerEloHistoryEvent {
  source: 'tournament' | 'club';
  sourceId: string;
  sortAt: string;
  sortOrder: number;
  winnerTeam: EloTeam;
  players: PlayerEloHistoryRow[];
}



/** `guests` are the seats of guests without a profile: they are left out of the rating, so fewer players are expected. */
const loadPreparedEvents = async (db: DatabaseWrapper) => {
  const players = await db.all<any>(
    'SELECT id, COALESCE(elo_seed, ?) AS elo_seed FROM players ORDER BY id',
    [DEFAULT_ELO],
  );
  const knownPlayerIds = new Set(players.map((player) => String(player.id)));
  const guestPlayerRows = await db.all<any>("SELECT id FROM players WHERE COALESCE(source,'') = 'legacy_guest_migrated'");
  const guestPlayerIds = new Set(guestPlayerRows.map((player: any) => String(player.id)));
  const seedByPlayer = new Map<string, number>(players.map((player) => {
    const seed = Number(player.elo_seed);
    return [String(player.id), Number.isFinite(seed) ? seed : DEFAULT_ELO];
  }));
  // One list of rated games with the canonical rebuild (`prepareCanonicalEloEvents`).
  const events: PreparedEvent[] = await prepareCanonicalEloEvents(db, knownPlayerIds, guestPlayerIds);

  return { playerIds: players.map((player) => String(player.id)), seedByPlayer, events };
};

/*
 * The timeline replays every club and tournament game (with tournament standings) and runs synchronously on the
 * database. On 2026-10-06 that froze the whole server for 20-30 s every minute: each open player app asks for its
 * notifications once a minute (two replays per request) and the background notification scan replays it too.
 * The result is kept per database and replayed only when its inputs change. The fingerprint counts the rows and
 * the protocol sizes, the stored Elo, the tournament participants and the generation of the canonical rebuild, which
 * every rated save runs; when it cannot be read the timeline is replayed as before.
 */
const timelineCache = new WeakMap<object, { version: string | null; fingerprint: string; timeline: Promise<PlayerEloHistoryEvent[]> }>();

async function eloInputsFingerprint(db: DatabaseWrapper): Promise<string | null> {
  try {
    const parts = await Promise.all([
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(protocol_text)) AS s, TOTAL(LENGTH(COALESCE(winner_team, ''))) AS w, COUNT(archived_at) AS a FROM games`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(format, ''))) AS f FROM game_evenings`),
      db.get(`SELECT COUNT(*) AS c, TOTAL(COALESCE(elo_seed, 0)) AS seed, TOTAL(COALESCE(elo, 0)) AS elo, TOTAL(LENGTH(COALESCE(source, ''))) AS src FROM players`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r FROM tournaments`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(status, ''))) AS s, TOTAL(LENGTH(COALESCE(winner_team, ''))) AS w FROM tournament_games`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(status, ''))) AS s, TOTAL(LENGTH(COALESCE(winner_team, ''))) AS w FROM tournament_game_protocols`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(judge_bonus) + TOTAL(protocol_bonus) + TOTAL(penalty_points) + TOTAL(ci_points) AS s FROM tournament_game_player_results`),
      db.get(`SELECT COUNT(*) AS c, MAX(rowid) AS r, TOTAL(LENGTH(COALESCE(role, ''))) AS s FROM tournament_game_seats`),
    ]);
    // Identity swaps keep counts and sums: the participants themselves and the rebuild generation catch them.
    const participants = await db.get(`SELECT group_concat(id || ':' || COALESCE(player_id, ''), ',') AS ids FROM (SELECT id, player_id FROM tournament_participants ORDER BY id)`);
    return JSON.stringify([currentEloInputsGeneration(), parts, participants]);
  } catch {
    return null;
  }
}

export async function loadPlayerEloHistory(db: DatabaseWrapper): Promise<PlayerEloHistoryEvent[]> {
  const version = sqliteReadVersion(db);
  const cached = timelineCache.get(db as object);
  // The common read-only path is O(1), even with a long history.
  if (version !== null && cached?.version === version) return cached.timeline;
  // A database write is not necessarily a game/Elo change (it may just mark a
  // notification read). Recheck the original input fingerprint before replaying
  // the expensive chronological Elo calculation; preserve existing semantics.
  const fingerprint = await eloInputsFingerprint(db);
  if (fingerprint && cached?.fingerprint === fingerprint) {
    cached.version = version;
    return cached.timeline;
  }
  const timeline = replayPlayerEloHistory(db);
  if (fingerprint) {
    timelineCache.set(db as object, { version, fingerprint, timeline });
    void timeline.catch(() => { if (timelineCache.get(db as object)?.timeline === timeline) timelineCache.delete(db as object); });
  }
  return timeline;
}

async function replayPlayerEloHistory(db: DatabaseWrapper): Promise<PlayerEloHistoryEvent[]> {
  const prepared = await loadPreparedEvents(db);
  const ratings = new Map<string, number>(prepared.playerIds.map((playerId) => [
    playerId,
    prepared.seedByPlayer.get(playerId) ?? DEFAULT_ELO,
  ]));
  const timeline: PlayerEloHistoryEvent[] = [];

  for (const event of prepared.events) {
    const gamePlayers: CanonicalEloGamePlayer[] = event.players.map((player) => ({
      ...player,
      elo: ratings.get(player.playerId) ?? DEFAULT_ELO,
    }));
    const deltas = calculateCanonicalEloGame(gamePlayers, event.winnerTeam);
    const rows = deltas.map((delta) => {
      const eloBefore = ratings.get(delta.playerId) ?? DEFAULT_ELO;
      const preparedPlayer = event.players.find((player) => player.playerId === delta.playerId);
      const team = preparedPlayer?.team ?? 'red';
      return {
        ...delta,
        eloBefore,
        eloAfter: eloBefore + delta.totalDelta,
        team,
        won: team === event.winnerTeam,
        canonicalPersonalGamePoints: preparedPlayer?.canonicalPersonalGamePoints ?? 0,
      };
    });

    for (const row of rows) ratings.set(row.playerId, row.eloAfter);
    timeline.push({
      source: event.source,
      sourceId: event.sourceId,
      sortAt: event.sortAt,
      sortOrder: event.sortOrder,
      winnerTeam: event.winnerTeam,
      players: rows,
    });
  }

  return timeline;
}



