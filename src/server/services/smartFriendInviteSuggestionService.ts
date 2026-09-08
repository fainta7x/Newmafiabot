import type { DatabaseWrapper } from '../../db/index.ts';
import { loadCachedPlayerConnectionAnalytics } from './playerConnectionAnalyticsService.ts';
import { loadInvitationContextsForRecipients } from './playerInvitationEligibilityService.ts';

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
  const strongestConnections = (await loadCachedPlayerConnectionAnalytics(db, playerId)).slice(0, 12);
  const contexts = await loadInvitationContextsForRecipients(db, playerId, strongestConnections.map((item) => item.player_id));
  const suggestions: SmartFriendInviteSuggestion[] = [];

  for (const connection of strongestConnections) {
    const context = contexts.get(connection.player_id);
    const evening = context?.evenings.find((item) => item.state === 'eligible');
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
        id: evening.id,
        title: evening.title,
        starts_at: evening.starts_at,
        venue: evening.venue,
        format: evening.format,
      },
    });
    if (suggestions.length >= Math.max(1, Math.min(8, limit))) break;
  }
  return suggestions;
}
