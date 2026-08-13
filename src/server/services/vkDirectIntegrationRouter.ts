import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { getVkEveningIntegrationState } from './vkEveningIntegrationService.ts';
import {
  appendVkOAuthResult,
  completeVkLegacyOAuth,
  createVkLegacyOAuthStart,
  getVkOAuthStatus,
  hydrateVkOAuthAccessToken,
} from './vkOAuthService.ts';
import { syncDirectVkEveningPublications } from './vkDirectJoinPublishingService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;
const publisherCallbackUrlFor = (req: Request) => `${baseUrlFor(req)}/api/integrations/vk/api-oauth/callback`;

const enrichedState = async (db: DatabaseWrapper, eveningId: string) => {
  const state = await getVkEveningIntegrationState(db, eveningId);
  const oauth = await getVkOAuthStatus(db);
  return {
    ...state,
    integration: {
      ...state.integration,
      configured: Boolean(state.integration?.configured && oauth.api_compatible),
      oauth,
      mode: 'direct_join',
    },
  };
};

router.post('/vk/api-oauth/start', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    const result = await createVkLegacyOAuthStart(db, {
      redirectUri: publisherCallbackUrlFor(req),
      returnTo: req.body?.return_to,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось начать подключение VK API' });
  }
});

router.get('/vk/api-oauth/callback', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VK · 2LA Noire</title></head>
<body style="margin:0;background:#090a0d;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box">
<div style="max-width:420px;text-align:center"><div id="status">Подключаем публикацию VK…</div></div>
<script>
(async()=>{
  const el=document.getElementById('status');
  const hash=new URLSearchParams(location.hash.slice(1));
  const query=new URLSearchParams(location.search);
  const read=(key)=>hash.get(key)||query.get(key)||'';
  const error=read('error_description')||read('error');
  if(error){el.textContent='VK не дал доступ: '+error;return;}
  const accessToken=read('access_token');
  const state=read('state');
  if(!accessToken||!state){el.textContent='VK не вернул API-токен. Вернись в приложение и попробуй ещё раз.';return;}
  try{
    const response=await fetch('/api/integrations/vk/api-oauth/complete',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({access_token:accessToken,expires_in:read('expires_in'),user_id:read('user_id'),state})
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body.error||('HTTP '+response.status));
    location.replace(body.redirect_to||'/');
  }catch(err){el.textContent='Не удалось подключить публикацию VK: '+(err&&err.message?err.message:String(err));}
})();
</script></body></html>`);
});

router.post('/vk/api-oauth/complete', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    const result = await completeVkLegacyOAuth(db, {
      accessToken: req.body?.access_token,
      expiresIn: req.body?.expires_in,
      userId: req.body?.user_id,
      state: req.body?.state,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      redirect_to: appendVkOAuthResult(result.return_to || '/', 'vk_connected', 'api'),
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось сохранить VK API-токен' });
  }
});

router.get('/vk/evenings/:eveningId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await hydrateVkOAuthAccessToken(db);
    return res.json(await enrichedState(db, String(req.params.eveningId || '')));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить VK-интеграцию вечера' });
  }
});

router.post('/vk/evenings/:eveningId/sync', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await hydrateVkOAuthAccessToken(db);
    const oauth = await getVkOAuthStatus(db);
    if (!oauth.api_compatible) {
      return res.status(409).json({
        code: 'vk_publish_token_required',
        error: 'VK ID подходит для входа игроков, но не для публикации постов. Подключи автопубликацию через VK API один раз.',
      });
    }
    const eveningId = String(req.params.eveningId || '');
    const result = await syncDirectVkEveningPublications(db, eveningId, baseUrlFor(req));
    return res.json({ success: true, ...result, state: await enrichedState(db, eveningId) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось синхронизировать VK' });
  }
});

export default router;
