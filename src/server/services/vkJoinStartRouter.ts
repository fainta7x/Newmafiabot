import { Router, type Request } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkJoinSchema } from '../../db/ensureVkJoinSchema.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { createVkJoinOAuthStart, resolveVkJoinSession } from './vkJoinAuthService.ts';
import { createVkIdentityClaim } from './vkIdentityClaimService.ts';

const router = Router();
const baseUrlFor = (req: Request) => `${req.protocol}://${req.get('host')}`;

router.post('/evenings/:id/vk/start', async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
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

router.post('/evenings/:id/vk/claim', async (req, res) => {
  try {
    const db = (req as any).db as DatabaseWrapper;
    await ensureVkIntegrationSchema(db);
    await ensureVkJoinSchema(db);
    const session = await resolveVkJoinSession(db, req.cookies?.vk_join_session);
    if (!session) return res.status(401).json({ error: 'Сначала подтвердите вход через VK ID', code: 'vk_auth_required' });
    if (session.player_id) return res.json({ success: true, pending: false, linked: true });
    const result = await createVkIdentityClaim(db, {
      vkUserId: session.vk_user_id,
      nickname: req.body?.nickname,
      eveningId: req.params.id,
      baseUrl: baseUrlFor(req),
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось отправить подтверждение в MafiaBot',
      code: error?.code || 'claim_failed',
    });
  }
});

export default router;
