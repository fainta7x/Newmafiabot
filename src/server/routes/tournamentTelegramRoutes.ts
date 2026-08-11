import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { requestBotTournamentTelegramSync } from '../services/botTelegramSyncService.ts';

const router = Router();

const syncInBackground = async (tournamentId: string) => {
  try {
    const result = await requestBotTournamentTelegramSync(tournamentId);
    if (!result.success) console.warn('[TELEGRAM] Tournament background sync failed:', tournamentId, result.error);
  } catch (error) {
    console.warn('[TELEGRAM] Tournament background sync threw:', tournamentId, error);
  }
};

router.use((req: any, res: any, next) => {
  const transition = req.path.match(/^\/([^/]+)\/(start|complete)$/);
  if (req.method !== 'POST' || !transition) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) void syncInBackground(String(transition[1]));
  });
  next();
});

router.post('/:id/sync-telegram', requireOrganizerAuth, async (req, res) => {
  const db = (req as any).db;
  const tournament = await db.get('SELECT id FROM tournaments WHERE id = ?', [req.params.id]);
  if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
  const result = await requestBotTournamentTelegramSync(req.params.id);
  return res.status(result.success ? 200 : result.status || 502).json(
    result.success ? result.data : { error: result.error, bot: result.data || null },
  );
});

export default router;
