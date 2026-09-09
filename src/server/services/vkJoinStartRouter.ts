import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { createVkJoinOAuthStart, resolveVkJoinSession } from './vkJoinAuthService.ts';
import { createVkIdentityClaim } from './vkIdentityClaimService.ts';
import { createVkPlayerOAuthStart } from './vkPlayerAuthService.ts';

const router = Router();
const VK_PLAYER_OAUTH_BINDING_COOKIE = 'vk_player_oauth_binding';
const VK_PLAYER_OAUTH_BINDING_MAX_AGE_MS = 30 * 60 * 1000;
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;
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
    const result = await createVkPlayerOAuthStart(db, {
      redirectUri: `${baseUrlFor(req)}/api/integrations/vk/oauth/callback`,
      nickname: req.body?.nickname,
      returnTo: req.body?.return_to,
      browserBinding: browserBindingFor(req, res),
      initiatingPlayerId: getPlayerSessionId(req),
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

router.post('/evenings/:id/vk/start', async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await ensureVkJoinSchema(db);
    const nickname = String(req.body?.nickname || '').trim().replace(/\s+/g, ' ');
    if (!nickname || nickname.length > 60) return res.status(400).json({ error: 'Введите игровой ник' });
    const returnTo = `/join/${encodeURIComponent(req.params.id)}?source=vk&nickname=${encodeURIComponent(nickname)}`;
    return res.json(await createVkJoinOAuthStart(db, {
      redirectUri: `${baseUrlFor(req)}/api/integrations/vk/oauth/callback`,
      eveningId: req.params.id,
      returnTo,
    }));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось открыть VK ID' });
  }
});

router.post('/evenings/:id/vk/claim', async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await ensureVkJoinSchema(db);
    const session = await resolveVkJoinSession(db, req.cookies?.vk_join_session);
    if (!session) return res.status(401).json({ error: 'Сначала подтвердите вход через VK ID', code: 'vk_auth_required' });
    if (session.player_id) return res.json({ success: true, pending: false, linked: true });
    const result = await createVkIdentityClaim(db, {
      vkUserId: session.vk_user_id,
      nickname: req.body?.nickname,
      eveningId: req.params.id,
      baseUrl: baseUrlFor(req),
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось отправить подтверждение в MafiaBot',
      code: error?.code || 'claim_failed',
    });
  }
});

export default router;