import crypto from 'node:crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import { createVkPlayerOAuthStart } from './vkPlayerAuthService.ts';
import { buildTrustedPublicAppUrl } from './publicAppOriginService.ts';

const router = Router();
const VK_PLAYER_OAUTH_BINDING_COOKIE = 'vk_player_oauth_binding';
const VK_PLAYER_OAUTH_BINDING_MAX_AGE_MS = 30 * 60 * 1000;

const browserBindingFor = (req: any, res: any) => {
  const existing = String(req.cookies?.[VK_PLAYER_OAUTH_BINDING_COOKIE] || '').trim();
  if (/^[A-Za-z0-9_-]{32,256}$/.test(existing)) return existing;
  const binding = crypto.randomBytes(32).toString('base64url');
  res.cookie(VK_PLAYER_OAUTH_BINDING_COOKIE, binding, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/integrations',
    maxAge: VK_PLAYER_OAUTH_BINDING_MAX_AGE_MS,
  });
  return binding;
};

router.post('/player/vk/start', async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const initiatingPlayerId = getPlayerSessionId(req);
    let nickname = req.body?.nickname;
    if (initiatingPlayerId) {
      const player = await db.get<{ nickname: string }>('SELECT nickname FROM players WHERE id = ? LIMIT 1', [initiatingPlayerId]);
      if (!player?.nickname) return res.status(401).json({ error: 'Player authentication required.', code: 'player_session_invalid' });
      nickname = player.nickname;
    }
    const result = await createVkPlayerOAuthStart(db, {
      redirectUri: buildTrustedPublicAppUrl('/api/integrations/vk/oauth/callback', req),
      nickname,
      returnTo: req.body?.return_to,
      browserBinding: browserBindingFor(req, res),
      initiatingPlayerId,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error: any) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось открыть VK ID',
      code: error?.code || 'vk_auth_start_failed',
    });
  }
});

export default router;
