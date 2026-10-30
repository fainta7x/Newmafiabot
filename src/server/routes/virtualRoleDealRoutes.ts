import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  openVirtualRoleDeal, revealVirtualRole, confirmVirtualRole,
  undoVirtualRole, resetVirtualRoleDeal,
} from '../services/virtualRoleDealService.ts';

const router = Router({ mergeParams: true });
router.use(requireOrganizerAuth);

const integer = (value: unknown): number => Number(value);
const respond = async (req: AuthenticatedRequest, res: any, action: (db: any, id: number) => Promise<unknown>) => {
  try {
    const db = req.db || await getDb();
    const gameId = integer(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId < 1) return res.status(400).json({ error: 'Некорректная игра' });
    return res.json(await action(db, gameId));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.statusCode ? error.message : 'Не удалось выполнить раздачу' });
  }
};

router.post('/open', (req: AuthenticatedRequest, res) =>
  void respond(req, res, (db, gameId) => openVirtualRoleDeal(db, gameId)));
router.post('/reveal', (req: AuthenticatedRequest, res) =>
  void respond(req, res, (db, gameId) => revealVirtualRole(
    db, gameId, integer(req.body?.seat), String(req.body?.cardId || ''), integer(req.body?.version),
  )));
router.post('/confirm', (req: AuthenticatedRequest, res) =>
  void respond(req, res, (db, gameId) => confirmVirtualRole(
    db, gameId, integer(req.body?.seat), integer(req.body?.cardId), integer(req.body?.version),
  )));
router.post('/undo', (req: AuthenticatedRequest, res) =>
  void respond(req, res, (db, gameId) => undoVirtualRole(db, gameId, integer(req.body?.version))));
router.post('/reset', (req: AuthenticatedRequest, res) =>
  void respond(req, res, (db, gameId) => resetVirtualRoleDeal(db, gameId, integer(req.body?.version))));

export default router;
