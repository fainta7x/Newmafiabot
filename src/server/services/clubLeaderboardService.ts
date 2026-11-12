import type { DatabaseWrapper } from '../../db/index.ts';
import { COMPLETED_GAME_PLAYERS_SQL } from './gameService.ts';

/** The club's players with at least one completed game, best Elo first. Used by the player rating and by the club site's public table. */
export async function loadClubLeaderboardRows(db: DatabaseWrapper) {
  return db.all<any>(`
      WITH ranked_players AS (
      SELECT
        p.id,
        p.nickname,
        p.elo,
        p.game_level,
        p.contact_status,
        EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
        EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed,
        COALESCE(played.games, 0) AS games
      FROM players p
      -- Completed games of every format, counted once per player (the «Игра» layer's rule and SQL).
      LEFT JOIN (SELECT player_id, COUNT(DISTINCT game_key) AS games FROM (${COMPLETED_GAME_PLAYERS_SQL}) GROUP BY player_id) played
        ON played.player_id = CAST(p.id AS TEXT)
      WHERE COALESCE(p.contact_status, 'normal') != 'blocked'
        AND COALESCE(p.source, '') != 'legacy_guest_migrated'
        AND COALESCE(p.lifecycle_status, 'normal') NOT IN ('archived', 'merged')
      )
      SELECT * FROM ranked_players
       WHERE games > 0
       ORDER BY COALESCE(elo, 1000) DESC, nickname COLLATE NOCASE ASC, id ASC
  `);
}
