import type { Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureOrganizerPlayerAccessSchema } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { getPlayerSessionId } from '../auth.ts';
import { resolveVkJoinSession } from './vkJoinAuthService.ts';

export type VerifiedPlayerIdentity = {
  playerId: string;
  via: 'player_session' | 'vk_session';
};

const playerExists = async (db: DatabaseWrapper, playerId: string) => {
  const row = await db.get<{ id: string }>('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
  return Boolean(row?.id);
};

/**
 * Resolve only server-verified identities. Never accepts player_id, Telegram ID,
 * VK ID, username or screen name from request input.
 */
export async function resolveVerifiedPlayerIdentity(
  db: DatabaseWrapper,
  req: Request,
): Promise<VerifiedPlayerIdentity | null> {
  const playerSessionId = getPlayerSessionId(req);
  if (playerSessionId && await playerExists(db, playerSessionId)) {
    return { playerId: playerSessionId, via: 'player_session' };
  }

  const vkSession = await resolveVkJoinSession(db, req.cookies?.vk_join_session);
  const vkPlayerId = String(vkSession?.player_id || '').trim();
  if (vkPlayerId && await playerExists(db, vkPlayerId)) {
    return { playerId: vkPlayerId, via: 'vk_session' };
  }

  return null;
}

export async function grantOrganizerPlayerAccess(
  db: DatabaseWrapper,
  identity: VerifiedPlayerIdentity,
): Promise<void> {
  await ensureOrganizerPlayerAccessSchema(db);
  await db.run(`
    INSERT INTO organizer_player_access (player_id, granted_at, granted_via)
    VALUES (?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      granted_at = excluded.granted_at,
      granted_via = excluded.granted_via
  `, [identity.playerId, new Date().toISOString(), identity.via]);
}

export async function hasOrganizerPlayerAccess(db: DatabaseWrapper, playerId: string): Promise<boolean> {
  await ensureOrganizerPlayerAccessSchema(db);
  const row = await db.get<{ player_id: string }>(
    'SELECT player_id FROM organizer_player_access WHERE player_id = ? LIMIT 1',
    [playerId],
  );
  return Boolean(row?.player_id);
}
