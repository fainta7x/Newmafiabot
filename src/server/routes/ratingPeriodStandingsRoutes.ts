import { Router, type Response } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { calculateRatingPeriodStandings } from '../services/ratingPeriodStandingsService.ts';

const router = Router();
router.use(requireOrganizerAuth);

router.get('/:periodId/standings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.db;
    const result = await calculateRatingPeriodStandings(db, String(req.params.periodId));
    res.json(result);
  } catch (err: any) {
    if (err?.message === 'Рейтинговый период не найден') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err?.message || 'Не удалось рассчитать таблицу периода' });
  }
});

export default router;
