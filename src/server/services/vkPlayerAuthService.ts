import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { ensureVkPlayerAuthSchema } from '../../db/ensureVkPlayerAuthSchema.ts';
import { findPlayersByNickname } from './playerRegistrationService.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';
import {
  buildVkAuthorizationCodeTokenRequest,
  buildVkCodeChallenge,
  getVkOAuthAppId,
} from './vkOAuthService.ts';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const OAUTH_START_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const OAUTH_START_RATE_LIMIT_COUNT = 5;
const CLAIM_TTL_MS = 15 * 60 * 1000;
const CLAIM_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const CLAIM_RATE_LIMIT_COUNT = 3;

export type VkPlayerOAuthState = {
  state: string;
  verifier: string;
  redirect_uri: string;
  nickname: string;
  return_to: string;
  browser_binding_hash: string | null;
  initiating_player_id: string | null;
  consumed_at: string | null;
  created_at: string;
  expires_at: string;
};

type VkTokenPayload = {
  access_token?: string;
  user_id?: number | string;
  state?: string;
  error?: string;
  error_description?: string;
};

type VkPlayerClaimRow = {
  token_hash: string;
  vk_user_id: string;
  player_id: string;
  return_to: string;
  expires_at: string;
  confirmed_at: string | null;
  nickname?: string;
};

const claimError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const bindingMatches = (expectedHash: string | null | undefined, rawBinding: string) => {
  if (!expectedHash || !rawBinding) return false;
  const actual = hashToken(rawBinding);
  const expectedBuffer = Buffer.from(String(expectedHash));
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

export function validateVkPlayerReturnPath(value: unknown): string {
  const fallback = '/player';
  const raw = String(value || fallback).trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  let url: URL;
  try {
    url = new URL(raw, 'https://2la-noire.local');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://2la-noire.local') return fallback;
  if (url.pathname !== '/player' && !url.pathname.startsWith('/player/')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`.slice(0, 1500) || fallback;
}

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

export async function createVkPlayerOAuthStart(
  db: DatabaseWrapper,
  input: {
    redirectUri: string;
    nickname: unknown;
    returnTo?: unknown;
    browserBinding: unknown;
    initiatingPlayerId?: string | null;
  },
) {
  await ensureVkIntegrationSchema(db);
  await ensureVkPlayerAuthSchema(db);
  const appId = getVkOAuthAppId();
  if (!/^\d+$/.test(appId)) throw new Error('VK_APP_ID настроен некорректно');
  const redirectUri = String(input.redirectUri || '').trim();
  if (!/^https:\/\//i.test(redirectUri)) throw new Error('VK OAuth callback должен использовать HTTPS');
  const nickname = String(input.nickname || '').trim().replace(/\s+/g, ' ');
  if (!nickname) throw claimError('Введите игровой ник', 400, 'nickname_required');
  if (nickname.length > 60 || /[\u0000-\u001f\u007f]/.test(nickname)) {
    throw claimError('Некорректный игровой ник', 400, 'nickname_invalid');
  }
  const browserBinding = String(input.browserBinding || '').trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(browserBinding)) {
    throw claimError('Не удалось защитить VK OAuth-сессию. Обновите страницу и попробуйте снова.', 400, 'vk_browser_binding_invalid');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const browserBindingHash = hashToken(browserBinding);
  await db.run('DELETE FROM vk_player_oauth_states WHERE expires_at <= ?', [nowIso]);
  const recent = await db.get<{ count: number }>(`
    SELECT COUNT(*) AS count FROM vk_player_oauth_states
     WHERE browser_binding_hash=? AND created_at>?
  `, [browserBindingHash, new Date(now.getTime() - OAUTH_START_RATE_LIMIT_WINDOW_MS).toISOString()]);
  if (Number(recent?.count || 0) >= OAUTH_START_RATE_LIMIT_COUNT) {
    throw claimError('Слишком много попыток входа через VK. Повторите немного позже.', 429, 'vk_auth_start_rate_limited');
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(now.getTime() + OAUTH_TTL_MS).toISOString();
  const returnTo = validateVkPlayerReturnPath(input.returnTo);
  const initiatingPlayerId = input.initiatingPlayerId ? String(input.initiatingPlayerId) : null;
  await db.run(`
    INSERT INTO vk_player_oauth_states (
      state, verifier, redirect_uri, nickname, return_to,
      browser_binding_hash, initiating_player_id, consumed_at, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `, [state, verifier, redirectUri, nickname, returnTo, browserBindingHash, initiatingPlayerId, nowIso, expiresAt]);

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
    return_to: returnTo,
  };
}

export async function peekVkPlayerOAuthState(db: DatabaseWrapper, stateInput: unknown) {
  await ensureVkPlayerAuthSchema(db);
  const state = String(stateInput || '').trim();
  if (!state) return null;
  const pending = await db.get<VkPlayerOAuthState>(`
    SELECT state, verifier, redirect_uri, nickname, return_to,
           browser_binding_hash, initiating_player_id, consumed_at, created_at, expires_at
      FROM vk_player_oauth_states
     WHERE state=? AND consumed_at IS NULL
     LIMIT 1
  `, [state]);
  if (!pending) return null;
  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await db.run('DELETE FROM vk_player_oauth_states WHERE state=?', [state]);
    return null;
  }
  return pending;
}

export async function completeVkPlayerOAuth(
  db: DatabaseWrapper,
  input: { code: unknown; deviceId: unknown; state: unknown; browserBinding: unknown },
) {
  await ensureVkIntegrationSchema(db);
  await ensureVkPlayerAuthSchema(db);
  const code = String(input.code || '').trim();
  const deviceId = String(input.deviceId || '').trim();
  const state = String(input.state || '').trim();
  const browserBinding = String(input.browserBinding || '').trim();
  if (!code || !deviceId || !state) throw claimError('VK ID вернул неполный OAuth callback', 400, 'vk_callback_invalid');
  const pending = await peekVkPlayerOAuthState(db, state);
  if (!pending) throw claimError('VK OAuth-сессия не найдена или уже использована', 410, 'vk_state_expired');
  if (!bindingMatches(pending.browser_binding_hash, browserBinding)) {
    throw claimError('Эта VK OAuth-сессия была начата в другом браузере. Начните вход заново.', 401, 'vk_state_browser_mismatch');
  }

  // Consume before exchanging the code so retries or parallel callbacks cannot create/link two players.
  const consumedAt = new Date().toISOString();
  const consumed = await db.run(`
    UPDATE vk_player_oauth_states
       SET consumed_at=?
     WHERE state=? AND consumed_at IS NULL AND expires_at>?
  `, [consumedAt, state, consumedAt]);
  if (Number(consumed?.changes || 0) !== 1) {
    throw claimError('VK OAuth-сессия не найдена или уже использована', 410, 'vk_state_expired');
  }

  const tokenRequest = buildVkAuthorizationCodeTokenRequest({
    appId: getVkOAuthAppId(),
    verifier: pending.verifier,
    redirectUri: pending.redirect_uri,
    code,
    deviceId,
    state,
  });
  const payload = await requestVkTokens(tokenRequest.query, tokenRequest.body);
  if (payload.state && payload.state !== state) throw claimError('VK ID вернул другой OAuth state', 401, 'vk_state_mismatch');
  const vkUserId = String(payload.user_id || '').trim();
  if (!/^\d+$/.test(vkUserId)) throw claimError('VK ID не вернул идентификатор пользователя', 401, 'vk_user_missing');

  const linked = await db.get<{ player_id: string }>(`
    SELECT player_id FROM player_external_identities
     WHERE platform='vk' AND external_user_id=? LIMIT 1
  `, [vkUserId]);
  return {
    vkUserId,
    playerId: linked?.player_id ? String(linked.player_id) : null,
    initiatingPlayerId: pending.initiating_player_id ? String(pending.initiating_player_id) : null,
    nickname: pending.nickname,
    returnTo: validateVkPlayerReturnPath(pending.return_to),
  };
}

async function sendTelegramClaimConfirmation(input: {
  telegramUserId: string;
  nickname: string;
  confirmationUrl: string;
}) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!botToken) throw claimError('Подтверждение профиля сейчас недоступно. Обратитесь к организатору.', 503, 'telegram_unavailable');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.telegramUserId,
      text: `VK просит связать аккаунт с игровым профилем «${input.nickname}». Если это вы — подтвердите связь.`,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '✅ Это я — связать VK', url: input.confirmationUrl }]] },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean };
  if (!response.ok || payload.ok !== true) {
    throw claimError('Не удалось отправить подтверждение в привязанный Telegram. Обратитесь к организатору.', 409, 'telegram_delivery_failed');
  }
}

export async function createVkPlayerIdentityClaim(db: DatabaseWrapper, input: {
  vkUserId: string;
  nickname: unknown;
  returnTo: unknown;
  baseUrl: string;
}) {
  await ensureVkPlayerAuthSchema(db);
  const vkUserId = String(input.vkUserId || '').trim();
  const nickname = String(input.nickname || '').trim().replace(/\s+/g, ' ');
  if (!/^\d+$/.test(vkUserId) || !nickname) throw claimError('Некорректные данные привязки', 400, 'claim_invalid');

  const existing = await db.get<{ player_id: string }>(`
    SELECT player_id FROM player_external_identities
     WHERE platform='vk' AND external_user_id=? LIMIT 1
  `, [vkUserId]);
  if (existing?.player_id) return { pending: false, playerId: String(existing.player_id) };

  const matches = await findPlayersByNickname(db, nickname);
  if (matches.length !== 1) {
    throw claimError(
      matches.length > 1 ? 'Найдено несколько профилей с таким ником. Обратитесь к организатору.' : 'Игрок с таким ником не найден.',
      409,
      matches.length > 1 ? 'nickname_ambiguous' : 'nickname_not_found',
    );
  }
  const player = matches[0];
  if (!player.telegram_user_id) {
    throw claimError('Этот ник уже занят. Для безопасной привязки VK обратитесь к организатору.', 409, 'private_confirmation_required');
  }
  const [playerVk, recent] = await Promise.all([
    db.get<{ external_user_id: string }>(`
      SELECT external_user_id FROM player_external_identities
       WHERE platform='vk' AND player_id=? LIMIT 1
    `, [player.id]),
    db.get<{ count: number }>(`
      SELECT COUNT(*) AS count FROM vk_player_identity_claims
       WHERE (vk_user_id=? OR player_id=?) AND created_at>?
    `, [vkUserId, player.id, new Date(Date.now() - CLAIM_RATE_LIMIT_WINDOW_MS).toISOString()]),
  ]);
  if (playerVk && String(playerVk.external_user_id) !== vkUserId) {
    throw claimError('Этот игровой профиль уже связан с другим VK.', 409, 'player_vk_conflict');
  }
  if (Number(recent?.count || 0) >= CLAIM_RATE_LIMIT_COUNT) {
    throw claimError('Подтверждение уже отправлялось. Проверьте Telegram или повторите позже.', 429, 'claim_rate_limited');
  }

  const now = new Date();
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS).toISOString();
  const returnTo = validateVkPlayerReturnPath(input.returnTo);
  await db.run(`
    INSERT INTO vk_player_identity_claims (
      token_hash, vk_user_id, player_id, return_to, created_at, expires_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL)
  `, [hashToken(rawToken), vkUserId, player.id, returnTo, now.toISOString(), expiresAt]);

  const baseUrl = String(input.baseUrl || '').replace(/\/$/, '');
  try {
    await sendTelegramClaimConfirmation({
      telegramUserId: String(player.telegram_user_id),
      nickname: player.nickname,
      confirmationUrl: `${baseUrl}/api/integrations/vk/player/claim/${encodeURIComponent(rawToken)}`,
    });
  } catch (error) {
    await db.run('DELETE FROM vk_player_identity_claims WHERE token_hash=?', [hashToken(rawToken)]);
    throw error;
  }
  return { pending: true, playerId: player.id, nickname: player.nickname, expiresAt, returnTo };
}

export async function peekVkPlayerIdentityClaim(db: DatabaseWrapper, rawToken: unknown) {
  await ensureVkPlayerAuthSchema(db);
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return db.get<VkPlayerClaimRow>(`
    SELECT claim.*, player.nickname
      FROM vk_player_identity_claims claim
      JOIN players player ON player.id=claim.player_id
     WHERE claim.token_hash=? AND claim.expires_at>? AND claim.confirmed_at IS NULL
     LIMIT 1
  `, [hashToken(token), new Date().toISOString()]);
}

export async function confirmVkPlayerIdentityClaim(db: DatabaseWrapper, rawToken: unknown) {
  const claim = await peekVkPlayerIdentityClaim(db, rawToken);
  if (!claim) throw claimError('Ссылка подтверждения устарела или уже использована. Начните вход через VK ещё раз.', 410, 'claim_expired');

  const confirmedAt = new Date().toISOString();
  const consumed = await db.run(`
    UPDATE vk_player_identity_claims
       SET confirmed_at=?
     WHERE token_hash=? AND confirmed_at IS NULL AND expires_at>?
  `, [confirmedAt, claim.token_hash, confirmedAt]);
  if (Number(consumed?.changes || 0) !== 1) {
    throw claimError('Ссылка подтверждения устарела или уже использована. Начните вход через VK ещё раз.', 410, 'claim_expired');
  }

  await linkVkIdentity(db, { vkUserId: claim.vk_user_id, playerId: claim.player_id });
  return {
    vkUserId: claim.vk_user_id,
    playerId: claim.player_id,
    nickname: claim.nickname || '',
    returnTo: validateVkPlayerReturnPath(claim.return_to),
  };
}
