import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { getVkEveningIntegrationState } from './vkEveningIntegrationService.ts';
import {
  getVkOAuthStatus,
  hydrateVkOAuthAccessToken,
} from './vkOAuthService.ts';
import {
  getDirectVkEveningAnnouncementDraft,
  syncDirectVkEveningPublications,
} from './vkDirectJoinPublishingService.ts';
import { getVkIntegrationStatus } from './vkPublishingService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

const enrichedState = async (db: DatabaseWrapper, eveningId: string) => {
  const state = await getVkEveningIntegrationState(db, eveningId);
  const oauth = await getVkOAuthStatus(db);
  const publisher = getVkIntegrationStatus();
  return {
    ...state,
    integration: {
      ...state.integration,
      configured: publisher.configured,
      oauth,
      mode: 'direct_join',
    },
  };
};

router.post('/vk/api-oauth/start', requireOrganizerAuth, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    code: 'vk_classic_oauth_retired',
    error: 'Этот способ подключения больше не поддерживается VK. Публикация использует ключ сообщества на сервере.',
  });
});

router.get('/vk/api-oauth/callback', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VK · 2LA Noire</title></head>
<body style="margin:0;background:#090a0d;color:#fff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box">
<div style="max-width:420px;text-align:center;line-height:1.5">
  <strong>Подключение через старый VK OAuth отключено.</strong>
  <div style="margin-top:12px;color:#a9abb4">Вернись в MafiaBot: запись игроков через VK ID работает, а публикация использует серверный ключ сообщества.</div>
</div></body></html>`);
});

router.get('/vk/evenings/:eveningId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await hydrateVkOAuthAccessToken(db);
    return res.json(await enrichedState(db, String(req.params.eveningId || '')));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить VK-интеграцию вечера' });
  }
});

router.get('/vk/evenings/:eveningId/draft', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    return res.json(await getDirectVkEveningAnnouncementDraft(
      db,
      String(req.params.eveningId || ''),
      baseUrlFor(req),
    ));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось подготовить VK-анонс' });
  }
});

router.post('/vk/evenings/:eveningId/sync', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await hydrateVkOAuthAccessToken(db);
    const publisher = getVkIntegrationStatus();
    if (!publisher.configured) {
      return res.status(409).json({
        code: 'vk_publish_token_required',
        error: 'Запись через VK ID работает. Для автопубликации в паблик на сервере нужен ключ сообщества VK.',
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
