import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { BirthdayPostError, previewBirthdayPost, publishBirthdayPost } from '../services/birthdayPostService.ts';
import { appUrl } from '../services/gameResultCardService.ts';
import {
  GiftCollectionError, removeGiftCollectionRecipient, addGiftCollectionRecipients, closeGiftCollection, listOpenGiftCollections, loadGiftCollectionForOrganizer, loadPlayerGiftContributions,
  openGiftCollection, organizerSetContribution, previewGiftCollection, setPlayerGiftChoice,
} from '../services/giftCollectionService.ts';

const fail = (res: Response, next: NextFunction, error: unknown) => {
  if (error instanceof BirthdayPostError) return res.status(error.status).json({ error: error.message });
  if (error instanceof GiftCollectionError) return res.status(error.status).json({ error: error.message, code: error.code });
  return next(error);
};
const wrap = (work: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await work(req, res)); } catch (error) { fail(res, next, error); }
};

/** Organizer side: mounted at /api/gift-collections. */
export const organizerGiftRouter = Router();
organizerGiftRouter.use(requireOrganizerAuth);
organizerGiftRouter.get('/', wrap((req) => listOpenGiftCollections(req.db!)));
organizerGiftRouter.get('/preview/:honoreeId', wrap((req) => previewGiftCollection(req.db!, String(req.params.honoreeId))));
organizerGiftRouter.post('/', wrap((req) => openGiftCollection(req.db!, {
  honoreeId: String(req.body?.honoree_player_id || ''),
  organizerId: String((req as AuthenticatedRequest).organizerPlayerId || PRIMARY_ORGANIZER_PLAYER_ID),
  excludePlayerIds: Array.isArray(req.body?.exclude_player_ids) ? req.body.exclude_player_ids : [],
  appBaseUrl: appUrl('') || null,
})));
organizerGiftRouter.post('/:id/recipients', wrap((req) => addGiftCollectionRecipients(req.db!, String(req.params.id), req.body?.player_ids, String((req as AuthenticatedRequest).organizerPlayerId || PRIMARY_ORGANIZER_PLAYER_ID), appUrl('') || null)));
organizerGiftRouter.delete('/:id/contributions/:playerId', wrap((req) => removeGiftCollectionRecipient(req.db!, String(req.params.id), String(req.params.playerId))));
organizerGiftRouter.get('/:id', wrap((req) => loadGiftCollectionForOrganizer(req.db!, String(req.params.id))));
organizerGiftRouter.patch('/:id/contributions/:playerId', wrap((req) => organizerSetContribution(
  req.db!, String(req.params.id), String(req.params.playerId),
  String((req as AuthenticatedRequest).organizerPlayerId || PRIMARY_ORGANIZER_PLAYER_ID), req.body || {})));
organizerGiftRouter.post('/:id/close', wrap(async (req) => { await closeGiftCollection(req.db!, String(req.params.id)); return { ok: true }; }));

/** Player side: mounted at /api/player/gift-collections. A player only ever reads and changes their own row. */
export const playerGiftRouter = Router();
const asPlayer = (work: (req: Request, playerId: string) => Promise<unknown>) => wrap(async (req, res) => {
  const id = getPlayerSessionId(req as AuthenticatedRequest);
  if (!id) { res.status(401); throw new GiftCollectionError('Нужен профиль игрока', 401, 'unauthorized'); }
  return work(req, String(id));
});
playerGiftRouter.get('/', asPlayer((req, id) => loadPlayerGiftContributions(req.db!, id)));
playerGiftRouter.put('/:id', asPlayer(async (req, id) => ({
  ...(await setPlayerGiftChoice(req.db!, String(req.params.id), id, { amount: req.body?.amount, decline: req.body?.decline === true })),
})));

/** Birthday congratulation post: the organizer reads the draft, then publishes it on purpose. Mounted at /api/birthday-posts. */
export const birthdayPostRouter = Router();
birthdayPostRouter.use(requireOrganizerAuth);
birthdayPostRouter.get('/:playerId/preview', wrap((req) => previewBirthdayPost(req.db!, String(req.params.playerId), req.query.evening_id ? String(req.query.evening_id) : null, { genitive: req.query.genitive ? String(req.query.genitive) : null, pronoun: req.query.pronoun ? String(req.query.pronoun) : null })));
birthdayPostRouter.post('/:playerId/publish', wrap((req) => publishBirthdayPost(req.db!, String(req.params.playerId), req.body?.evening_id ? String(req.body.evening_id) : null, { genitive: req.body?.genitive ? String(req.body.genitive) : null, pronoun: req.body?.pronoun ? String(req.body.pronoun) : null }, fetch, req.body?.text)));
