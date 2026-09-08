import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import { setPlayerSessionCookie } from './playerSessionCookie.ts';
import { registerVkPlayer } from './vkJoinRegistrationService.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';
import {
  completeVkPlayerOAuth,
  confirmVkPlayerIdentityClaim,
  createVkPlayerIdentityClaim,
  createVkPlayerOAuthStart,
  peekVkPlayerIdentityClaim,
  peekVkPlayerOAuthState,
  validateVkPlayerReturnPath,
} from './vkPlayerAuthService.ts';

const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

const appendQuery = (returnTo: string, key: string, value: string) => {
  const safe = validateVkPlayerReturnPath(returnTo);
  const url = new URL(safe, 'https://2la-noire.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const claimPage = (input: { token: string; nickname?: string; error?: string }) => {
  const action = `/api/integrations/vk/player/claim/${encodeURIComponent(input.token)}`;
  const body = input.error
    ? `<div class="error">${escapeHtml(input.error)}</div>`
    : `<p>Подтвердить связь VK с игровым профилем <strong>«${escapeHtml(input.nickname)}»</strong>?</p><form method="post" action="${action}"><button type="submit">Подтвердить связь</button></form>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>2LA Noire · Связать VK</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0d;color:#fff;font:16px system-ui;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);border:1px solid #ffffff1a;border-radius:24px;background:#ffffff0b;padding:24px;box-sizing:border-box}p{color:#ffffffb5;line-height:1.55}button{width:100%;min-height:52px;border:0;border-radius:16px;background:#2688eb;color:#fff;font-weight:700;font-size:15px}.error{color:#fecdd3;line-height:1.55}</style></head><body><main class="card"><h1>Подтверждение профиля</h1>${body}</main></body></html>`;
};

export function createVkPlayerAuthStartRouter() {
  const router = Router();
  router.post('/start', async (req, res) => {
    try {
      const db = req.db as DatabaseWrapper;
      const result = await createVkPlayerOAuthStart(db, {
        redirectUri: `${baseUrlFor(req)}/api/integrations/vk/oauth/callback`,
        nickname: req.body?.nickname,
        returnTo: req.body?.return_to,
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json(result);
    } catch (error: any) {
      return res.status(Number(error?.statusCode || 500)).json({
        error: error?.message || 'Не удалось открыть VK ID',
        code: error?.code || 'vk_auth_start_failed',
      });
    }
  });
  return router;
}

export function createVkPlayerAuthCallbackRouter() {
  const router = Router();

  router.get('/oauth/callback', async (req, res, next) => {
    const db = req.db as DatabaseWrapper;
    const state = String(req.query?.state || '').trim();
    const pending = await peekVkPlayerOAuthState(db, state);
    if (!pending) return next();

    try {
      const result = await completeVkPlayerOAuth(db, {
        code: req.query?.code,
        deviceId: req.query?.device_id,
        state,
      });
      let playerId = result.playerId;
      if (!playerId) {
        const currentPlayerId = getPlayerSessionId(req);
        if (currentPlayerId) {
          await linkVkIdentity(db, { vkUserId: result.vkUserId, playerId: currentPlayerId });
          playerId = currentPlayerId;
        }
      }
      if (!playerId) {
        try {
          const registration = await registerVkPlayer(db, result.vkUserId, result.nickname);
          playerId = registration.playerId;
        } catch (error: any) {
          if (error?.code !== 'nickname_taken') throw error;
          const claim = await createVkPlayerIdentityClaim(db, {
            vkUserId: result.vkUserId,
            nickname: result.nickname,
            returnTo: result.returnTo,
            baseUrl: baseUrlFor(req),
          });
          return res.redirect(302, appendQuery(result.returnTo, 'vk_link_pending', claim.pending ? '1' : '0'));
        }
      }
      setPlayerSessionCookie(res, playerId);
      return res.redirect(302, result.returnTo);
    } catch (error: any) {
      return res.redirect(302, appendQuery(pending.return_to, 'vk_error', error?.message || 'VK ID failed'));
    }
  });

  router.get('/player/claim/:token', async (req, res) => {
    const claim = await peekVkPlayerIdentityClaim(req.db as DatabaseWrapper, req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    if (!claim) {
      return res.status(410).type('html').send(claimPage({ token: '', error: 'Ссылка подтверждения устарела. Начните вход через VK ещё раз.' }));
    }
    return res.type('html').send(claimPage({ token: req.params.token, nickname: claim.nickname }));
  });

  router.post('/player/claim/:token', async (req, res) => {
    try {
      const result = await confirmVkPlayerIdentityClaim(req.db as DatabaseWrapper, req.params.token);
      setPlayerSessionCookie(res, result.playerId);
      return res.redirect(303, appendQuery(result.returnTo, 'vk_linked', '1'));
    } catch (error: any) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(Number(error?.statusCode || 500)).type('html').send(claimPage({
        token: '',
        error: error?.message || 'Не удалось связать VK с игровым профилем.',
      }));
    }
  });

  return router;
}
