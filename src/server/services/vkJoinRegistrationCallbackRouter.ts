import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { completeVkJoinOAuth, createVkJoinSession, peekVkJoinOAuthState } from './vkJoinAuthService.ts';
import { registerVkPlayer } from './vkJoinRegistrationService.ts';
import { appendVkOAuthResult } from './vkOAuthService.ts';
import { getPlayerSessionId } from '../auth.ts';
import { linkVkIdentity } from './vkEveningIntegrationService.ts';
import {
  confirmVkIdentityClaim,
  createVkIdentityClaim,
  peekVkIdentityClaim,
} from './vkIdentityClaimService.ts';

const router = Router();

const setVkSessionCookie = (res: any, token: string) => {
  res.cookie('vk_join_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const baseUrlFor = (req: any) => `${req.protocol}://${req.get('host')}`;
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const confirmationPage = (input: { token: string; nickname?: string; title?: string; error?: string }) => {
  const action = `/api/integrations/vk/link/confirm/${encodeURIComponent(input.token)}`;
  const body = input.error
    ? `<div class="error">${escapeHtml(input.error)}</div>`
    : `<p>Связать VK с игровым профилем <strong>«${escapeHtml(input.nickname)}»</strong> для записи на «${escapeHtml(input.title)}»?</p>
       <form method="post" action="${action}"><button type="submit">Подтвердить связь</button></form>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>2LA Noire · Связать VK</title>
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0d;color:#fff;font:16px system-ui;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);border:1px solid #ffffff1a;border-radius:24px;background:#ffffff0b;padding:24px;box-sizing:border-box}h1{margin:0 0 12px;font-size:24px}p{color:#ffffffa8;line-height:1.55}button{width:100%;min-height:52px;border:0;border-radius:16px;background:#2688eb;color:#fff;font-weight:700;font-size:15px}.error{color:#fecdd3;line-height:1.55}</style></head><body><main class="card"><h1>Подтверждение профиля</h1>${body}</main></body></html>`;
};

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
    if (!playerId) {
      try {
        await registerVkPlayer(db, result.vk_user_id, nickname);
      } catch (error: any) {
        if (error?.code !== 'nickname_taken') throw error;
        const claim = await createVkIdentityClaim(db, {
          vkUserId: result.vk_user_id,
          nickname,
          eveningId: result.evening_id,
          baseUrl: baseUrlFor(req),
        });
        returnUrl.searchParams.set('vk_link_pending', '1');
        if (claim.nickname) returnUrl.searchParams.set('vk_link_nickname', claim.nickname);
      }
    }
    returnUrl.searchParams.delete('nickname');
    setVkSessionCookie(res, result.session_token);
    return res.redirect(302, `${returnUrl.pathname}${returnUrl.search}`);
  } catch (error: any) {
    return res.redirect(302, appendVkOAuthResult(pending.return_to, 'vk_error', error?.message || 'VK ID failed'));
  }
});

router.get('/vk/link/confirm/:token', async (req, res) => {
  const db = (req as any).db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  await ensureVkJoinSchema(db);
  const token = String(req.params.token || '');
  const claim = await peekVkIdentityClaim(db, token);
  res.setHeader('Cache-Control', 'no-store');
  if (!claim) {
    return res.status(410).type('html').send(confirmationPage({
      token: '',
      error: 'Ссылка подтверждения устарела. Вернитесь к записи через VK и начните привязку ещё раз.',
    }));
  }
  return res.type('html').send(confirmationPage({
    token,
    nickname: claim.nickname,
    title: claim.title,
  }));
});

router.post('/vk/link/confirm/:token', async (req, res) => {
  const db = (req as any).db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  await ensureVkJoinSchema(db);
  try {
    const result = await confirmVkIdentityClaim(db, req.params.token);
    const session = await createVkJoinSession(db, result.vkUserId);
    setVkSessionCookie(res, session.sessionToken);
    return res.redirect(303, `/join/${encodeURIComponent(result.eveningId)}?source=vk_entry&vk_linked=1`);
  } catch (error: any) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(Number(error?.statusCode || 500)).type('html').send(confirmationPage({
      token: '',
      error: error?.message || 'Не удалось связать VK с игровым профилем.',
    }));
  }
});

export default router;
