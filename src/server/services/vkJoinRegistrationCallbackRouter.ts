import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { completeVkJoinOAuth, peekVkJoinOAuthState } from './vkJoinAuthService.ts';
import { registerVkPlayer } from './vkJoinRegistrationService.ts';
import { appendVkOAuthResult } from './vkOAuthService.ts';
import { getPlayerSessionId } from '../auth.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';

const router = Router();

router.get('/vk/oauth/callback', async (req, res, next) => {
  const db = (req as any).db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  await ensureVkJoinSchema(db);
  const state = String(req.query?.state || '').trim();
  const pending = await peekVkJoinOAuthState(db, state);
  if (!pending) return next();

  try {
    const result = await completeVkJoinOAuth(db, { code: req.query?.code, deviceId: req.query?.device_id, state });
    const returnUrl = new URL(result.return_to, 'https://2la-noire.local');
    const nickname = String(returnUrl.searchParams.get('nickname') || '').trim();
    let playerId = result.player_id;
    if (!playerId) {
      // If the same browser is already authenticated through Telegram/WebApp,
      // both identities have just been proven. Link VK to that canonical player
      // instead of creating a second profile from a typed nickname.
      const authenticatedPlayerId = getPlayerSessionId(req);
      if (authenticatedPlayerId) {
        await linkVkIdentity(db, { vkUserId: result.vk_user_id, playerId: authenticatedPlayerId });
        playerId = authenticatedPlayerId;
      }
    }
    if (!playerId) await registerVkPlayer(db, result.vk_user_id, nickname);
    returnUrl.searchParams.delete('nickname');
    res.cookie('vk_join_session', result.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.redirect(302, `${returnUrl.pathname}${returnUrl.search}`);
  } catch (error: any) {
    return res.redirect(302, appendVkOAuthResult(pending.return_to, 'vk_error', error?.message || 'VK ID failed'));
  }
});

export default router;
