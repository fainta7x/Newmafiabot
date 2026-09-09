import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerOnboardingSchema } from '../../db/ensurePlayerOnboardingSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';

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
  if (!/^\d+$/.test(externalUserId)) {
    throw Object.assign(new Error(`Invalid ${platform} external identity`), {
      statusCode: 400,
      code: 'external_identity_invalid',
    });
  }
  return externalUserId;
};

export async function resolveVerifiedExternalIdentity(
  db: DatabaseWrapper,
  identity: Pick<VerifiedExternalIdentity, 'platform' | 'externalUserId'>,
): Promise<string | null> {
  const externalUserId = normalizeExternalUserId(identity.platform, identity.externalUserId);
  if (identity.platform === 'telegram') {
    const row = await db.get<{ id: string }>(
      'SELECT id FROM players WHERE telegram_user_id = ? LIMIT 1',
      [externalUserId],
    );
    return row?.id ? String(row.id) : null;
  }

  await ensureVkIntegrationSchema(db);
  const row = await db.get<{ player_id: string }>(`
    SELECT player_id
      FROM player_external_identities
     WHERE platform='vk' AND external_user_id=?
     LIMIT 1
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
  const linkedPlayerId = await resolveVerifiedExternalIdentity(db, {
    platform: identity.platform,
    externalUserId,
  });
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
      created_at, expires_at, consumed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(platform, external_user_id) DO UPDATE SET
      token_hash=excluded.token_hash,
      return_to=excluded.return_to,
      identity_json=excluded.identity_json,
      created_at=excluded.created_at,
      expires_at=excluded.expires_at,
      consumed_at=NULL
  `, [tokenHash, identity.platform, externalUserId, returnTo, identityJson, now.toISOString(), expiresAt]);

  return { status: 'onboarding', token: rawToken, returnTo, platform: identity.platform };
}

export async function loadVerifiedPlayerOnboarding(db: DatabaseWrapper, rawToken: unknown) {
  await ensurePlayerOnboardingSchema(db);
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const row = await db.get<any>(`
    SELECT token_hash, platform, external_user_id, return_to, identity_json,
           created_at, expires_at, consumed_at
      FROM player_onboarding_sessions
     WHERE token_hash=? AND consumed_at IS NULL
     LIMIT 1
  `, [hashToken(token)]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  let identity: Record<string, unknown> = {};
  try { identity = JSON.parse(String(row.identity_json || '{}')); } catch {}
  return {
    platform: String(row.platform) as VerifiedOnboardingPlatform,
    externalUserId: String(row.external_user_id),
    returnTo: validatePlayerOnboardingReturnPath(row.return_to),
    identity,
    expiresAt: String(row.expires_at),
  };
}

export async function consumeVerifiedPlayerOnboarding(db: DatabaseWrapper, rawToken: unknown) {
  const token = String(rawToken || '').trim();
  if (!token) return false;
  const now = new Date().toISOString();
  const result = await db.run(`
    UPDATE player_onboarding_sessions
       SET consumed_at=?
     WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?
  `, [now, hashToken(token), now]);
  return Number(result?.changes || 0) === 1;
}
