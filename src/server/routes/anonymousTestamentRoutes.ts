import { Router } from 'express';
import { sanitizeLiveGameEvents } from '../../shared/liveGameEvents.ts';
import { generateAnonymousTestamentExercises } from '../../lib/anonymousTestamentTraining.ts';

const router = Router();
const json = (value: unknown): any => {
  try { return typeof value === 'string' ? JSON.parse(value) : null; } catch { return null; }
};

/** Public only because returned cases are synthetic text plus anonymized seat-level actions. */
router.get('/anonymous-testaments', async (req, res) => {
  try {
    const source: Array<{gameKey:string;events:ReturnType<typeof sanitizeLiveGameEvents>}> = [];
    const games = await req.db.all<any>(
      'SELECT id, protocol_text FROM games WHERE archived_at IS NULL ORDER BY id DESC LIMIT 35',
    );
    for (const game of games) {
      const payload = json(game.protocol_text);
      if (payload?.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed') continue;
      source.push({
        gameKey: 'club:' + game.id,
        events: sanitizeLiveGameEvents(payload.protocol?.events),
      });
    }
    const tournaments = await req.db.all<any>(
      "SELECT game_id, events_json FROM tournament_game_protocols WHERE status = 'completed' ORDER BY updated_at DESC LIMIT 35",
    );
    for (const game of tournaments) source.push({
      gameKey: 'tournament:' + game.game_id,
      events: sanitizeLiveGameEvents(json(game.events_json)),
    });
    const parsed = Number(req.query.attempt);
    const attempt = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : 0;
    res.set('Cache-Control', 'private, no-store');
    return res.json({
      teachingOnly: true,
      cases: generateAnonymousTestamentExercises(source, attempt),
    });
  } catch (error) {
    console.error('[TESTAMENT TRAINING] Fetch:', error);
    return res.status(500).json({ error: 'Не удалось подготовить упражнения' });
  }
});

export default router;
