import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import tournamentEveningAdminRoutes from './tournamentEveningAdminRoutes.ts';
import tournamentEveningRoutes from './tournamentEveningRoutes.ts';
import {
  drainTelegramSyncOutbox,
  enqueueTelegramTournamentSync,
  getTelegramDispatchJob,
} from '../services/telegramSyncOutboxService.ts';

const router = Router();

// Registration/fee/calendar metadata extends the canonical tournament entity. Mount it
// ahead of the transport-specific sync hooks so Telegram and VK sessions hit the same API.
router.use(tournamentEveningAdminRoutes);
router.use(tournamentEveningRoutes);

const nudgeTournamentSync = async (db: any, tournamentId: string, enqueue = false) => {
  try {
    if (enqueue) await enqueueTelegramTournamentSync(db, tournamentId);
    await drainTelegramSyncOutbox(db, { limit: 50 });
  } catch (error) {
    console.warn('[TELEGRAM] Tournament durable sync nudge failed:', tournamentId, error);
  }
};

router.use((req: any, res: any, next) => {
  const transition = req.path.match(/^\/([^/]+)\/(start|complete)$/);
  const participantUpdate = req.path.match(/^\/([^/]+)\/participants$/);
  const participantCorrection = req.path.match(/^\/([^/]+)\/participants\/[^/]+\/correct-player$/);
  const metadataUpdate = req.path.match(/^\/([^/]+)$/);
  const shouldNudge = (
    (req.method === 'POST' && Boolean(transition))
    || (req.method === 'PUT' && Boolean(participantUpdate))
    || (req.method === 'PATCH' && Boolean(participantCorrection))
    || (req.method === 'PATCH' && Boolean(metadataUpdate))
  );
  if (!shouldNudge) return next();

  const tournamentId = String(
    transition?.[1]
    || participantUpdate?.[1]
    || participantCorrection?.[1]
    || metadataUpdate?.[1]
    || '',
  );
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300 || !tournamentId) return;
    const needsExplicitEnqueue = req.method === 'PUT' && Boolean(participantUpdate);
    void nudgeTournamentSync(req.db, tournamentId, needsExplicitEnqueue);
  });
  next();
});

router.post('/:id/sync-telegram', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db;
    const tournament = await db.get('SELECT id FROM tournaments WHERE id = ?', [String(req.params.id)]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });

    await enqueueTelegramTournamentSync(db, String(req.params.id));
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await getTelegramDispatchJob(db, 'tournament', String(req.params.id)));
    return res.json({ success: true, queued, drain });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось поставить публикацию турнира в очередь' });
  }
});

export default router;