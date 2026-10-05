import { Router } from 'express';
import { getPlayerSessionId, isClubOwner, requireOrganizerAuth } from '../auth.ts';
import { loadClubDigestState, publishClubDigest } from '../services/clubDigestService.ts';

/** CRM «Публикации клуба» → «Сводка для игроков»: only the club owner publishes it. */
const router = Router();
router.use(requireOrganizerAuth);
router.use((req, res, next) => (isClubOwner(req as any) ? next() : res.status(403).json({ error: 'Сводку публикует владелец клуба' })));

router.get('/', async (req, res) => {
  try {
    res.json(await loadClubDigestState(req.db));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить сводку' });
  }
});

router.post('/', async (req, res) => {
  try {
    const results = await publishClubDigest(req.db, { text: req.body?.text, destinations: req.body?.destinations, createdBy: getPlayerSessionId(req as any) ? String(getPlayerSessionId(req as any)) : 'owner' });
    res.json({ results });
  } catch (error: any) {
    res.status(Number(error?.statusCode) || 500).json({ error: error?.message || 'Не удалось опубликовать сводку' });
  }
});

export default router;
