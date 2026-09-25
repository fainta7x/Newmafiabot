import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import {
  addEveningWalkIn,
  loadEveningCloseout,
  settleEveningFromCloseout,
} from '../services/eveningCloseoutService.ts';
import { reconcileNoviceEveningCharges } from '../services/eveningSlotPlanningService.ts';
import { loadEveningRoute } from '../services/eveningRouteService.ts';
import { loadGatheredPost, publishGatheredPost, skipGatheredPost } from '../services/eveningGatheredPostService.ts';
import { cancelEveningForShortfall } from '../services/eveningShortfallService.ts';

const router = Router();

router.post('/:id/closeout/cancel-shortfall', requireOrganizerAuth, async (req, res) => {
  try { return res.json({ cancelled: await cancelEveningForShortfall(req.db, String(req.params.id)) }); }
  catch (error: any) { return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось отменить вечер' }); }
});

router.get('/:id/closeout', requireOrganizerAuth, async (req, res) => {
  try {
    await reconcileNoviceEveningCharges(req.db, String(req.params.id));
    return res.json(await loadEveningCloseout(req.db, String(req.params.id)));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось загрузить закрытие вечера',
      code: error?.code,
      details: error?.details,
    });
  }
});

// The evening route: ordered stages with the real state of each step (see eveningRouteService).
router.get('/:id/route', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json(await loadEveningRoute(req.db, String(req.params.id)));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить маршрут вечера' });
  }
});

// «Мы собрались»: the photo post that opens the first game of a running evening.
router.get('/:id/gathered-post', requireOrganizerAuth, async (req, res) => {
  try { return res.json(await loadGatheredPost(req.db, String(req.params.id))); }
  catch (error: any) { return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось загрузить пост' }); }
});

router.post('/:id/gathered-post', requireOrganizerAuth, async (req, res) => {
  try { return res.json(await publishGatheredPost(req.db, String(req.params.id), req.body || {})); }
  catch (error: any) { return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось опубликовать пост' }); }
});

router.post('/:id/gathered-post/skip', requireOrganizerAuth, async (req, res) => {
  try { return res.json(await skipGatheredPost(req.db, String(req.params.id), req.body?.reason)); }
  catch (error: any) { return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось пропустить пост' }); }
});

router.post('/:id/closeout/walk-in', requireOrganizerAuth, async (req, res) => {
  try {
    return res.status(201).json(await addEveningWalkIn(req.db, String(req.params.id), req.body || {}));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 400)).json({
      error: error?.message || 'Не удалось добавить пришедшего игрока',
      code: error?.code,
    });
  }
});

router.post('/:id/closeout/settle', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json(await settleEveningFromCloseout(req.db, String(req.params.id), {
      allow_missing_game_stats: Boolean(req.body?.allow_missing_game_stats),
    }));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось закрыть вечер',
      code: error?.code,
      details: error?.details,
    });
  }
});

export default router;
