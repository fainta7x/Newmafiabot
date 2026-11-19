import { Router, type Response } from 'express';
import { requireOrganizerAuth, getAuthenticatedOrganizerActorId, type AuthenticatedRequest } from '../auth.ts';
import { curseUntil, eveningCurses, liftCurse, setEveningCurse } from '../services/playerCurseService.ts';

/** «Проклятье на понос» for the organizer (owner, 2026-11-19). */
const router = Router();
router.use('/curses', requireOrganizerAuth);
const bodyOf = (req: AuthenticatedRequest): Record<string, unknown> => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
const fail = (res: Response, error: any) => res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не получилось' });

router.get('/curses', async (req: AuthenticatedRequest, res) => {
  try {
    if (typeof req.query.evening_id === 'string') return res.json({ items: await eveningCurses(req.db!, req.query.evening_id) });
    if (typeof req.query.player_id === 'string') return res.json({ until: await curseUntil(req.db!, req.query.player_id) });
    return res.status(400).json({ error: 'Нужен вечер или игрок' });
  } catch (error) { return fail(res, error); }
});
router.post('/curses', async (req: AuthenticatedRequest, res) => {
  try { return res.json({ items: await setEveningCurse(req.db!, bodyOf(req), getAuthenticatedOrganizerActorId(req)) }); } catch (error) { return fail(res, error); }
});
router.post('/curses/lift', async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = typeof bodyOf(req).player_id === 'string' ? String(bodyOf(req).player_id) : '';
    return res.json(await liftCurse(req.db!, playerId));
  } catch (error) { return fail(res, error); }
});
export default router;
