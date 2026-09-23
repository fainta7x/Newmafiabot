import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();

/**
 * Tournaments whose results the organizer has published. Each item links to
 * the existing public results page; standings are not recomputed here.
 */
router.get('/tournament-results', async (req, res) => {
  const viewerId = getPlayerSessionId(req);
  if (!viewerId) return res.status(401).json({ error: 'Player authentication required.' });
  try {
    const rows = await req.db.all<any>(`
      SELECT t.id, t.title, t.date, t.venue, t.public_token, t.results_published_at,
             EXISTS(SELECT 1 FROM tournament_participants tp WHERE tp.tournament_id = t.id AND tp.player_id = ?) AS participated
        FROM tournaments t
       WHERE t.status = 'completed'
         AND t.results_published_at IS NOT NULL
         AND COALESCE(t.public_token, '') <> ''
       ORDER BY COALESCE(t.date, t.results_published_at) DESC
       LIMIT 50
    `, [viewerId]);
    return res.json({
      tournaments: rows.map((row) => ({
        id: String(row.id),
        title: String(row.title || 'Турнир'),
        date: row.date || null,
        venue: row.venue || null,
        results_path: `/tournaments/results/${encodeURIComponent(String(row.public_token))}`,
        participated: Boolean(Number(row.participated)),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить турниры' });
  }
});

export default router;
