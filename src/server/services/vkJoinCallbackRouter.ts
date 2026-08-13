import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { completeVkJoinOAuth, peekVkJoinOAuthState } from './vkJoinAuthService.ts';
import { appendVkOAuthResult } from './vkOAuthService.ts';

const router = Router();

router.get('/vk/oauth/callback', async (req, res, next) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkJoinSchema(db);
  const state = String(req.query?.state || '').trim();
  const pending = await peekVkJoinOAuthState(db, state);
  if (!pending) return next();

  try {
    const result = await completeVkJoinOAuth(db, {
      code: req.query?.code,
      deviceId: req.query?.device_id,
      state,
    });
    res.cookie('vk_join_session', result.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.redirect(302, result.return_to);
  } catch (error: any) {
    return res.redirect(302, appendVkOAuthResult(pending.return_to, 'vk_error', error?.message || 'VK ID failed'));
  }
});

export default router;
