import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { getUiUsageSummary, recordUiEvents } from '../services/uiUsageService.ts';

const router = Router();

// Only signed-in players and organizers report usage; anonymous visitors are ignored.
router.post('/', async (req: AuthenticatedRequest, res) => {
  const role = req.userRole === 'ORGANIZER' ? 'organizer' : getPlayerSessionId(req) ? 'player' : null;
  if (!role) return res.status(204).end();
  try {
    const db: DatabaseWrapper = req.db || (await getDb());
    await recordUiEvents(db, { sessionKey: req.body?.session, surface: req.body?.surface, role, events: req.body?.events });
    res.status(204).end();
  } catch (error) {
    console.error('[UI USAGE] record failed', error);
    res.status(204).end();
  }
});

router.get('/summary', requireOrganizerAuth, async (req, res) => {
  try {
    const db: DatabaseWrapper = req.db || (await getDb());
    res.json(await getUiUsageSummary(db, Number(req.query.days) || 30));
  } catch (error) {
    console.error('[UI USAGE] summary failed', error);
    res.status(500).json({ error: 'Не удалось загрузить статистику использования' });
  }
});

export default router;
