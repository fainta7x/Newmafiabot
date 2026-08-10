import { Router, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import baseRouter from './tournamentsRoutesBase.ts';
export { internalGetStandings, internalGetNominations } from './tournamentsRoutesBase.ts';
import { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';
import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';
import { rebuildCanonicalEloRatings } from '../services/eloRatingService.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';

const router = Router();

const checkJudgeEditingPermission = async (db: DatabaseWrapper, tournament: any, game: any) => {
  if (tournament.status === 'completed') {
    return { allowed: false, error: 'Турнир завершён. Сначала верните его на корректировку' };
  }

  // Judge-only correction is safe for a completed game and does not reopen or rewrite its protocol.
  if (tournament.status === 'correction' && game.status === 'completed') {
    return { allowed: true };
  }

  if (game.status === 'planned') {
    if (tournament.status === 'draft' || tournament.status === 'active') return { allowed: true };
    if (tournament.status === 'correction') return { allowed: false, error: 'В режиме корректировки нельзя изменять запланированные игры' };
    return { allowed: false, error: 'Изменение судьи запрещено в текущем статусе турнира' };
  }

  if (tournament.status === 'correction' && game.status === 'active') {
    const protocol = await db.get<any>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
    if (!protocol || protocol.status !== 'draft') return { allowed: false, error: 'Сначала необходимо вернуть протокол игры в черновик' };
    const otherActive = await db.get<any>(
      "SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'active' AND id != ?",
      [tournament.id, game.id],
    );
    if (otherActive) return { allowed: false, error: 'В турнире уже есть другая активная игра' };
    return { allowed: true };
  }

  return { allowed: false, error: 'Изменение судьи запрещено после запуска игры' };
};

// Stable judge identity cutover. This route intentionally shadows the legacy name-only handler below.
router.patch('/:id/games/:gameId/judge', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { id: tournamentId, gameId } = req.params;
  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });

    const permission = await checkJudgeEditingPermission(db, tournament, game);
    if (!permission.allowed) return res.status(400).json({ error: permission.error || 'Изменение судьи запрещено' });

    const judge = await resolveJudgeAssignment(db, {
      judge_player_id: req.body?.judge_player_id ?? null,
      judge_name: req.body?.judge_name ?? null,
    });
    await db.run(
      'UPDATE tournament_games SET judge_name = ?, judge_player_id = ? WHERE id = ? AND tournament_id = ?',
      [judge.judge_name, judge.judge_player_id, gameId, tournamentId],
    );

    if (game.status === 'completed' && judge.judge_player_id) {
      await evaluateAchievementsForPlayers(db, [judge.judge_player_id]);
    }

    const updated = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    return res.json(updated);
  } catch (err: any) {
    if (err instanceof JudgeAssignmentError) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: err.message || 'Ошибка обновления судьи' });
  }
});

// Elo is derived state. Successful completion/revert responses from the legacy protocol
// router are held until a full chronological rebuild finishes. Preview gets one fresh
// checkpoint after the rebuild; production keeps the same persistent DB path.
router.use((req: AuthenticatedRequest, res: Response, next) => {
  const isRatingTransition = req.method === 'POST' && (
    /^\/[^/]+\/games\/[^/]+\/protocol\/complete\/?$/.test(req.path) ||
    /^\/[^/]+\/games\/[^/]+\/protocol\/revert-to-draft\/?$/.test(req.path)
  );
  if (!isRatingTransition) return next();

  const originalJson = res.json.bind(res);
  let intercepted = false;
  res.json = ((body: any) => {
    if (intercepted || res.statusCode >= 400) return originalJson(body);
    intercepted = true;
    const db = (req as any).db as DatabaseWrapper;
    void (async () => {
      try {
        await rebuildCanonicalEloRatings(db);
        if (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_PATH) {
          await createPreviewCheckpoint(db);
        }
        originalJson(body);
      } catch (error) {
        console.error('Canonical Elo rebuild failed:', error);
        if (!res.headersSent) res.status(500);
        originalJson({ error: 'Не удалось пересчитать рейтинг Elo' });
      }
    })();
    return res;
  }) as typeof res.json;

  return next();
});

router.use(baseRouter);
export default router;
