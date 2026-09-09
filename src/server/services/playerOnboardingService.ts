import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerOnboardingSchema } from '../../db/ensurePlayerOnboardingSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import {
  findPlayersByNickname,
  registerVerifiedPlayerIdentity,
} from './playerRegistrationService.ts';
import { createVkPlayerIdentityClaim } from './vkPlayerAuthService.ts';

export type VerifiedOnboardingPlatform = 'telegram' | 'vk';

export type VerifiedExternalIdentity = {
  platform: VerifiedOnboardingPlatform;
  externalUserId: string;
  username?: string | null;
  displayName?: string | null;
};

export type VerifiedOnboardingStart =
  | { status: 'linked'; playerId: string; returnTo: string }
  | { status: 'onboarding'; token: string; returnTo: string; platform: VerifiedOnboardingPlatform };

const ONBOARDING_TTL_MS = 20 * 60 * 1000;
const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const onboardingError = (code: string, message: string, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const PRIVATE_CONFIRMATION_UNAVAILABLE_CODES = new Set(['telegram_unavailable', 'telegram_delivery_failed']);

export function validatePlayerOnboardingReturnPath(value: unknown): string {
  const raw = String(value || '/player').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/player';
  try {
    const url = new URL(raw, 'https://2la-noire.local');
    if (url.origin !== 'https://2la-noire.local') return '/player';
    if (url.pathname !== '/player' && !url.pathname.startsWith('/player/')) return '/player';
    return `${url.pathname}${url.search}${url.hash}`.slice(0, 1500) || '/player';
  } catch {
    return '/player';
  }
}

const normalizeExternalUserId = (platform: VerifiedOnboardingPlatform, value: unknown) => {
  const externalUserId = String(value || '').trim();
  if (!/^\d+$/.test(externalUserId)) throw onboardingError('external_identity_invalid', `Invalid ${platform} external identity`);
  return externalUserId;
};

const parseIdentityJson = (raw: unknown) => {
  try { return JSON.parse(String(raw || '{}')) as { username?: string | null; display_name?: string | null }; }
  catch { return {} as { username?: string | null; display_name?: string | null }; }
};

const loadOnboardingRow = async (db: DatabaseWrapper, rawToken: unknown) => {
  await ensurePlayerOnboardingSchema(db);
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return db.get<any>(`
    SELECT token_hash, platform, external_user_id, return_to, identity_json,
           completion_kind, completed_player_id, completed_link_request_id, completed_at,
           created_at, expires_at, consumed_at
      FROM player_onboarding_sessions
     WHERE token_hash=?
     LIMIT 1
  `, [hashToken(token)]);
};

const markOnboardingComplete = async (db: DatabaseWrapper, rawToken: string, input: {
  kind: string;
  playerId?: string | null;
  linkRequestId?: string | null;
}) => {
  const now = new Date().toISOString();
  return db.run(`
    UPDATE player_onboarding_sessions
       SET consumed_at=?, completion_kind=?, completed_player_id=?, completed_link_request_id=?, completed_at=?
     WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?
  `, [now, input.kind, input.playerId || null, input.linkRequestId || null, now, hashToken(rawToken), now]);
};

export async function resolveVerifiedExternalIdentity(
  db: DatabaseWrapper,
  identity: Pick<VerifiedExternalIdentity, 'platform' | 'externalUserId'>,
): Promise<string | null> {
  const externalUserId = normalizeExternalUserId(identity.platform, identity.externalUserId);
  if (identity.platform === 'telegram') {
    const row = await db.get<{ id: string }>('SELECT id FROM players WHERE telegram_user_id = ? LIMIT 1', [externalUserId]);
    return row?.id ? String(row.id) : null;
  }
  await ensureVkIntegrationSchema(db);
  const row = await db.get<{ player_id: string }>(`
    SELECT player_id FROM player_external_identities
     WHERE platform='vk' AND external_user_id=? LIMIT 1
  `, [externalUserId]);
  return row?.player_id ? String(row.player_id) : null;
}

export async function beginVerifiedPlayerOnboarding(
  db: DatabaseWrapper,
  identity: VerifiedExternalIdentity,
  returnToInput?: unknown,
): Promise<VerifiedOnboardingStart> {
  await ensurePlayerOnboardingSchema(db);
  const externalUserId = normalizeExternalUserId(identity.platform, identity.externalUserId);
  const returnTo = validatePlayerOnboardingReturnPath(returnToInput);
  const linkedPlayerId = await resolveVerifiedExternalIdentity(db, { platform: identity.platform, externalUserId });
  if (linkedPlayerId) return { status: 'linked', playerId: linkedPlayerId, returnTo };

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ONBOARDING_TTL_MS).toISOString();
  const identityJson = JSON.stringify({
    username: identity.username ? String(identity.username).slice(0, 64) : null,
    display_name: identity.displayName ? String(identity.displayName).slice(0, 120) : null,
  });

  await db.run('DELETE FROM player_onboarding_sessions WHERE expires_at <= ?', [now.toISOString()]);
  await db.run(`
    INSERT INTO player_onboarding_sessions (
      token_hash, platform, external_user_id, return_to, identity_json,
      completion_kind, completed_player_id, completed_link_request_id, completed_at,
      created_at, expires_at, consumed_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL)
    ON CONFLICT(platform, external_user_id) DO UPDATE SET
      token_hash=excluded.token_hash, return_to=excluded.return_to, identity_json=excluded.identity_json,
      completion_kind=NULL, completed_player_id=NULL, completed_link_request_id=NULL, completed_at=NULL,
      created_at=excluded.created_at, expires_at=excluded.expires_at, consumed_at=NULL
  `, [tokenHash, identity.platform, externalUserId, returnTo, identityJson, now.toISOString(), expiresAt]);

  return { status: 'onboarding', token: rawToken, returnTo, platform: identity.platform };
}

export async function loadVerifiedPlayerOnboarding(db: DatabaseWrapper, rawToken: unknown) {
  const row = await loadOnboardingRow(db, rawToken);
  if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  return {
    platform: String(row.platform) as VerifiedOnboardingPlatform,
    externalUserId: String(row.external_user_id),
    returnTo: validatePlayerOnboardingReturnPath(row.return_to),
    identity: parseIdentityJson(row.identity_json),
    expiresAt: String(row.expires_at),
  };
}

export async function consumeVerifiedPlayerOnboarding(db: DatabaseWrapper, rawToken: unknown) {
  const token = String(rawToken || '').trim();
  if (!token) return false;
  const now = new Date().toISOString();
  const result = await db.run(`UPDATE player_onboarding_sessions SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?`, [now, hashToken(token), now]);
  return Number(result?.changes || 0) === 1;
}

export async function completeVerifiedNewPlayerOnboarding(db: DatabaseWrapper, rawTokenInput: unknown, nickname: unknown) {
  const rawToken = String(rawTokenInput || '').trim();
  const row = await loadOnboardingRow(db, rawToken);
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) throw onboardingError('onboarding_expired', 'Сессия регистрации устарела. Подтвердите аккаунт ещё раз.', 410);
  const returnTo = validatePlayerOnboardingReturnPath(row.return_to);
  if (row.consumed_at) {
    if (row.completed_player_id) return { status: 'linked' as const, playerId: String(row.completed_player_id), created: false, returnTo };
    throw onboardingError('onboarding_consumed', 'Эта сессия регистрации уже завершена.', 409);
  }

  const platform = String(row.platform) as VerifiedOnboardingPlatform;
  const externalUserId = String(row.external_user_id);
  const linked = await resolveVerifiedExternalIdentity(db, { platform, externalUserId });
  if (linked) {
    await markOnboardingComplete(db, rawToken, { kind: 'linked', playerId: linked });
    return { status: 'linked' as const, playerId: linked, created: false, returnTo };
  }
  const identity = parseIdentityJson(row.identity_json);
  const result = await registerVerifiedPlayerIdentity(db, {
    platform,
    externalUserId,
    username: identity.username || null,
    fullName: identity.display_name || null,
    nickname: String(nickname || ''),
    source: `${platform}_verified_onboarding`,
  });
  await markOnboardingComplete(db, rawToken, { kind: 'new_player', playerId: result.player.id });
  return { status: 'created' as const, playerId: result.player.id, created: result.created, returnTo };
}

export async function requestExistingPlayerOnboardingLink(db: DatabaseWrapper, rawTokenInput: unknown, nicknameInput: unknown, options: { baseUrl?: string } = {}) {
  const rawToken = String(rawTokenInput || '').trim();
  const row = await loadOnboardingRow(db, rawToken);
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) throw onboardingError('onboarding_expired', 'Сессия привязки устарела. Подтвердите аккаунт ещё раз.', 410);
  const returnTo = validatePlayerOnboardingReturnPath(row.return_to);
  if (row.consumed_at) {
    if (row.completed_link_request_id) return { status: 'pending_organizer' as const, requestId: String(row.completed_link_request_id), returnTo };
    if (row.completion_kind === 'private_confirmation' && row.completed_player_id) return { status: 'private_confirmation' as const, playerId: String(row.completed_player_id), returnTo };
    if (row.completed_player_id) return { status: 'linked' as const, playerId: String(row.completed_player_id), returnTo };
    throw onboardingError('onboarding_consumed', 'Эта сессия привязки уже завершена.', 409);
  }

  const platform = String(row.platform) as VerifiedOnboardingPlatform;
  const externalUserId = String(row.external_user_id);
  const linked = await resolveVerifiedExternalIdentity(db, { platform, externalUserId });
  if (linked) {
    await markOnboardingComplete(db, rawToken, { kind: 'linked', playerId: linked });
    return { status: 'linked' as const, playerId: linked, returnTo };
  }

  const nickname = String(nicknameInput || '').trim().replace(/\s+/g, ' ');
  const matches = await findPlayersByNickname(db, nickname);
  if (matches.length === 0) throw onboardingError('nickname_not_found', 'Игрок с таким ником не найден.', 404);
  if (matches.length > 1) throw onboardingError('nickname_ambiguous', 'Найдено несколько профилей с таким ником. Нужна проверка организатора.', 409);
  const target = matches[0];

  if (platform === 'vk') {
    await ensureVkIntegrationSchema(db);
    const targetVk = await db.get<{ external_user_id: string }>(`SELECT external_user_id FROM player_external_identities WHERE platform='vk' AND player_id=? LIMIT 1`, [target.id]);
    if (targetVk && String(targetVk.external_user_id) !== externalUserId) {
      throw onboardingError('target_vk_conflict', 'Этот игровой профиль уже связан с другим VK.', 409);
    }
    if (target.telegram_user_id && options.baseUrl) {
      try {
        const claim = await createVkPlayerIdentityClaim(db, { vkUserId: externalUserId, nickname: target.nickname, returnTo, baseUrl: options.baseUrl });
        if (!claim.pending && claim.playerId) {
          await markOnboardingComplete(db, rawToken, { kind: 'linked', playerId: claim.playerId });
          return { status: 'linked' as const, playerId: claim.playerId, returnTo };
        }
        await markOnboardingComplete(db, rawToken, { kind: 'private_confirmation', playerId: target.id });
        return { status: 'private_confirmation' as const, playerId: target.id, returnTo };
      } catch (error: any) {
        if (!PRIVATE_CONFIRMATION_UNAVAILABLE_CODES.has(String(error?.code || ''))) throw error;
        // Safe self-service proof is unavailable. The verified VK identity remains
        // unlinked and the same request falls through to organizer review.
      }
    }
  }

  const existing = await db.get<{ id: string }>(`
    SELECT id FROM player_onboarding_link_requests
     WHERE platform=? AND external_user_id=? AND status='pending'
     ORDER BY created_at DESC LIMIT 1
  `, [platform, externalUserId]);
  const requestId = existing?.id ? String(existing.id) : crypto.randomUUID();
  if (!existing) {
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO player_onboarding_link_requests (
        id, platform, external_user_id, target_player_id, nickname, return_to, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [requestId, platform, externalUserId, target.id, target.nickname, returnTo, now, now]);
  }
  await markOnboardingComplete(db, rawToken, { kind: 'pending_link', linkRequestId: requestId });
  return { status: 'pending_organizer' as const, requestId, targetPlayerId: target.id, returnTo };
}
