import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { hydrateVkOAuthAccessToken } from './vkOAuthService.ts';
import { resolveVkJoinSession } from './vkJoinAuthService.ts';
import { saveVkJoinResponse } from './vkJoinRegistrationService.ts';
import { syncDirectVkEveningPublications } from './vkDirectJoinPublishingService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

router.post('/evenings/:id/vk-respond', async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    await ensureVkJoinSchema(db);
    const session = await resolveVkJoinSession(db, req.cookies?.vk_join_session);
    if (!session?.player_id) return res.status(401).json({ error: 'Сначала войдите через VK ID' });
    const result = await saveVkJoinResponse(db, req.params.id, session.player_id, req.body?.status);
    try {
      await hydrateVkOAuthAccessToken(db);
      await syncDirectVkEveningPublications(db, req.params.id, baseUrlFor(req), { onlyExisting: true });
    } catch (publishError) {
      console.warn('[VK RSVP] Could not refresh published counters:', publishError);
    }
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось сохранить ответ' });
  }
});

export default router;
