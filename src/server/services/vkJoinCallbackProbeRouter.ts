import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { completeVkJoinOAuth, peekVkJoinOAuthState } from './vkJoinAuthService.ts';

const router = Router();

router.get('/vk/oauth/callback', async (req, res, next) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkJoinSchema(db);
  const state = String(req.query?.state || '');
  const pending = await peekVkJoinOAuthState(db, state);
  if (!pending) return next();
  await completeVkJoinOAuth(db, { code: req.query?.code, deviceId: req.query?.device_id, state });
  return res.redirect(302, pending.return_to);
});

export default router;
