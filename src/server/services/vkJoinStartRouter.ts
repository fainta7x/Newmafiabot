import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { createVkJoinOAuthStart } from './vkJoinAuthService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

router.post('/evenings/:id/vk/start', async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    await ensureVkJoinSchema(db);
    const nickname = String(req.body?.nickname || '').trim().replace(/\s+/g, ' ');
    if (!nickname || nickname.length > 60) return res.status(400).json({ error: 'Введите игровой ник' });
    const returnTo = `/join/${encodeURIComponent(req.params.id)}?source=vk&nickname=${encodeURIComponent(nickname)}`;
    return res.json(await createVkJoinOAuthStart(db, {
      redirectUri: `${baseUrlFor(req)}/api/integrations/vk/oauth/callback`,
      eveningId: req.params.id,
      returnTo,
    }));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось открыть VK ID' });
  }
});

export default router;
