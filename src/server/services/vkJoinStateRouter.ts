import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { getPlayerSessionId } from '../auth.ts';
import { getVkJoinState } from './vkJoinIdentityService.ts';
import { resolveVkJoinSession } from './vkJoinAuthService.ts';
import { loadEveningSlotPlan, replacePlayerSlotSelection } from './eveningSlotPlanningService.ts';
import { hydrateVkOAuthAccessToken } from './vkOAuthService.ts';
import { syncDirectVkEveningPublications } from './vkDirectJoinPublishingService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

router.get('/evenings/:id/join-state', async (req, res) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkJoinSchema(db);
  return res.json(await getVkJoinState(db, req.params.id, req.cookies?.vk_join_session, getPlayerSessionId(req)));
});

router.get('/evenings/:id/slots', async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const vkSession = await resolveVkJoinSession(db, req.cookies?.vk_join_session);
    const playerId = vkSession?.player_id || getPlayerSessionId(req);
    return res.json(await loadEveningSlotPlan(db, req.params.id, playerId));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить игровые слоты' });
  }
});

router.post('/evenings/:id/slots', async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const vkSession = await resolveVkJoinSession(db, req.cookies?.vk_join_session);
    const playerId = vkSession?.player_id || getPlayerSessionId(req);
    if (!playerId) return res.status(401).json({ error: 'Сначала подтвердите профиль через VK ID или Telegram' });
    const plan = await replacePlayerSlotSelection(db, req.params.id, String(playerId), req.body?.slot_ids);
    try {
      await hydrateVkOAuthAccessToken(db);
      await syncDirectVkEveningPublications(db, req.params.id, baseUrlFor(req), { onlyExisting: true });
    } catch (publishError) {
      console.warn('[VK SLOTS] Could not refresh published slot plan:', publishError);
    }
    return res.json({ success: true, ...plan });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось сохранить выбор игр' });
  }
});

export default router;
