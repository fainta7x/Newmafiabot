import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { getUiUsageSummary, loadPlayerActivity, recordUiEvents } from '../services/uiUsageService.ts';
import { loadPresence } from '../services/presenceService.ts';
import { resolveAnalyticsRange } from '../services/clubAnalyticsService.ts';

const router = Router();

// Only signed-in players and organizers report usage; anonymous visitors are ignored.
router.post('/', async (req: AuthenticatedRequest, res) => {
  const role = req.userRole === 'ORGANIZER' ? 'organizer' : getPlayerSessionId(req) ? 'player' : null;
  if (!role) return res.status(204).end();
  try {
    const db: DatabaseWrapper = req.db || (await getDb());
    await recordUiEvents(db, { sessionKey: req.body?.session, surface: req.body?.surface, role, events: req.body?.events, playerId: role === 'player' ? String(getPlayerSessionId(req)) : null });
    res.status(204).end();
  } catch (error) {
    console.error('[UI USAGE] record failed', error);
    res.status(204).end();
  }
});

router.get('/summary', requireOrganizerAuth, async (req, res) => {
  try {
    const db: DatabaseWrapper = req.db || (await getDb());
    const period = req.query.period ? await resolveAnalyticsRange(db, String(req.query.period)) : Number(req.query.days) || 30;
    res.json(await getUiUsageSummary(db, period));
  } catch (error) {
    console.error('[UI USAGE] summary failed', error);
    res.status(500).json({ error: 'Не удалось загрузить статистику использования' });
  }
});

// One player's visits and clicks for the CRM player card (organizers only).
router.get('/players/:playerId', requireOrganizerAuth, async (req, res) => {
  try {
    const db: DatabaseWrapper = req.db || (await getDb());
    const playerId = String(req.params.playerId || '');
    const [activity, online] = await Promise.all([loadPlayerActivity(db, playerId, Number(req.query.days) || 30), loadPresence(db)]);
    const now = online.find((person) => person.player_id === playerId) || null;
    res.json({ ...activity, online_now: now ? { screen: now.screen, on_screen_seconds: now.on_screen_seconds } : null });
  } catch (error) {
    console.error('[UI USAGE] player activity failed', error);
    res.status(500).json({ error: 'Не удалось загрузить активность игрока' });
  }
});

export default router;
