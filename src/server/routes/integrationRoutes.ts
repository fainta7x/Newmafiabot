import crypto from 'crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import {
  getVkEveningIntegrationState,
  linkVkIdentity,
  parseVkPollVoteCallback,
  processVkPollVoteCallback,
  reconcileVkEveningVotes,
  syncVkEveningPublications,
  unlinkVkIdentity,
} from '../services/vkEveningIntegrationService.ts';
import {
  getVkDestinations,
  getVkIntegrationStatus,
} from '../services/vkPublishingService.ts';
import {
  appendVkOAuthResult,
  completeVkOAuth,
  createVkOAuthStart,
  disconnectVkOAuth,
  getVkOAuthStatus,
  hydrateVkOAuthAccessToken,
} from '../services/vkOAuthService.ts';
import {
  ensureVkCallbackRegistration,
  getVkCallbackRequestConfig,
  getVkCallbackRuntimeStatus,
} from '../services/vkCallbackSetupService.ts';

const router = Router();

const withVkSchema = async (req: any) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  await hydrateVkOAuthAccessToken(db);
  return db;
};

const callbackText = (res: any, status: number, text: string) => res.status(status).type('text/plain').send(text);
const callbackUrlFor = (req: any) => `${req.protocol}://${req.get('host')}/api/integrations/vk/callback`;

const tryRepairVkCallback = async (db: DatabaseWrapper, req: any) => {
  const integration = getVkIntegrationStatus();
  const current = await getVkCallbackRuntimeStatus(db);
  if (current.configured || !integration.group_token_configured) return current;
  try {
    await ensureVkCallbackRegistration(db, callbackUrlFor(req));
  } catch (error) {
    console.error('[VK CALLBACK REPAIR]', error);
  }
  return getVkCallbackRuntimeStatus(db);
};

const enrichEveningState = async (db: DatabaseWrapper, state: any) => {
  const [oauth, callback] = await Promise.all([
    getVkOAuthStatus(db),
    getVkCallbackRuntimeStatus(db),
  ]);
  const runtimeCallbackReady = Boolean(callback.configured);
  return {
    ...state,
    integration: {
      ...state.integration,
      oauth,
      callback,
      callback_secret_configured: runtimeCallbackReady || Boolean(state.integration?.callback_secret_configured),
      callback_confirmation_configured: runtimeCallbackReady || Boolean(state.integration?.callback_confirmation_configured),
    },
  };
};

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
      // VK may validate a newly added server before the secret starts appearing in
      // delivery payloads. If it is present, verify it; if it is absent, the stored
      // per-group confirmation code is sufficient for this one handshake.
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

      if (type === 'poll_vote_new') {
        const vote = parseVkPollVoteCallback(req.body);
        if (vote) await processVkPollVoteCallback(tx, vote);
      }
    });

    if (duplicate) return callbackText(res, 200, 'ok');
    return callbackText(res, 200, 'ok');
  } catch (error) {
    console.error('[VK CALLBACK]', error);
    return callbackText(res, 500, 'error');
  }
});

router.post('/vk/oauth/start', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/integrations/vk/oauth/callback`;
    const result = await createVkOAuthStart(db, {
      redirectUri: callbackUrl,
      returnTo: req.body?.return_to,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось начать подключение VK' });
  }
});

router.get('/vk/oauth/callback', async (req, res) => {
  const db = req.db as DatabaseWrapper;
  const state = String(req.query?.state || '').trim();
  let returnTo = '/';
  try {
    await ensureVkIntegrationSchema(db);
    if (state) {
      const pending = await db.get<{ return_to: string }>('SELECT return_to FROM vk_oauth_states WHERE state = ? LIMIT 1', [state]);
      if (pending?.return_to) returnTo = pending.return_to;
    }

    const result = await completeVkOAuth(db, {
      code: req.query?.code,
      deviceId: req.query?.device_id,
      state,
    });
    returnTo = result.return_to || returnTo;

    try {
      await ensureVkCallbackRegistration(db, callbackUrlFor(req));
    } catch (callbackError) {
      console.error('[VK CALLBACK SETUP]', callbackError);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, appendVkOAuthResult(returnTo, 'vk_connected', '1'));
  } catch (error: any) {
    console.error('[VK OAUTH CALLBACK]', error);
    return res.redirect(302, appendVkOAuthResult(returnTo, 'vk_error', error?.message || 'VK OAuth failed'));
  }
});

router.post('/vk/callback/setup', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    res.json(await ensureVkCallbackRegistration(db, callbackUrlFor(req)));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось подключить Callback API VK' });
  }
});

router.delete('/vk/oauth', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    res.json(await disconnectVkOAuth(db));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось отключить VK' });
  }
});

router.get('/status', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    await tryRepairVkCallback(db, req);
    const vk = getVkIntegrationStatus();
    const [oauth, callback] = await Promise.all([getVkOAuthStatus(db), getVkCallbackRuntimeStatus(db)]);
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

router.get('/vk/evenings/:eveningId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    await tryRepairVkCallback(db, req);
    const state = await getVkEveningIntegrationState(db, String(req.params.eveningId || ''));
    res.json(await enrichEveningState(db, state));
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить VK-интеграцию вечера' });
  }
});

router.post('/vk/evenings/:eveningId/sync', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const result = await syncVkEveningPublications(db, String(req.params.eveningId || ''));
    const state = await getVkEveningIntegrationState(db, String(req.params.eveningId || ''));
    res.json({ success: true, ...result, state: await enrichEveningState(db, state) });
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось синхронизировать VK' });
  }
});

router.post('/vk/evenings/:eveningId/reconcile', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const result = await reconcileVkEveningVotes(db, String(req.params.eveningId || ''));
    const state = await getVkEveningIntegrationState(db, String(req.params.eveningId || ''));
    res.json({ success: true, ...result, state: await enrichEveningState(db, state) });
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось забрать ответы VK' });
  }
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
