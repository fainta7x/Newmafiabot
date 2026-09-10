import crypto from 'crypto';
import type { Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  ensureOrganizerPlayerAccessSchema,
  PRIMARY_ORGANIZER_PLAYER_ID,
} from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { getPlayerSessionId } from '../auth.ts';
import { resolveVkJoinSession } from './vkJoinAuthService.ts';

export type VerifiedPlayerIdentity = {
  playerId: string;
  via: 'player_session' | 'vk_session';
};

export class LastOrganizerAccessError extends Error {
  statusCode = 409;
  code = 'last_organizer_access';

  constructor() {
    super('Нельзя отозвать последний оставшийся доступ к CRM организатора');
  }
}

export class PrimaryOrganizerAccessError extends Error {
  statusCode = 409;
  code = 'primary_organizer_access_required';

  constructor() {
    super('Нельзя отозвать доступ к CRM у основного владельца клуба');
  }
}

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

export async function countOrganizerPlayerAccess(db: DatabaseWrapper): Promise<number> {
  await ensureOrganizerPlayerAccessSchema(db);
  const row = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM organizer_player_access');
  return Number(row?.count || 0);
}

export async function setOrganizerPlayerAccess(
  db: DatabaseWrapper,
  input: { playerId: string; enabled: boolean; actorId: string },
): Promise<{ enabled: boolean; changed: boolean }> {
  await ensureOrganizerPlayerAccessSchema(db);
  if (!await playerExists(db, input.playerId)) {
    const error = new Error('Игрок не найден') as Error & { statusCode?: number; code?: string };
    error.statusCode = 404;
    error.code = 'player_not_found';
    throw error;
  }

  if (!input.enabled && input.playerId === PRIMARY_ORGANIZER_PLAYER_ID) {
    throw new PrimaryOrganizerAccessError();
  }

  return db.transaction(async (tx: DatabaseWrapper) => {
    const existing = await tx.get<{ player_id: string }>(
      'SELECT player_id FROM organizer_player_access WHERE player_id = ? LIMIT 1',
      [input.playerId],
    );
    const currentlyEnabled = Boolean(existing?.player_id);
    if (currentlyEnabled === input.enabled) return { enabled: currentlyEnabled, changed: false };

    if (!input.enabled) {
      const total = await tx.get<{ count: number }>('SELECT COUNT(*) AS count FROM organizer_player_access');
      if (Number(total?.count || 0) <= 1) throw new LastOrganizerAccessError();
      await tx.run('DELETE FROM organizer_player_access WHERE player_id = ?', [input.playerId]);
    } else {
      await tx.run(`
        INSERT INTO organizer_player_access (player_id, granted_at, granted_via)
        VALUES (?, ?, 'organizer_crm')
        ON CONFLICT(player_id) DO NOTHING
      `, [input.playerId, new Date().toISOString()]);
    }

    await tx.run(`
      INSERT INTO organizer_player_access_audit (id, player_id, action, actor_id, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `, [
      crypto.randomUUID(),
      input.playerId,
      input.enabled ? 'grant' : 'revoke',
      input.actorId,
      new Date().toISOString(),
    ]);

    return { enabled: input.enabled, changed: true };
  });
}
