import type { DatabaseWrapper } from '../../db/index.ts';
import { loadCompletedGameSnapshots } from './clubGameAnalyticsService.ts';
import { buildProfileConnections, getEveningInvitationContext } from './premiumPlayerConnectionsService.ts';

export type SmartFriendInviteSuggestion = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  relationship: string;
  shared_games: number;
  same_team_games: number;
  opponent_games: number;
  evening: {
    id: string;
    title: string;
    starts_at: string | null;
    venue: string | null;
    format: string;
  };
};

export async function loadSmartFriendInviteSuggestions(
  db: DatabaseWrapper,
  playerId: string,
  limit = 4,
): Promise<SmartFriendInviteSuggestion[]> {
  const snapshots = await loadCompletedGameSnapshots(db);
  const strongestConnections = buildProfileConnections(snapshots, playerId).slice(0, 12);
  const suggestions: SmartFriendInviteSuggestion[] = [];

  for (const connection of strongestConnections) {
    const context = await getEveningInvitationContext(db, playerId, connection.player_id);
    const evening = context.evenings.find((item: any) => !item.existing_invitation);
    if (!evening) continue;

    suggestions.push({
      player_id: connection.player_id,
      nickname: connection.nickname,
      avatar_url: connection.avatar_url,
      relationship: connection.relationship,
      shared_games: connection.shared_games,
      same_team_games: connection.same_team_games,
      opponent_games: connection.opponent_games,
      evening: {
        id: String(evening.id),
        title: String(evening.title || 'Игровой вечер'),
        starts_at: evening.starts_at || null,
        venue: evening.venue || null,
        format: String(evening.format || 'CASUAL'),
      },
    });

    if (suggestions.length >= Math.max(1, Math.min(8, limit))) break;
  }

  return suggestions;
}
