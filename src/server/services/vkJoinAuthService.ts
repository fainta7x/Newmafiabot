import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  buildVkAuthorizationCodeTokenRequest,
  buildVkCodeChallenge,
  getVkOAuthAppId,
} from './vkOAuthService.ts';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type JoinOAuthStateRow = {
  state: string;
  verifier: string;
  redirect_uri: string;
  evening_id: string;
  return_to: string;
  expires_at: string;
};

type VkTokenPayload = {
  access_token?: string;
  user_id?: number | string;
  state?: string;
  error?: string;
  error_description?: string;
};

const normalizeReturnTo = (value: unknown, eveningId: string) => {
  const fallback = `/join/${encodeURIComponent(eveningId)}?source=vk`;
  const normalized = String(value || fallback).trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return fallback;
  return normalized.slice(0, 1500) || fallback;
};

const hashSession = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const requestVkTokens = async (query: URLSearchParams, body: URLSearchParams): Promise<VkTokenPayload> => {
  const response = await fetch(`https://id.vk.com/oauth2/auth?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const payload = await response.json().catch(() => ({})) as VkTokenPayload;
  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `VK ID HTTP ${response.status}`);
  }
  return payload;
};

export async function createVkJoinOAuthStart(
  db: DatabaseWrapper,
  input: { redirectUri: string; eveningId: string; returnTo?: unknown },
) {
  const appId = getVkOAuthAppId();
  if (!/^\d+$/.test(appId)) throw new Error('VK_APP_ID настроен некорректно');
  const redirectUri = String(input.redirectUri || '').trim();
  if (!/^https:\/\//i.test(redirectUri)) throw new Error('VK OAuth callback должен использовать HTTPS');
  const eveningId = String(input.eveningId || '').trim();
  if (!eveningId) throw new Error('Игровой вечер не указан');

  const evening = await db.get<{ status: string; settled_at: string | null }>(
    'SELECT status, settled_at FROM game_evenings WHERE id = ? LIMIT 1',
    [eveningId],
  );
  if (!evening) throw Object.assign(new Error('Игровой вечер не найден'), { statusCode: 404 });
  if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
    throw Object.assign(new Error('Запись на этот вечер недоступна'), { statusCode: 410 });
  }

  const now = new Date();
  await db.run('DELETE FROM vk_join_oauth_states WHERE expires_at <= ?', [now.toISOString()]);
  await db.run('DELETE FROM vk_join_sessions WHERE expires_at <= ?', [now.toISOString()]);

  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(now.getTime() + OAUTH_TTL_MS).toISOString();
  const returnTo = normalizeReturnTo(input.returnTo, eveningId);

  await db.run(`
    INSERT INTO vk_join_oauth_states (
      state, verifier, redirect_uri, evening_id, return_to, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [state, verifier, redirectUri, eveningId, returnTo, now.toISOString(), expiresAt]);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    code_challenge: buildVkCodeChallenge(verifier),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    state,
    prompt: 'consent',
    provider: 'vkid',
    lang_id: '0',
  });

  return {
    authorize_url: `https://id.vk.com/authorize?${params.toString()}`,
    expires_at: expiresAt,
    app_id: appId,
  };
}

export async function peekVkJoinOAuthState(db: DatabaseWrapper, state: unknown) {
  const normalized = String(state || '').trim();
  if (!normalized) return null;
  const pending = await db.get<JoinOAuthStateRow>(`
    SELECT state, verifier, redirect_uri, evening_id, return_to, expires_at
      FROM vk_join_oauth_states
     WHERE state = ?
     LIMIT 1
  `, [normalized]);
  if (!pending) return null;
  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await db.run('DELETE FROM vk_join_oauth_states WHERE state = ?', [normalized]);
    return null;
  }
  return pending;
}

export async function completeVkJoinOAuth(
  db: DatabaseWrapper,
  input: { code: unknown; deviceId: unknown; state: unknown },
) {
  const code = String(input.code || '').trim();
  const deviceId = String(input.deviceId || '').trim();
  const state = String(input.state || '').trim();
  if (!code || !deviceId || !state) throw new Error('VK ID вернул неполный OAuth callback');

  const pending = await peekVkJoinOAuthState(db, state);
  if (!pending) throw new Error('VK-сессия записи не найдена или истекла');

  const tokenRequest = buildVkAuthorizationCodeTokenRequest({
    appId: getVkOAuthAppId(),
    verifier: pending.verifier,
    redirectUri: pending.redirect_uri,
    code,
    deviceId,
    state,
  });

  try {
    const payload = await requestVkTokens(tokenRequest.query, tokenRequest.body);
    if (payload.state && payload.state !== state) throw new Error('VK ID вернул другой OAuth state');
    const vkUserId = String(payload.user_id || '').trim();
    if (!/^\d+$/.test(vkUserId)) throw new Error('VK ID не вернул идентификатор пользователя');

    const now = new Date();
    const rawSession = crypto.randomBytes(32).toString('base64url');
    const sessionHash = hashSession(rawSession);
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM vk_join_oauth_states WHERE state = ?', [state]);
      await tx.run('DELETE FROM vk_join_sessions WHERE expires_at <= ?', [now.toISOString()]);
      await tx.run(
        `INSERT INTO vk_join_sessions (session_hash, vk_user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
        [sessionHash, vkUserId, now.toISOString(), sessionExpiresAt],
      );
    });

    const linked = await db.get<{ player_id: string }>(`
      SELECT player_id
        FROM player_external_identities
       WHERE platform = 'vk' AND external_user_id = ?
       LIMIT 1
    `, [vkUserId]);

    return {
      return_to: pending.return_to,
      evening_id: pending.evening_id,
      session_token: rawSession,
      session_expires_at: sessionExpiresAt,
      vk_user_id: vkUserId,
      player_id: linked?.player_id ? String(linked.player_id) : null,
    };
  } catch (error) {
    await db.run('DELETE FROM vk_join_oauth_states WHERE state = ?', [state]);
    throw error;
  }
}

export async function resolveVkJoinSession(db: DatabaseWrapper, rawToken: unknown) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const now = new Date().toISOString();
  const session = await db.get<{ vk_user_id: string; expires_at: string }>(`
    SELECT vk_user_id, expires_at
      FROM vk_join_sessions
     WHERE session_hash = ? AND expires_at > ?
     LIMIT 1
  `, [hashSession(token), now]);
  if (!session) return null;

  const linked = await db.get<{ player_id: string }>(`
    SELECT player_id
      FROM player_external_identities
     WHERE platform = 'vk' AND external_user_id = ?
     LIMIT 1
  `, [String(session.vk_user_id)]);

  return {
    vk_user_id: String(session.vk_user_id),
    player_id: linked?.player_id ? String(linked.player_id) : null,
    expires_at: session.expires_at,
  };
}
