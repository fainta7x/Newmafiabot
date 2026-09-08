import type { DatabaseWrapper } from '../../db/index.ts';
import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from './clubGameAnalyticsService.ts';

export type SharedGameSummary = {
  id: string;
  source: 'club' | 'tournament';
  event_id: string;
  title: string;
  game_number: number;
  played_at: string;
  same_team: boolean;
  won_together: boolean;
};

export type PlayerConnectionAnalytics = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  relationship: string;
  shared_games: number;
  same_team_games: number;
  opponent_games: number;
  same_team_wins: number;
  same_team_win_rate: number;
  recent_shared_games: SharedGameSummary[];
  last_played_at: string | null;
  last_shared_game_date: string | null;
};

type InternalRow = Omit<PlayerConnectionAnalytics, 'avatar_url' | 'relationship' | 'same_team_win_rate' | 'last_shared_game_date'> & { lastMs: number };
type CacheEntry = { revision: number; byPlayer: Map<string, PlayerConnectionAnalytics[]> };
const cache = new WeakMap<object, CacheEntry>();
const revisionSchemaReady = new WeakSet<object>();
const revisionSchemaPending = new WeakMap<object, Promise<void>>();
const avatarUrl = (id: string) => `/api/player/players/${encodeURIComponent(id)}/avatar`;

export async function ensurePlayerConnectionAnalyticsRevision(db: DatabaseWrapper) {
  const key = db as object;
  if (revisionSchemaReady.has(key)) return;
  const pending = revisionSchemaPending.get(key);
  if (pending) return pending;

  const initialize = (async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS player_connection_analytics_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0)`);
    await db.run(`INSERT OR IGNORE INTO player_connection_analytics_revision (id, revision) VALUES (1, 0)`);
    const sources = ['games', 'tournament_games', 'tournament_game_seats', 'tournament_participants'];
    for (const table of sources) {
      for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
        const trigger = `trg_connection_revision_${table}_${action.toLowerCase()}`;
        await db.run(`CREATE TRIGGER IF NOT EXISTS ${trigger} AFTER ${action} ON ${table} BEGIN UPDATE player_connection_analytics_revision SET revision = revision + 1 WHERE id = 1; END`);
      }
    }
    revisionSchemaReady.add(key);
  })();

  revisionSchemaPending.set(key, initialize);
  try {
    await initialize;
  } finally {
    revisionSchemaPending.delete(key);
  }
}

const relationshipLabel = (row: InternalRow) => {
  if (row.same_team_games >= 3 && row.same_team_games > row.opponent_games) return 'Часто в одной команде';
  if (row.opponent_games >= 3 && row.opponent_games > row.same_team_games) return 'Часто по разные стороны';
  return 'Часто за одним столом';
};

export function buildAllPlayerConnectionAnalytics(snapshots: CompletedGameSnapshot[]) {
  const rows = new Map<string, Map<string, InternalRow>>();
  const touch = (selfId: string, other: CompletedGameSnapshot['players'][number], game: CompletedGameSnapshot, sameTeam: boolean, wonTogether: boolean) => {
    const bucket = rows.get(selfId) || new Map<string, InternalRow>();
    const otherId = String(other.player_id);
    const row = bucket.get(otherId) || {
      player_id: otherId,
      nickname: String(other.nickname || 'Игрок'),
      shared_games: 0,
      same_team_games: 0,
      opponent_games: 0,
      same_team_wins: 0,
      recent_shared_games: [],
      last_played_at: null,
      lastMs: 0,
    };
    row.nickname = String(other.nickname || row.nickname);
    row.shared_games += 1;
    if (sameTeam) {
      row.same_team_games += 1;
      if (wonTogether) row.same_team_wins += 1;
    } else row.opponent_games += 1;
    row.recent_shared_games.push({
      id: game.id,
      source: game.source,
      event_id: game.event_id,
      title: game.title,
      game_number: game.game_number,
      played_at: game.played_at,
      same_team: sameTeam,
      won_together: wonTogether,
    });
    row.recent_shared_games.sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at));
    row.recent_shared_games = row.recent_shared_games.slice(0, 3);
    if (game.dateMs >= row.lastMs) { row.lastMs = game.dateMs; row.last_played_at = game.played_at || game.date || null; }
    bucket.set(otherId, row);
    rows.set(selfId, bucket);
  };

  for (const game of snapshots) {
    for (let i = 0; i < game.players.length; i += 1) {
      const a = game.players[i];
      if (!a?.player_id) continue;
      for (let j = i + 1; j < game.players.length; j += 1) {
        const b = game.players[j];
        if (!b?.player_id || a.player_id === b.player_id) continue;
        const sameTeam = a.team === b.team;
        const wonTogether = sameTeam && a.won && b.won;
        touch(String(a.player_id), b, game, sameTeam, wonTogether);
        touch(String(b.player_id), a, game, sameTeam, wonTogether);
      }
    }
  }

  const result = new Map<string, PlayerConnectionAnalytics[]>();
  for (const [playerId, bucket] of rows) {
    const connections = [...bucket.values()]
      .filter((row) => row.shared_games >= 2)
      .sort((a, b) => b.shared_games - a.shared_games || b.lastMs - a.lastMs || a.nickname.localeCompare(b.nickname, 'ru'))
      .slice(0, 24)
      .map((row) => ({
        player_id: row.player_id,
        nickname: row.nickname,
        avatar_url: avatarUrl(row.player_id),
        relationship: relationshipLabel(row),
        shared_games: row.shared_games,
        same_team_games: row.same_team_games,
        opponent_games: row.opponent_games,
        same_team_wins: row.same_team_wins,
        same_team_win_rate: row.same_team_games ? Math.round((row.same_team_wins / row.same_team_games) * 1000) / 10 : 0,
        recent_shared_games: row.recent_shared_games,
        last_played_at: row.last_played_at,
        last_shared_game_date: row.last_played_at,
      }));
    result.set(playerId, connections);
  }
  return result;
}

export async function loadCachedPlayerConnectionAnalytics(db: DatabaseWrapper, playerId: string) {
  await ensurePlayerConnectionAnalyticsRevision(db);
  const revisionRow = await db.get<any>('SELECT revision FROM player_connection_analytics_revision WHERE id = 1');
  const revision = Number(revisionRow?.revision || 0);
  let entry = cache.get(db as object);
  if (!entry || entry.revision !== revision) {
    const snapshots = await loadCompletedGameSnapshots(db);
    entry = { revision, byPlayer: buildAllPlayerConnectionAnalytics(snapshots) };
    cache.set(db as object, entry);
  }
  return entry.byPlayer.get(playerId) || [];
}

export const chooseMostSuccessfulPartnership = (connections: PlayerConnectionAnalytics[], minimumGames = 3) =>
  connections
    .filter((item) => item.same_team_games >= minimumGames)
    .sort((a, b) => b.same_team_win_rate - a.same_team_win_rate || b.same_team_games - a.same_team_games || b.shared_games - a.shared_games)[0] || null;
