import type { DatabaseWrapper } from '../../db/index.ts';
import { resolveVkJoinSession } from './vkJoinAuthService.ts';
import { loadVkJoinCounts } from './vkJoinRegistrationService.ts';

export async function getVkJoinIdentity(db: DatabaseWrapper, vkSessionToken: unknown, playerSessionId?: string | null) {
  const vkSession = await resolveVkJoinSession(db, vkSessionToken);
  const playerId = vkSession?.player_id || playerSessionId || null;
  const player = playerId ? await db.get<any>('SELECT id,nickname FROM players WHERE id=? LIMIT 1', [playerId]) : null;
  return { player, vkSession };
}

export async function getVkJoinState(db: DatabaseWrapper, eveningId: string, vkSessionToken: unknown, playerSessionId?: string | null) {
  const { player, vkSession } = await getVkJoinIdentity(db, vkSessionToken, playerSessionId);
  const participant = player
    ? await db.get<any>('SELECT response_status FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1', [eveningId, player.id])
    : null;
  return {
    authenticated: Boolean(player),
    player: player ? { id: String(player.id), nickname: String(player.nickname) } : null,
    vk_authenticated: Boolean(vkSession),
    needs_nickname: Boolean(vkSession && !player),
    response_status: String(participant?.response_status || 'unanswered'),
    counts: await loadVkJoinCounts(db, eveningId),
  };
}
