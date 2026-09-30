import express from 'express';
import rateLimit from 'express-rate-limit';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { cancelCuratorTask, completeOwnCuratorTask, createCuratorTask, listCuratorTasks, listOwnCuratorTasks } from '../services/curatorTaskService.ts';

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Слишком часто' } });
const fail = (res: express.Response, error: any) => res.status(error?.statusCode || 500).json({ error: error?.message || 'Не получилось' });

/** Organizer: give tasks to curators and follow them. */
export const curatorTaskOrganizerRoutes = express.Router();
curatorTaskOrganizerRoutes.use(limiter);
curatorTaskOrganizerRoutes.get('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await listCuratorTasks(req.db)); } catch (error) { return fail(res, error); }
});
curatorTaskOrganizerRoutes.post('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    return res.status(201).json(await createCuratorTask(req.db, {
      curatorPlayerId: req.body?.curator_player_id, area: req.body?.area, title: req.body?.title, description: req.body?.description, dueAt: req.body?.due_at,
    }));
  } catch (error) { return fail(res, error); }
});
curatorTaskOrganizerRoutes.post('/:id/cancel', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { return res.json(await cancelCuratorTask(req.db, String(req.params.id))); } catch (error) { return fail(res, error); }
});

/** Curator: own tasks on the home screen. */
export const curatorTaskPlayerRoutes = express.Router();
curatorTaskPlayerRoutes.use(limiter);
curatorTaskPlayerRoutes.get('/', async (req: AuthenticatedRequest, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Войдите в приложение' });
  try { res.setHeader('Cache-Control', 'no-store'); return res.json({ tasks: await listOwnCuratorTasks(req.db, playerId) }); } catch (error) { return fail(res, error); }
});
curatorTaskPlayerRoutes.post('/:id/done', async (req: AuthenticatedRequest, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Войдите в приложение' });
  try { return res.json(await completeOwnCuratorTask(req.db, playerId, String(req.params.id), req.body?.note)); } catch (error) { return fail(res, error); }
});
