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
  getVkCallbackConfig,
  getVkCallbackConfirmation,
  getVkDestinations,
  getVkIntegrationStatus,
} from '../services/vkPublishingService.ts';

const router = Router();

const withVkSchema = async (req: any) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkIntegrationSchema(db);
  return db;
};

const callbackText = (res: any, status: number, text: string) => res.status(status).type('text/plain').send(text);

router.post('/vk/callback', async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const callback = getVkCallbackConfig();
    if (!callback.secret) return callbackText(res, 503, 'callback secret not configured');
    if (String(req.body?.secret || '') !== callback.secret) return callbackText(res, 403, 'forbidden');

    const allowedGroups = new Set(getVkDestinations().map((item) => item.groupId).filter(Boolean).map(String));
    const groupId = String(req.body?.group_id || '').trim();
    if (!groupId || (allowedGroups.size && !allowedGroups.has(groupId))) return callbackText(res, 403, 'wrong group');

    const type = String(req.body?.type || '').trim();
    if (type === 'confirmation') {
      const confirmation = getVkCallbackConfirmation(groupId);
      if (!confirmation) return callbackText(res, 503, 'callback confirmation not configured');
      return callbackText(res, 200, confirmation);
    }

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

router.get('/status', requireOrganizerAuth, async (req, res) => {
  try {
    await withVkSchema(req);
    const vk = getVkIntegrationStatus();
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/integrations/vk/callback`;
    res.json({
      vk: { ...vk, callback_url: callbackUrl },
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
    res.json(await getVkEveningIntegrationState(db, String(req.params.eveningId || '')));
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить VK-интеграцию вечера' });
  }
});

router.post('/vk/evenings/:eveningId/sync', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const result = await syncVkEveningPublications(db, String(req.params.eveningId || ''));
    res.json({ success: true, ...result, state: await getVkEveningIntegrationState(db, String(req.params.eveningId || '')) });
  } catch (error: any) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось синхронизировать VK' });
  }
});

router.post('/vk/evenings/:eveningId/reconcile', requireOrganizerAuth, async (req, res) => {
  try {
    const db = await withVkSchema(req);
    const result = await reconcileVkEveningVotes(db, String(req.params.eveningId || ''));
    res.json({ success: true, ...result, state: await getVkEveningIntegrationState(db, String(req.params.eveningId || '')) });
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
    res.status(500).json({ error: error?.message || 'Не удалось удалить связь VK' });
  }
});

export default router;
