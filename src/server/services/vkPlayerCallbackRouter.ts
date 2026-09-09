import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { registerVkPlayer } from './vkJoinRegistrationService.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';
import {
  completeVkPlayerOAuth,
  createVkPlayerIdentityClaim,
  peekVkPlayerOAuthState,
  validateVkPlayerReturnPath,
} from './vkPlayerAuthService.ts';
import { setPlayerSessionCookie } from './playerSessionCookie.ts';
import { resolveTrustedPublicAppOrigin } from './publicAppOriginService.ts';
import { VK_PLAYER_OAUTH_BINDING_COOKIE } from './vkPlayerStartRouter.ts';

const router = Router();

const appendPlayerResult = (returnTo: string, key: string, value: string) => {
  const safe = validateVkPlayerReturnPath(returnTo);
  const url = new URL(safe, 'https://2la-noire.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
};

const safeCallbackError = (error: any) => {
  const code = String(error?.code || '').trim();
  if (code && [
    'vk_callback_invalid',
    'vk_state_expired',
    'vk_state_browser_mismatch',
    'vk_state_mismatch',
    'vk_user_missing',
    'nickname_ambiguous',
    'nickname_not_found',
    'private_confirmation_required',
    'player_vk_conflict',
    'claim_rate_limited',
    'telegram_unavailable',
    'telegram_delivery_failed',
  ].includes(code)) return code;
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('redirect') || message.includes('oauth') || message.includes('vk id') || message.includes('http')) {
    return 'vk_provider_exchange_failed';
  }
  return 'vk_auth_callback_failed';
};

const logCallback = (stage: string, req: any, details: Record<string, unknown> = {}) => {
  console.info('[VK PLAYER AUTH]', {
    stage,
    method: req.method,
    path: req.originalUrl || req.url,
    secure: Boolean(req.secure),
    forwarded_proto: String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim() || null,
    has_binding_cookie: Boolean(req.cookies?.[VK_PLAYER_OAUTH_BINDING_COOKIE]),
    ...details,
  });
};

router.get('/vk/oauth/callback', async (req, res, next) => {
  const db = req.db as DatabaseWrapper;
  const state = String(req.query?.state || '').trim();
  const pending = await peekVkPlayerOAuthState(db, state);
  if (!pending) return next();

  logCallback('callback_received', req, {
    has_code: Boolean(req.query?.code),
    has_device_id: Boolean(req.query?.device_id),
    return_to: pending.return_to,
  });

  try {
    const result = await completeVkPlayerOAuth(db, {
      code: req.query?.code,
      deviceId: req.query?.device_id,
      state,
      browserBinding: req.cookies?.[VK_PLAYER_OAUTH_BINDING_COOKIE],
    });
    logCallback('provider_exchange_ok', req, {
      linked_identity: Boolean(result.playerId),
      initiated_link: Boolean(result.initiatingPlayerId),
    });

    if (result.initiatingPlayerId && result.playerId && result.playerId !== result.initiatingPlayerId) {
      logCallback('callback_failed', req, { code: 'vk_identity_conflict', status: 409 });
      return res.redirect(302, appendPlayerResult(result.returnTo, 'vk_error', 'vk_identity_conflict'));
    }

    let playerId = result.playerId;
    if (!playerId && result.initiatingPlayerId) {
      await linkVkIdentity(db, { vkUserId: result.vkUserId, playerId: result.initiatingPlayerId });
      playerId = result.initiatingPlayerId;
      logCallback('identity_linked_to_initiator', req);
    }

    if (!playerId) {
      try {
        const registration = await registerVkPlayer(db, result.vkUserId, result.nickname);
        playerId = registration.playerId;
        logCallback('new_player_registered', req, { created: Boolean(registration.created) });
      } catch (error: any) {
        if (error?.code !== 'nickname_taken') throw error;
        const claim = await createVkPlayerIdentityClaim(db, {
          vkUserId: result.vkUserId,
          nickname: result.nickname,
          returnTo: result.returnTo,
          baseUrl: resolveTrustedPublicAppOrigin(req),
        });
        logCallback('identity_confirmation_required', req, { pending: Boolean(claim.pending) });
        return res.redirect(302, appendPlayerResult(result.returnTo, 'vk_link_pending', claim.pending ? '1' : '0'));
      }
    }

    // VK can render the cabinet in a cross-site embedded WebView. Opt this VK-issued
    // canonical session into SameSite=None while keeping Secure+HttpOnly in production.
    setPlayerSessionCookie(res, playerId, { crossSiteWebView: true });
    res.clearCookie(VK_PLAYER_OAUTH_BINDING_COOKIE, { path: '/' });
    logCallback('session_issued', req, { return_to: result.returnTo });
    return res.redirect(302, result.returnTo);
  } catch (error: any) {
    const code = safeCallbackError(error);
    logCallback('callback_failed', req, {
      code,
      status: Number(error?.statusCode || 500),
    });
    return res.redirect(302, appendPlayerResult(pending.return_to, 'vk_error', code));
  }
});

export default router;
