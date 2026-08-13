import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { setVkRuntimeUserToken } from './vkPublishingService.ts';

const DEFAULT_VK_APP_ID = '54719021';
const OAUTH_CREDENTIAL_KEY = 'user';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_EARLY_MS = 2 * 60 * 1000;
const VK_SCOPES = ['wall', 'groups'] as const;
const VK_LEGACY_SCOPES = ['wall', 'groups', 'offline'] as const;
const LEGACY_DEVICE_ID = 'legacy-api';

type OAuthStateRow = {
  state: string;
  verifier: string;
  redirect_uri: string;
  return_to: string;
  expires_at: string;
};

type OAuthCredentialRow = {
  access_token: string;
  refresh_token: string | null;
  device_id: string;
  user_id: string | null;
  scope: string | null;
  expires_at: string | null;
  updated_at: string;
};

type VkTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number | string;
  scope?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

const nowIso = () => new Date().toISOString();

export const getVkOAuthAppId = () => String(process.env.VK_APP_ID || DEFAULT_VK_APP_ID).trim() || DEFAULT_VK_APP_ID;
export const getVkOAuthScopes = () => [...VK_SCOPES];

export const buildVkCodeChallenge = (verifier: string) => crypto
  .createHash('sha256')
  .update(verifier)
  .digest('base64url');

export const encodeVkTokenVerifier = (verifier: string) => verifier;

export const buildVkAuthorizationCodeTokenRequest = (input: {
  appId: string;
  verifier: string;
  redirectUri: string;
  code: string;
  deviceId: string;
  state: string;
}) => {
  const query = new URLSearchParams({
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
    client_id: input.appId,
    code_verifier: encodeVkTokenVerifier(input.verifier),
    state: input.state,
    device_id: input.deviceId,
  });
  const body = new URLSearchParams({ code: input.code });
  return { query, body };
};

const normalizeReturnTo = (value: unknown) => {
  const normalized = String(value || '/').trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return '/';
  return normalized.slice(0, 1500) || '/';
};

export const appendVkOAuthResult = (returnTo: string, key: 'vk_connected' | 'vk_error', value: string) => {
  const safe = normalizeReturnTo(returnTo);
  const hashIndex = safe.indexOf('#');
  const beforeHash = hashIndex >= 0 ? safe.slice(0, hashIndex) : safe;
  const hash = hashIndex >= 0 ? safe.slice(hashIndex) : '';
  const separator = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
};

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

const expiresAtFromPayload = (payload: VkTokenPayload) => {
  const seconds = Number(payload.expires_in || 0);
  return seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
};

const saveCredential = async (db: DatabaseWrapper, payload: VkTokenPayload, deviceId: string, previous?: OAuthCredentialRow | null) => {
  const accessToken = String(payload.access_token || '').trim();
  if (!accessToken) throw new Error('VK не вернул access_token');
  const refreshToken = String(payload.refresh_token || previous?.refresh_token || '').trim() || null;
  const scope = String(payload.scope || previous?.scope || (deviceId === LEGACY_DEVICE_ID ? VK_LEGACY_SCOPES : VK_SCOPES).join(' ')).trim();
  const userId = String(payload.user_id || previous?.user_id || '').trim() || null;
  const expiresAt = expiresAtFromPayload(payload);
  const updatedAt = nowIso();

  await db.run(`
    INSERT INTO vk_oauth_credentials (
      credential_key, access_token, refresh_token, device_id, user_id, scope, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(credential_key) DO UPDATE SET
      access_token=excluded.access_token,
      refresh_token=excluded.refresh_token,
      device_id=excluded.device_id,
      user_id=excluded.user_id,
      scope=excluded.scope,
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at
  `, [OAUTH_CREDENTIAL_KEY, accessToken, refreshToken, deviceId, userId, scope, expiresAt, updatedAt]);

  setVkRuntimeUserToken(accessToken);
  return { user_id: userId, scope, expires_at: expiresAt, api_compatible: deviceId === LEGACY_DEVICE_ID };
};

const createState = async (db: DatabaseWrapper, input: { redirectUri: string; returnTo?: unknown; verifier: string }) => {
  const state = crypto.randomBytes(24).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString();
  const returnTo = normalizeReturnTo(input.returnTo);
  await db.run('DELETE FROM vk_oauth_states WHERE expires_at <= ?', [now.toISOString()]);
  await db.run(`
    INSERT INTO vk_oauth_states (state, verifier, redirect_uri, return_to, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [state, input.verifier, input.redirectUri, returnTo, now.toISOString(), expiresAt]);
  return { state, expiresAt };
};

export async function createVkOAuthStart(db: DatabaseWrapper, input: { redirectUri: string; returnTo?: unknown }) {
  const appId = getVkOAuthAppId();
  if (!/^\d+$/.test(appId)) throw new Error('VK_APP_ID настроен некорректно');
  const redirectUri = String(input.redirectUri || '').trim();
  if (!/^https:\/\//i.test(redirectUri)) throw new Error('VK OAuth callback должен использовать HTTPS');

  const verifier = crypto.randomBytes(48).toString('base64url');
  const { state, expiresAt } = await createState(db, { redirectUri, returnTo: input.returnTo, verifier });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    code_challenge: buildVkCodeChallenge(verifier),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    scope: VK_SCOPES.join(' '),
    state,
    prompt: 'consent',
    provider: 'vkid',
    lang_id: '0',
  });

  return { authorize_url: `https://id.vk.com/authorize?${params.toString()}`, expires_at: expiresAt, app_id: appId };
}

export async function createVkLegacyOAuthStart(db: DatabaseWrapper, input: { redirectUri: string; returnTo?: unknown }) {
  const appId = getVkOAuthAppId();
  const redirectUri = String(input.redirectUri || '').trim();
  if (!/^https:\/\//i.test(redirectUri)) throw new Error('VK OAuth callback должен использовать HTTPS');
  const { state, expiresAt } = await createState(db, { redirectUri, returnTo: input.returnTo, verifier: LEGACY_DEVICE_ID });
  const params = new URLSearchParams({
    client_id: appId,
    display: 'page',
    redirect_uri: redirectUri,
    scope: VK_LEGACY_SCOPES.join(','),
    response_type: 'token',
    v: '5.199',
    state,
    revoke: '1',
  });
  return { authorize_url: `https://oauth.vk.com/authorize?${params.toString()}`, expires_at: expiresAt, app_id: appId };
}

export async function completeVkLegacyOAuth(db: DatabaseWrapper, input: {
  accessToken: unknown;
  expiresIn: unknown;
  userId: unknown;
  state: unknown;
}) {
  const accessToken = String(input.accessToken || '').trim();
  const state = String(input.state || '').trim();
  if (!accessToken || !state) throw new Error('VK API OAuth вернул неполные данные');
  const pending = await db.get<OAuthStateRow>(`
    SELECT state, verifier, redirect_uri, return_to, expires_at FROM vk_oauth_states WHERE state = ? LIMIT 1
  `, [state]);
  if (!pending || pending.verifier !== LEGACY_DEVICE_ID) throw new Error('VK API OAuth-сессия не найдена или уже использована');
  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
    throw new Error('VK API OAuth-сессия истекла. Запусти подключение ещё раз.');
  }
  const payload: VkTokenPayload = {
    access_token: accessToken,
    expires_in: Number(input.expiresIn || 0),
    user_id: String(input.userId || '').trim() || undefined,
    scope: VK_LEGACY_SCOPES.join(' '),
  };
  const credential = await saveCredential(db, payload, LEGACY_DEVICE_ID);
  await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
  return { ...credential, return_to: pending.return_to };
}

export async function completeVkOAuth(db: DatabaseWrapper, input: { code: unknown; deviceId: unknown; state: unknown }) {
  const code = String(input.code || '').trim();
  const deviceId = String(input.deviceId || '').trim();
  const state = String(input.state || '').trim();
  if (!code || !deviceId || !state) throw new Error('VK ID вернул неполный OAuth callback');

  const pending = await db.get<OAuthStateRow>(`
    SELECT state, verifier, redirect_uri, return_to, expires_at FROM vk_oauth_states WHERE state = ? LIMIT 1
  `, [state]);
  if (!pending) throw new Error('VK OAuth-сессия не найдена или уже использована');
  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
    throw new Error('VK OAuth-сессия истекла. Запусти подключение ещё раз.');
  }

  const tokenRequest = buildVkAuthorizationCodeTokenRequest({
    appId: getVkOAuthAppId(), verifier: pending.verifier, redirectUri: pending.redirect_uri, code, deviceId, state,
  });
  try {
    const payload = await requestVkTokens(tokenRequest.query, tokenRequest.body);
    if (payload.state && payload.state !== state) throw new Error('VK ID вернул другой OAuth state');
    const credential = await saveCredential(db, payload, deviceId);
    await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
    return { ...credential, return_to: pending.return_to };
  } catch (error) {
    await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
    throw error;
  }
}

const loadCredential = (db: DatabaseWrapper) => db.get<OAuthCredentialRow>(`
  SELECT access_token, refresh_token, device_id, user_id, scope, expires_at, updated_at
    FROM vk_oauth_credentials WHERE credential_key = ? LIMIT 1
`, [OAUTH_CREDENTIAL_KEY]);

const refreshCredential = async (db: DatabaseWrapper, credential: OAuthCredentialRow) => {
  if (!credential.refresh_token || credential.device_id === LEGACY_DEVICE_ID) return false;
  const refreshState = crypto.randomBytes(16).toString('base64url');
  const query = new URLSearchParams({ grant_type: 'refresh_token', client_id: getVkOAuthAppId(), device_id: credential.device_id, state: refreshState });
  const body = new URLSearchParams({ refresh_token: credential.refresh_token });
  const payload = await requestVkTokens(query, body);
  if (payload.state && payload.state !== refreshState) throw new Error('VK ID вернул другой refresh state');
  await saveCredential(db, payload, credential.device_id, credential);
  return true;
};

export async function hydrateVkOAuthAccessToken(db: DatabaseWrapper): Promise<boolean> {
  if (String(process.env.VK_ACCESS_TOKEN || '').trim()) return true;
  const credential = await loadCredential(db);
  if (!credential?.access_token) { setVkRuntimeUserToken(''); return false; }
  const expiresAt = credential.expires_at ? new Date(credential.expires_at).getTime() : Number.POSITIVE_INFINITY;
  if (expiresAt > Date.now() + REFRESH_EARLY_MS) { setVkRuntimeUserToken(credential.access_token); return true; }
  try { if (await refreshCredential(db, credential)) return true; } catch (error) { console.error('[VK OAUTH] token refresh failed:', error); }
  if (expiresAt > Date.now()) { setVkRuntimeUserToken(credential.access_token); return true; }
  setVkRuntimeUserToken('');
  return false;
}

export async function getVkOAuthStatus(db: DatabaseWrapper) {
  const credential = await loadCredential(db);
  return {
    app_id: getVkOAuthAppId(),
    managed_connected: Boolean(credential?.access_token),
    api_compatible: Boolean(String(process.env.VK_ACCESS_TOKEN || '').trim()) || credential?.device_id === LEGACY_DEVICE_ID,
    token_source: String(process.env.VK_ACCESS_TOKEN || '').trim() ? 'environment' : credential?.device_id === LEGACY_DEVICE_ID ? 'classic_api' : credential?.access_token ? 'vkid' : null,
    user_id: credential?.user_id || null,
    scope: credential?.scope || null,
    expires_at: credential?.expires_at || null,
    updated_at: credential?.updated_at || null,
  };
}

export async function disconnectVkOAuth(db: DatabaseWrapper) {
  await db.run('DELETE FROM vk_oauth_credentials WHERE credential_key = ?', [OAUTH_CREDENTIAL_KEY]);
  setVkRuntimeUserToken('');
  return { success: true };
}
