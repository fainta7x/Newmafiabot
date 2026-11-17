import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  SantaError, cancelSantaEvent, createSantaEvent, drawSanta, joinSanta, leaveSanta, loadSantaForOrganizer, loadSantaForPlayer, santaEveningChoices,
} from '../services/secretSantaService.ts';

/** «Тайный Санта» (owner, 2026-11-17). */
const bodyOf = (req: Request): Record<string, unknown> => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
const send = async (res: Response, next: NextFunction, work: () => Promise<unknown>) => {
  res.set('Cache-Control', 'no-store');
  try { return res.json(await work()); } catch (error) {
    if (error instanceof SantaError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
};

export const playerSantaRouter = Router();
const asPlayer = (work: (req: AuthenticatedRequest, playerId: string) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  const playerId = getPlayerSessionId(req as AuthenticatedRequest);
  if (!playerId) return res.status(401).json({ error: 'Нужен профиль игрока' });
  return send(res, next, () => work(req as AuthenticatedRequest, String(playerId)));
};
playerSantaRouter.get('/santa', asPlayer((req, id) => loadSantaForPlayer(req.db!, id)));
playerSantaRouter.post('/santa/join', asPlayer((req, id) => joinSanta(req.db!, id, bodyOf(req))));
playerSantaRouter.post('/santa/leave', asPlayer((req, id) => leaveSanta(req.db!, id)));

export const organizerSantaRouter = Router();
organizerSantaRouter.use('/santa', requireOrganizerAuth);
organizerSantaRouter.get('/santa', (req, res, next) => send(res, next, async () => ({ ...(await loadSantaForOrganizer(req.db!)), evenings: await santaEveningChoices(req.db!) })));
organizerSantaRouter.post('/santa', (req, res, next) => send(res, next, () => createSantaEvent(req.db!, bodyOf(req))));
organizerSantaRouter.post('/santa/:id/draw', (req, res, next) => send(res, next, () => drawSanta(req.db!, String(req.params.id))));
organizerSantaRouter.post('/santa/:id/cancel', (req, res, next) => send(res, next, () => cancelSantaEvent(req.db!, String(req.params.id))));
