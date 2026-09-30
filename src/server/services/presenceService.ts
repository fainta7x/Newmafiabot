import type { DatabaseWrapper } from '../../db/index.ts';
import { sanitizeUiScreenName } from '../../lib/uiUsageNames.ts';

/**
 * «Сейчас в приложении» (owner, 2026-09-30: online + screen, only the owner sees it, players are not told).
 * The app reports the open screen every ~30 s while it is on the display. Kept only in process memory —
 * nothing is written to the database and nothing survives a restart; a person counts as online for
 * ONLINE_MS after the last report.
 */
export const ONLINE_MS = 90 * 1000;
type Seen = { player_id: string; screen: string; since: number; last_seen: number };
const presence = new WeakMap<DatabaseWrapper, Map<string, Seen>>();

export function recordPresence(db: DatabaseWrapper, playerId: string, rawScreen: unknown, now = Date.now()) {
  const screen = sanitizeUiScreenName(String(rawScreen || '').slice(0, 200)) || '/';
  const map = presence.get(db) || new Map<string, Seen>();
  const previous = map.get(playerId);
  const fresh = previous && now - previous.last_seen <= ONLINE_MS;
  map.set(playerId, {
    player_id: playerId, screen,
    // «since» = how long on this screen; a new screen or a return after being away starts it again.
    since: fresh && previous.screen === screen ? previous.since : now,
    last_seen: now,
  });
  for (const [id, seen] of map) if (now - seen.last_seen > ONLINE_MS * 4) map.delete(id);
  presence.set(db, map);
}

export async function loadPresence(db: DatabaseWrapper, now = Date.now()) {
  const online = [...(presence.get(db)?.values() || [])].filter((seen) => now - seen.last_seen <= ONLINE_MS);
  if (!online.length) return [];
  const ids = online.map((seen) => seen.player_id);
  const players = new Map((await db.all<any>(
    `SELECT id, nickname FROM players WHERE id IN (${ids.map(() => '?').join(',')})`, ids,
  )).map((row: any) => [String(row.id), String(row.nickname || 'Без ника')]));
  return online
    .map((seen) => ({ player_id: seen.player_id, nickname: players.get(seen.player_id) || 'Без ника', screen: seen.screen,
      on_screen_seconds: Math.round((now - seen.since) / 1000), seen_seconds_ago: Math.round((now - seen.last_seen) / 1000) }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'));
}
