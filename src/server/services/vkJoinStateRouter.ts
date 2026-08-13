import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { getPlayerSessionId } from '../auth.ts';
import { getVkJoinState } from './vkJoinIdentityService.ts';

const router = Router();

router.get('/evenings/:id/join-state', async (req, res) => {
  const db = req.db as DatabaseWrapper;
  await ensureVkJoinSchema(db);
  return res.json(await getVkJoinState(db, req.params.id, req.cookies?.vk_join_session, getPlayerSessionId(req)));
});

export default router;
