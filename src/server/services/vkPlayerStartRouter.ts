import crypto from 'node:crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import { createVkPlayerOAuthStart } from './vkPlayerAuthService.ts';
import { buildTrustedPublicAppUrl } from './publicAppOriginService.ts';

const router = Router();
export const VK_PLAYER_OAUTH_BINDING_COOKIE = 'vk_player_oauth_binding';
const VK_PLAYER_OAUTH_BINDING_MAX_AGE_MS = 30 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

const safeStartError = (error: any) => {
  const explicitCode = String(error?.code || '').trim();
  if (explicitCode) {
    return {
      code: explicitCode,
      message: String(error?.message || 'Не удалось открыть VK ID').slice(0, 240),
      status: Number(error?.statusCode || 500),
    };
  }
  const message = String(error?.message || '');
  if (message.includes('PLAYER_APP_URL') || message.includes('public application URL')) {
    return { code: 'vk_runtime_origin_missing', message: 'Вход через VK временно не настроен на сервере. Сообщите организатору.', status: 503 };
  }
  if (message.includes('VK_APP_ID')) {
    return { code: 'vk_runtime_app_id_invalid', message: 'VK ID временно недоступен из-за настройки приложения. Сообщите организатору.', status: 503 };
  }
  if (message.includes('HTTPS')) {
    return { code: 'vk_runtime_https_required', message: 'VK ID требует защищённый HTTPS-вход. Сообщите организатору.', status: 503 };
  }
  return { code: 'vk_auth_start_failed', message: 'Не удалось начать вход через VK. Попробуйте ещё раз чуть позже.', status: Number(error?.statusCode || 500) };
};

const logStart = (stage: 'start_ok' | 'start_failed', req: any, details: Record<string, unknown>) => {
  console.info('[VK PLAYER AUTH]', {
    stage,
    method: req.method,
    path: req.originalUrl || req.url,
    secure: Boolean(req.secure),
    forwarded_proto: String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim() || null,
    has_player_session: Boolean(getPlayerSessionId(req)),
    ...details,
  });
};

const browserBindingFor = (req: any, res: any) => {
  const existing = String(req.cookies?.[VK_PLAYER_OAUTH_BINDING_COOKIE] || '').trim();
  if (/^[A-Za-z0-9_-]{32,256}$/.test(existing)) return existing;
  const binding = crypto.randomBytes(32).toString('base64url');
  res.cookie(VK_PLAYER_OAUTH_BINDING_COOKIE, binding, {
    httpOnly: true,
    secure: isProduction(),
    // OAuth returns through a top-level HTTPS GET, for which Lax is the narrowest
    // cookie policy that still carries the browser-binding nonce back to the app.
    sameSite: 'lax',
    path: '/',
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
      if (!player?.nickname) return res.status(401).json({ error: 'Сессия игрока устарела. Войдите снова.', code: 'player_session_invalid' });
      nickname = player.nickname;
    }
    const redirectUri = buildTrustedPublicAppUrl('/api/integrations/vk/oauth/callback', req);
    const result = await createVkPlayerOAuthStart(db, {
      redirectUri,
      nickname,
      returnTo: req.body?.return_to,
      browserBinding: browserBindingFor(req, res),
      initiatingPlayerId,
    });
    res.setHeader('Cache-Control', 'no-store');
    logStart('start_ok', req, {
      return_to: result.return_to,
      callback_origin_matches: redirectUri.startsWith(String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '')),
      binding_cookie_mode: isProduction() ? 'lax-secure' : 'lax-dev',
    });
    return res.json(result);
  } catch (error: any) {
    const safe = safeStartError(error);
    res.setHeader('Cache-Control', 'no-store');
    logStart('start_failed', req, { code: safe.code, status: safe.status });
    return res.status(safe.status).json({ error: safe.message, code: safe.code });
  }
});

export default router;
