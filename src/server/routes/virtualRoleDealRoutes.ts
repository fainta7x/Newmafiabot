import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  openVirtualRoleDeal, revealVirtualRole, confirmVirtualRole,
  undoVirtualRole, resetVirtualRoleDeal, type DealGame,
} from '../services/virtualRoleDealService.ts';

const integer = (value: unknown): number => Number(value);

/**
 * The deal routes of one kind of game (owner, 2026-11-09: one deal for every game). `resolve` turns the request into the
 * game (or an error); the five actions are the same for a club game and a tournament game.
 */
function createDealRouter(resolve: (req: AuthenticatedRequest, db: any) => Promise<DealGame | { error: string; status: number }>) {
  const router = Router({ mergeParams: true });
  router.use(requireOrganizerAuth);
  const respond = async (req: AuthenticatedRequest, res: any, action: (db: any, game: DealGame) => Promise<unknown>) => {
    try {
      const db = req.db || await getDb();
      const game = await resolve(req, db);
      if (typeof game === 'object' && 'error' in game) return res.status(game.status).json({ error: game.error });
      return res.json(await action(db, game));
    } catch (error: any) {
      return res.status(Number(error?.statusCode || 500)).json({ error: error?.statusCode ? error.message : 'Не удалось выполнить раздачу' });
    }
  };
  router.post('/open', (req: AuthenticatedRequest, res) =>
    void respond(req, res, (db, game) => openVirtualRoleDeal(db, game)));
  router.post('/reveal', (req: AuthenticatedRequest, res) =>
    void respond(req, res, (db, game) => revealVirtualRole(
      db, game, integer(req.body?.seat), String(req.body?.cardId || ''), integer(req.body?.version),
    )));
  router.post('/confirm', (req: AuthenticatedRequest, res) =>
    void respond(req, res, (db, game) => confirmVirtualRole(
      db, game, integer(req.body?.seat), String(req.body?.cardId || ''), integer(req.body?.version),
    )));
  // Role purchases are placed and reserved BEFORE the deal opens. Old clients
  // cannot bypass the deadline via this legacy endpoint.
  router.post('/buy', (_req: AuthenticatedRequest, res) =>
    res.status(409).json({ error: 'Покупка роли доступна только до начала раздачи' }));
  router.post('/undo', (req: AuthenticatedRequest, res) =>
    void respond(req, res, (db, game) => undoVirtualRole(db, game, integer(req.body?.version))));
  router.post('/reset', (req: AuthenticatedRequest, res) =>
    void respond(req, res, (db, game) => resetVirtualRoleDeal(db, game, integer(req.body?.version))));
  return router;
}

const router = createDealRouter(async (req) => {
  const gameId = integer(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId < 1) return { error: 'Некорректная игра', status: 400 };
  return gameId;
});

/** `/api/tournaments/:tournamentId/games/:gameId/virtual-deal/*`: the game must belong to that tournament. */
export const tournamentVirtualRoleDealRouter = createDealRouter(async (req, db) => {
  const gameId = String(req.params.gameId || '');
  const tournamentId = String(req.params.tournamentId || '');
  const row = gameId && tournamentId
    ? await db.get('SELECT id FROM tournament_games WHERE id = ? AND tournament_id = ? LIMIT 1', [gameId, tournamentId])
    : null;
  if (!row) return { error: 'Игра не найдена', status: 404 };
  return { storage: 'tournament', id: gameId } as DealGame;
});

export default router;
