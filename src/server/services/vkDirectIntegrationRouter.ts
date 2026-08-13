import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { getVkEveningIntegrationState } from './vkEveningIntegrationService.ts';
import { getVkOAuthStatus, hydrateVkOAuthAccessToken } from './vkOAuthService.ts';
import { syncDirectVkEveningPublications } from './vkDirectJoinPublishingService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

const enrichedState = async (db: DatabaseWrapper, eveningId: string) => {
  const state = await getVkEveningIntegrationState(db, eveningId);
  const oauth = await getVkOAuthStatus(db);
  return {
    ...state,
    integration: { ...state.integration, oauth, mode: 'direct_join' },
  };
};

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
    const eveningId = String(req.params.eveningId || '');
    const result = await syncDirectVkEveningPublications(db, eveningId, baseUrlFor(req));
    return res.json({ success: true, ...result, state: await enrichedState(db, eveningId) });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось синхронизировать VK' });
  }
});

export default router;
