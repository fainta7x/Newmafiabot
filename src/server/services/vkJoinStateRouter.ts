import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { getPlayerSessionId } from '../auth.ts';
import { getVkJoinState } from './vkJoinIdentityService.ts';
import { loadEveningSlotPlan } from './eveningSlotPlanningService.ts';

const router = Router();

router.get('/evenings/:id/join-state', async (req, res) => {
  const db = (req as any).db as DatabaseWrapper;
  await ensureVkJoinSchema(db);
  return res.json(await getVkJoinState(db, req.params.id, req.cookies?.vk_join_session, getPlayerSessionId(req)));
});

router.get('/evenings/:id/slots', async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    return res.json(await loadEveningSlotPlan(db, req.params.id, getPlayerSessionId(req)));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить игровые слоты' });
  }
});

export default router;
