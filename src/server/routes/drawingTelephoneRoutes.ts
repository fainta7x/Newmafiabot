import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';
import {
  TelephoneError, chooseTelephoneNext, declineTelephoneTurn, guessTelephoneChain, loadTelephoneChain, loadTelephoneList,
  moveTelephoneChain, startTelephoneChain, telephoneCandidates,
} from '../services/drawingTelephoneService.ts';
import { deliverTelephoneNotices } from '../services/drawingTelephoneNotifyService.ts';

/** «Испорченный телефон с рисунками» (owner, 2026-11-16). */
const router = Router();
/** The body only as a plain object: an array or anything else counts as empty. */
const bodyOf = (req: AuthenticatedRequest): Record<string, unknown> => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
const handle = (work: (req: AuthenticatedRequest, id: string) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  try {
    const id = getPlayerSessionId(req as AuthenticatedRequest);
    if (!id) return res.status(401).json({ error: 'Нужен профиль игрока' });
    return res.json(await work(req as AuthenticatedRequest, String(id)));
  } catch (error) { if (error instanceof TelephoneError) return res.status(error.status).json({ error: error.message }); next(error); }
};
const withNotices = async (req: AuthenticatedRequest, result: { notices: Parameters<typeof deliverTelephoneNotices>[1]; chain?: unknown }) => {
  await deliverTelephoneNotices(req.db!, result.notices);
  return { chain: result.chain ?? null };
};
router.get('/telephone', handle((req, id) => loadTelephoneList(req.db!, id)));
router.get('/telephone/players', handle(async (req, id) => ({ items: await telephoneCandidates(req.db!, id, typeof req.query.chain === 'string' ? req.query.chain : null) })));
router.get('/telephone/:id', handle((req, id) => loadTelephoneChain(req.db!, id, String(req.params.id))));
router.post('/telephone', handle(async (req, id) => withNotices(req, await startTelephoneChain(req.db!, id, bodyOf(req)))));
router.post('/telephone/:id/move', handle(async (req, id) => withNotices(req, await moveTelephoneChain(req.db!, id, String(req.params.id), bodyOf(req)))));
router.post('/telephone/:id/choose', handle(async (req, id) => withNotices(req, await chooseTelephoneNext(req.db!, id, String(req.params.id), bodyOf(req)))));
router.post('/telephone/:id/guess', handle(async (req, id) => withNotices(req, await guessTelephoneChain(req.db!, id, String(req.params.id), bodyOf(req)))));
router.post('/telephone/:id/decline', handle(async (req, id) => withNotices(req, await declineTelephoneTurn(req.db!, id, String(req.params.id)))));
export default router;
