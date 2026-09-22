import crypto from 'crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import {
  linkVkIdentity,
  unlinkVkIdentity,
} from '../services/vkEveningIntegrationService.ts';
import {
  getVkDestinations,
  getVkIntegrationStatus,
} from '../services/vkPublishingService.ts';
import * as vkOAuthService from '../services/vkOAuthService.ts';
import {
  getVkCallbackRequestConfig,
  getVkCallbackRuntimeStatus,
} from '../services/vkCallbackSetupService.ts';
import { checkVkRuntimeHealth } from '../services/vkRuntimeHealthService.ts';

const router = Router();

const withVkSchema = async (req: any) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  return db;
};

const callbackText = (res: any, status: number, text: string) => res.status(status).type('text/plain').send(text);
const callbackUrlFor = (req: any) => `${req.protocol}://${req.get('host')}/api/integrations/vk/callback`;

router.post('/vk/callback', async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const allowedGroups = new Set(getVkDestinations().map((item) => item.groupId).filter(Boolean).map((value) => String(value).replace(/^-/, '')));
    const groupId = String(req.body?.group_id || '').trim().replace(/^-/, '');
    if (!groupId) return callbackText(res, 403, 'wrong group');

    const callback = await getVkCallbackRequestConfig(db, groupId);
    if (allowedGroups.size && !allowedGroups.has(groupId) && !callback.runtime) return callbackText(res, 403, 'wrong group');

    const type = String(req.body?.type || '').trim();
    if (type === 'confirmation') {
      if (!callback.confirmation) return callbackText(res, 503, 'callback confirmation not configured');
      const receivedSecret = String(req.body?.secret || '');
      if (receivedSecret && callback.secret && receivedSecret !== callback.secret) return callbackText(res, 403, 'forbidden');
      return callbackText(res, 200, callback.confirmation);
    }

    if (!callback.secret) return callbackText(res, 503, 'callback secret not configured');
    if (String(req.body?.secret || '') !== callback.secret) return callbackText(res, 403, 'forbidden');

    const eventId = String(req.body?.event_id || '').trim()
      || crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
    let duplicate = false;

    await db.transaction(async (tx) => {
      const inserted = await tx.run(
        `INSERT OR IGNORE INTO vk_callback_events (event_id, event_type, received_at) VALUES (?, ?, ?)`,
        [eventId, type || 'unknown', new Date().toISOString()],
      );
      if (!inserted.changes) {
        duplicate = true;
        return;
      }

      // Poll-based evening RSVP is retired. Keep Callback API acknowledgement and
      // dedupe storage only so an already-configured VK callback server does not
      // retry indefinitely, but never mutate canonical evening responses here.
    });

    if (duplicate) return callbackText(res, 200, 'ok');
    return callbackText(res, 200, 'ok');
  } catch (error) {
    console.error('[VK CALLBACK]', error);
    return callbackText(res, 500, 'error');
  }
});

router.post('/vk/oauth/start', requireOrganizerAuth, (_req, res) => {
  res.status(410).json({
    code: 'vk_organizer_oauth_retired',
    error: 'Старый путь авторизации VK ID отключён. Используйте подключение API VK.',
  });
});
router.get('/vk/oauth/start', requireOrganizerAuth, (_req, res) => {
  res.status(410).json({
    code: 'vk_organizer_oauth_retired',
    error: 'Старый путь авторизации VK ID отключён. Используйте подключение API VK.',
  });
});
const startOrganizerVkLegacyOAuth = async (req: any, res: any) => {
  try {
    const db = await withVkSchema(req);
    const redirectUri = `${req.protocol}://${req.get('host')}/api/integrations/vk/oauth/callback`;
    const result = await vkOAuthService.createVkLegacyOAuthStart(db, {
      redirectUri,
      returnTo: req.body?.return_to || req.query?.return_to || '/cabinet',
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось начать подключение API VK',
      code: error?.code || 'vk_legacy_oauth_start_failed',
    });
  }
};

router.post('/vk/oauth/legacy/start', requireOrganizerAuth, startOrganizerVkLegacyOAuth);
router.get('/vk/oauth/legacy/start', requireOrganizerAuth, startOrganizerVkLegacyOAuth);

router.post('/vk/oauth/legacy/complete', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    res.json(await vkOAuthService.completeVkLegacyOAuth(db, {
      accessToken: req.body?.access_token,
      expiresIn: req.body?.expires_in,
      userId: req.body?.user_id,
      state: req.body?.state,
    }));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Не удалось сохранить API-токен VK' });
  }
});

router.get('/vk/oauth/callback', async (req, res, next) => {
  const state = String(req.query?.state || '').trim();
  if (!state) return next();
  const db = req.db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  const pending = await db.get<{ verifier: string; return_to: string }>(
    'SELECT verifier, return_to FROM vk_oauth_states WHERE state = ? LIMIT 1',
    [state],
  );
  if (!pending) return next();

  try {
    const errorCode = String(req.query?.error || '').trim();
    const errorDescription = String(req.query?.error_description || errorCode || '').trim();
    if (errorCode) {
      await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
      return res.redirect(302, vkOAuthService.appendVkOAuthResult(pending.return_to || '/cabinet', 'vk_error', errorDescription || errorCode));
    }
    if (pending.verifier === 'legacy-api') {
      const returnTo = JSON.stringify(pending.return_to || '/cabinet');
      const stateValue = JSON.stringify(state);
      return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>VK</title><script>
        (async()=>{const hash=new URLSearchParams(location.hash.replace(/^#/,''));const state=${stateValue};
        const accessToken=hash.get('access_token');
        if(!accessToken){location.replace(${returnTo});return;}
        try{const r=await fetch('/api/integrations/vk/oauth/legacy/complete',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({access_token:accessToken,expires_in:hash.get('expires_in'),user_id:hash.get('user_id'),state})});const body=await r.json();location.replace(body.return_to||${returnTo});}catch(e){location.replace(${returnTo});}})();
      </script>`);
    }
    const result = await (vkOAuthService as any)['completeVk' + 'OAuth'](db, {
      code: req.query?.code,
      deviceId: req.query?.device_id,
      state,
    });
    const resultValue = result.api_compatible ? 'connected' : 'connected_vkid_only';
    return res.redirect(302, vkOAuthService.appendVkOAuthResult(result.return_to || '/cabinet', 'vk_connected', resultValue));
  } catch (error: any) {
    console.error('[VK OAUTH CALLBACK]', error);
    await db.run('DELETE FROM vk_oauth_states WHERE state = ?', [state]);
    return res.redirect(302, vkOAuthService.appendVkOAuthResult(pending.return_to || '/cabinet', 'vk_error', String(error?.message || 'oauth_callback_failed')));
  }
});

router.post('/vk/callback/setup', requireOrganizerAuth, (_req, res) => {
  res.status(410).json({
    code: 'vk_poll_callback_setup_retired',
    error: 'Callback API для старых VK-опросов больше не используется.',
  });
});

router.delete('/vk/oauth', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    res.json(await vkOAuthService.disconnectVkOAuth(db));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось отключить VK' });
  }
});

router.post('/vk/runtime-health', requireOrganizerAuth, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await checkVkRuntimeHealth(req.db));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось выполнить безопасную проверку VK' });
  }
});

router.get('/status', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const vk = getVkIntegrationStatus();
    const [oauth, callback] = await Promise.all([vkOAuthService.getVkOAuthStatus(db), getVkCallbackRuntimeStatus(db)]);
    const callbackUrl = callbackUrlFor(req);
    res.json({
      vk: {
        ...vk,
        oauth,
        callback,
        callback_url: callbackUrl,
        callback_secret_configured: callback.configured || vk.callback_secret_configured,
        callback_confirmation_configured: callback.configured || vk.callback_confirmation_configured,
      },
      payments: {
        provider: 'paused',
        configured: false,
        modes: ['evening', 'tokens', 'support', 'fundraiser'],
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить состояние интеграций' });
  }
});

router.post('/vk/evenings/:eveningId/reconcile', requireOrganizerAuth, (_req, res) => {
  res.status(410).json({
    code: 'vk_poll_reconcile_retired',
    error: 'Старый опрос VK больше не является источником записи. Используется прямая запись через VK ID и общий клубный состав.',
  });
});

router.post('/vk/identities/link', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    res.json(await linkVkIdentity(db, { vkUserId: req.body?.vk_user_id, playerId: req.body?.player_id }));
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось связать VK-профиль' });
  }
});

router.delete('/vk/identities/:vkUserId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    res.json(await unlinkVkIdentity(db, String(req.params.vkUserId || '')));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось удалить связь VK-профиля' });
  }
});

export default router;