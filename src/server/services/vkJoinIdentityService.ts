import type { DatabaseWrapper } from '../../db/index.ts';
import { resolveVkJoinSession } from './vkJoinAuthService.ts';
import { loadVkJoinCounts, loadVkJoinParticipants } from './vkJoinRegistrationService.ts';
import { getPendingVkIdentityClaim } from './vkIdentityClaimService.ts';

export async function getVkJoinIdentity(db: DatabaseWrapper, vkSessionToken: unknown, playerSessionId?: string | null) {
  const vkSession = await resolveVkJoinSession(db, vkSessionToken);
  const playerId = vkSession?.player_id || playerSessionId || null;
  const player = playerId ? await db.get<any>('SELECT id,nickname FROM players WHERE id=? LIMIT 1', [playerId]) : null;
  return { player, vkSession };
}

export async function getVkJoinState(db: DatabaseWrapper, eveningId: string, vkSessionToken: unknown, playerSessionId?: string | null) {
  const { player, vkSession } = await getVkJoinIdentity(db, vkSessionToken, playerSessionId);
  const pendingClaim = vkSession && !player
    ? await getPendingVkIdentityClaim(db, vkSession.vk_user_id, eveningId)
    : null;
  const participant = player
    ? await db.get<any>('SELECT response_status FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1', [eveningId, player.id])
    : null;
  const [counts, participants] = await Promise.all([
    loadVkJoinCounts(db, eveningId),
    loadVkJoinParticipants(db, eveningId),
  ]);
  return {
    authenticated: Boolean(player),
    player: player ? { id: String(player.id), nickname: String(player.nickname) } : null,
    vk_authenticated: Boolean(vkSession),
    needs_nickname: Boolean(vkSession && !player),
    link_pending: Boolean(pendingClaim),
    link_player_nickname: pendingClaim?.nickname || null,
    response_status: String(participant?.response_status || 'unanswered'),
    counts,
    participants,
  };
}
