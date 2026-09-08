import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerConnectionsSchema } from '../../db/ensurePlayerConnectionsSchema.ts';
import { chooseMostSuccessfulPartnership, loadCachedPlayerConnectionAnalytics } from './playerConnectionAnalyticsService.ts';

const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;

export async function loadEnrichedProfileConnections(db: DatabaseWrapper, playerId: string) {
  await ensurePlayerConnectionsSchema(db);
  const connections = await loadCachedPlayerConnectionAnalytics(db, playerId);
  const [invitedByRow, invitedRows] = await Promise.all([
    db.get<any>(`
      SELECT r.created_at, p.id AS player_id, p.nickname
        FROM player_referrals r JOIN players p ON p.id = r.inviter_player_id
       WHERE r.invited_player_id = ? LIMIT 1
    `, [playerId]),
    db.all<any>(`
      SELECT r.created_at, p.id AS player_id, p.nickname
        FROM player_referrals r JOIN players p ON p.id = r.invited_player_id
       WHERE r.inviter_player_id = ?
       ORDER BY datetime(r.created_at) ASC, p.nickname COLLATE NOCASE ASC LIMIT 50
    `, [playerId]),
  ]);
  const referral = (row: any) => ({
    player_id: String(row.player_id), nickname: String(row.nickname || 'Игрок'),
    avatar_url: avatarUrl(String(row.player_id)), created_at: row.created_at || null,
  });
  return {
    connections,
    most_successful_partnership: chooseMostSuccessfulPartnership(connections),
    invited_by: invitedByRow ? referral(invitedByRow) : null,
    invited_players: invitedRows.map(referral),
    meta: {
      source: 'completed_games_revision_cache',
      minimum_shared_games: 2,
      successful_partnership_minimum_same_team_games: 3,
      note: 'Связи считаются только по завершённым играм; кэш инвалидируется триггерами при коррекции исходных игр.',
    },
  };
}
